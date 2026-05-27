package com.billbull.backend.financials.expense;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.settings.branch.BranchAccessService;

@Service
public class ExpenseService {

    @Autowired
    private ExpenseRepository expenseRepository;

    @Autowired
    private PostingEngineService postingEngineService;

    @Autowired
    private FinancialAuditService auditService;

    @Autowired
    private BranchAccessService branchAccessService;

    public List<Expense> getAllExpenses() {
        return branchAccessService.filterBranchScopedByBranch(
                expenseRepository.findAllByOrderByDateDesc(), Expense::getBranch);
    }

    public Expense getExpenseById(Long id) {
        return expenseRepository.findById(id).orElse(null);
    }

    public Expense createExpense(Expense expense) {
        expense.setBranch(branchAccessService.getRequiredCurrentUserBranch());
        // Recalculate derived fields to ensure consistency
        if (expense.getAmount() != null && expense.getTaxRate() != null) {
            double taxAmount = (expense.getAmount() * expense.getTaxRate()) / 100;
            expense.setTaxAmount(taxAmount);
            expense.setTotal(expense.getAmount() + taxAmount);
        }

        Expense saved = expenseRepository.save(expense);

        auditService.logEvent("EXPENSE", "EXP-" + saved.getId(), "CREATED",
                "System", "Expense created. Status: " + saved.getStatus() + ", Amount: " + saved.getTotal());

        // 🔵 AUTO-GENERATE JOURNAL ENTRY when expense status is "Paid"
        if ("Paid".equalsIgnoreCase(saved.getStatus())) {
            postingEngineService.createJournalFromExpense(saved);
        }

        return saved;
    }

    public Expense updateExpense(Long id, Expense expenseDetails) {
        Optional<Expense> expenseOptional = expenseRepository.findById(id);
        if (expenseOptional.isPresent()) {
            Expense existingExpense = expenseOptional.get();
            String previousStatus = existingExpense.getStatus();

            Long existingBranchId = existingExpense.getBranch() != null ? existingExpense.getBranch().getId() : null;
            branchAccessService.assertTransactionBranchAccessible(existingBranchId, "Expense");
            // Branch is immutable on update — never copy from expenseDetails.

            existingExpense.setDate(expenseDetails.getDate());
            existingExpense.setVendor(expenseDetails.getVendor());
            existingExpense.setCategory(expenseDetails.getCategory());
            existingExpense.setGlAccountId(expenseDetails.getGlAccountId());
            existingExpense.setCostCenter(expenseDetails.getCostCenter());
            existingExpense.setLocation(expenseDetails.getLocation());
            existingExpense.setAmount(expenseDetails.getAmount());
            existingExpense.setTaxRate(expenseDetails.getTaxRate());
            existingExpense.setStatus(expenseDetails.getStatus());
            existingExpense.setPaymentMode(expenseDetails.getPaymentMode());
            existingExpense.setPaymentAccountId(expenseDetails.getPaymentAccountId());
            existingExpense.setNotes(expenseDetails.getNotes());

            // Recalculate
            if (existingExpense.getAmount() != null && existingExpense.getTaxRate() != null) {
                double taxAmount = (existingExpense.getAmount() * existingExpense.getTaxRate()) / 100;
                existingExpense.setTaxAmount(taxAmount);
                existingExpense.setTotal(existingExpense.getAmount() + taxAmount);
            }

            Expense saved = expenseRepository.save(existingExpense);

            // FIX: 🔵 AUTO-GENERATE JOURNAL ENTRY when status transitions to "Paid"
            boolean isNewlyPaid = "Paid".equalsIgnoreCase(saved.getStatus())
                    && !"Paid".equalsIgnoreCase(previousStatus);
            if (isNewlyPaid) {
                postingEngineService.createJournalFromExpense(saved);
            }

            auditService.logEvent("EXPENSE", "EXP-" + saved.getId(), "UPDATED",
                    "System", "Status: " + previousStatus + " → " + saved.getStatus());

            return saved;
        }
        return null;
    }

    public boolean deleteExpense(Long id) {
        Expense existing = getExpenseById(id);
        if (existing != null
                && ("Paid".equalsIgnoreCase(existing.getStatus()) || "Posted".equalsIgnoreCase(existing.getStatus()))) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Paid or posted expenses cannot be deleted.");
        }

        if (existing != null) {
            auditService.logEvent("EXPENSE", "EXP-" + id, "DELETED", "System", "Expense deleted.");
            expenseRepository.deleteById(id);
            return true;
        }
        return false;
    }
}
