package com.billbull.backend.financials.expense;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.security.BranchContextHolder;

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

    @Autowired
    private BranchRepository branchRepository;

    public List<Expense> getAllExpenses() {
        return branchAccessService.filterBranchScopedByBranch(
                expenseRepository.findAllByOrderByDateDesc(), Expense::getBranch);
    }

    public Expense getExpenseById(Long id) {
        return expenseRepository.findById(id).orElse(null);
    }

    public Expense createExpense(Expense expense) {
        // If the request body explicitly provides a branch id (form selection)
        // and the session is in "All Branches" mode (no specific branch in header),
        // use that explicit branch. Otherwise fall back to the session branch.
        Long bodyBranchId = expense.getBranch() != null ? expense.getBranch().getId() : null;
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        boolean isAllBranches = ctx != null && ctx.isAllBranches() && ctx.activeBranchId() == null;
        if (bodyBranchId != null && isAllBranches) {
            expense.setBranch(branchRepository.findById(bodyBranchId)
                    .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.BAD_REQUEST,
                            "Selected branch not found.")));
        } else {
            expense.setBranch(branchAccessService.getRequiredCurrentUserBranch());
        }
        // Recalculate derived fields to ensure consistency
        if (expense.getAmount() != null && expense.getTaxRate() != null) {
            // taxRate is a percentage (not money); amount/taxAmount/total are money.
            BigDecimal taxAmount = expense.getAmount()
                    .multiply(BigDecimal.valueOf(expense.getTaxRate()))
                    .divide(BigDecimal.valueOf(100))
                    .setScale(2, RoundingMode.HALF_UP);
            expense.setTaxAmount(taxAmount);
            expense.setTotal(expense.getAmount().add(taxAmount));
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
                BigDecimal taxAmount = existingExpense.getAmount()
                        .multiply(BigDecimal.valueOf(existingExpense.getTaxRate()))
                        .divide(BigDecimal.valueOf(100))
                        .setScale(2, RoundingMode.HALF_UP);
                existingExpense.setTaxAmount(taxAmount);
                existingExpense.setTotal(existingExpense.getAmount().add(taxAmount));
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
