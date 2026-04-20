package com.billbull.backend.financials.generalledger;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.period.AccountingPeriodService;
import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;

@Service
public class JournalEntryService {

    private final JournalEntryRepository journalEntryRepository;
    private final JournalVoucherRepository journalVoucherRepository;
    private final LedgerService ledgerService;
    private final AccountRepository accountRepository;
    private final FinancialAuditService auditService;
    private final AccountingPeriodService periodService;

    // Protected Control Accounts (cannot be used in manual JVs)
    private static final Set<String> PROTECTED_ACCOUNT_ROLES = Set.of(
            "ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "INVENTORY", "TAX_PAYABLE");

    public JournalEntryService(JournalEntryRepository journalEntryRepository,
            JournalVoucherRepository journalVoucherRepository,
            LedgerService ledgerService,
            AccountRepository accountRepository,
            FinancialAuditService auditService,
            AccountingPeriodService periodService) {
        this.journalEntryRepository = journalEntryRepository;
        this.journalVoucherRepository = journalVoucherRepository;
        this.ledgerService = ledgerService;
        this.accountRepository = accountRepository;
        this.auditService = auditService;
        this.periodService = periodService;
    }

    public List<JournalEntry> getAllEntries() {
        return journalEntryRepository.findAll();
    }

    public JournalEntry getEntryById(Long id) {
        return journalEntryRepository.findById(id != null ? id : -1L)
                .orElseThrow(() -> new RuntimeException("Journal Entry not found with id: " + id));
    }

    @Transactional
    public JournalVoucher createJournalVoucher(JournalVoucher journalVoucher) {
        journalVoucher.setEntryType(EntryType.MANUAL);
        // Validate Control Account Protection for Manual JVs
        validateManualEntry(journalVoucher);

        String entryNumber = generateEntryNumber();
        journalVoucher.setEntryNumber(entryNumber);

        if (journalVoucher.getStatus() == null || journalVoucher.getStatus().isEmpty()) {
            journalVoucher.setStatus("Draft");
        }

        if (journalVoucher.getLines() != null) {
            for (JournalLine line : journalVoucher.getLines()) {
                line.setJournalEntry(journalVoucher);
            }
        }

        JournalVoucher saved = journalVoucherRepository.save(journalVoucher);
        auditService.logEvent("JOURNAL_VOUCHER", saved.getEntryNumber(), "CREATED",
                saved.getPreparedBy() != null ? saved.getPreparedBy() : "System",
                "JV created with " + saved.getLines().size() + " lines. Status: " + saved.getStatus());
        return saved;
    }

    @Transactional
    public JournalVoucher updateJournalVoucher(Long id, JournalVoucher updatedJournalVoucher) {
        JournalVoucher existingJV = (JournalVoucher) getEntryById(id);

        if ("Posted".equalsIgnoreCase(existingJV.getStatus())) {
            throw new RuntimeException("Cannot update a Posted journal voucher");
        }

        validateManualEntry(updatedJournalVoucher);

        String prevStatus = existingJV.getStatus();
        existingJV.setDate(updatedJournalVoucher.getDate());
        existingJV.setReference(updatedJournalVoucher.getReference());
        existingJV.setNarration(updatedJournalVoucher.getNarration());
        existingJV.setPreparedBy(updatedJournalVoucher.getPreparedBy());
        existingJV.setStatus(updatedJournalVoucher.getStatus());

        existingJV.getLines().clear();
        if (updatedJournalVoucher.getLines() != null) {
            for (JournalLine line : updatedJournalVoucher.getLines()) {
                line.setJournalEntry(existingJV);
                existingJV.getLines().add(line);
            }
        }

        JournalVoucher saved = journalVoucherRepository.save(existingJV);
        auditService.logEvent("JOURNAL_VOUCHER", saved.getEntryNumber(), "UPDATED",
                saved.getPreparedBy() != null ? saved.getPreparedBy() : "System",
                "Status: " + prevStatus + " → " + saved.getStatus());
        return saved;
    }

    @Transactional
    public JournalEntry postEntry(Long id, String postedBy) {
        JournalEntry entry = getEntryById(id);

        if ("Posted".equalsIgnoreCase(entry.getStatus())) {
            throw new RuntimeException("Journal Entry is already posted.");
        }

        // Only allow posting from Approved or Draft (auto-generated system JVs bypass
        // approval)
        boolean isSystemGenerated = "System".equalsIgnoreCase(entry.getPreparedBy());
        if (!isSystemGenerated && !"Approved".equalsIgnoreCase(entry.getStatus())
                && !"Draft".equalsIgnoreCase(entry.getStatus())) {
            throw new RuntimeException(
                    "Journal Entry must be Approved before posting. Current status: " + entry.getStatus());
        }

        // Period close guard
        if (periodService.isDateInClosedPeriod(entry.getDate())) {
            throw new RuntimeException("Cannot post: date " + entry.getDate() + " is in a closed period.");
        }

        // Validate balance
        validateBalance(entry);

        // 🔵 SYNC TO LEDGER: Create LedgerEntry for each JournalLine
        for (JournalLine line : entry.getLines()) {
            LedgerEntry le = new LedgerEntry();
            le.setTransactionDate(entry.getDate());
            le.setVoucherNo(entry.getEntryNumber());
            le.setJournalId(entry.getId().toString());

            String accountCode = line.getAccountCode();
            if (accountCode == null || accountCode.trim().isEmpty()) {
                // Fallback: Try to find code by account name (useful for old entries or
                // incomplete frontend payloads)
                Account acc = accountRepository.findByName(line.getAccount());
                if (acc != null) {
                    accountCode = acc.getCode();
                    line.setAccountCode(accountCode);
                }
            }

            le.setAccountCode(accountCode);
            le.setAccountName(line.getAccount());
            le.setDescription(line.getDescription());
            le.setDebitAmount(line.getDebit());
            le.setCreditAmount(line.getCredit());
            le.setType(line.getDebit() != null && line.getDebit().compareTo(BigDecimal.ZERO) > 0 ? "Debit" : "Credit");
            le.setCfBucket(line.getCfBucket());
            le.setCostCenter(line.getCostCenter());

            ledgerService.recordTransaction(le);
        }

        entry.setStatus("Posted");
        entry.setPostedBy(postedBy != null ? postedBy : "System");
        entry.setPostedAt(LocalDateTime.now());

        JournalEntry saved = journalEntryRepository.save(entry);
        auditService.logEvent("JOURNAL_ENTRY", saved.getEntryNumber(), "POSTED",
                postedBy != null ? postedBy : "System", "Posted. Synced to Ledger.");
        return saved;
    }

    @Transactional
    public JournalVoucher submitForApproval(Long id, String submittedBy) {
        JournalVoucher jv = (JournalVoucher) getEntryById(id);
        if (!"Draft".equalsIgnoreCase(jv.getStatus())) {
            throw new RuntimeException("Only Draft journal vouchers can be submitted for approval.");
        }
        jv.setStatus("Submitted");
        JournalVoucher saved = journalVoucherRepository.save(jv);
        auditService.logEvent("JOURNAL_VOUCHER", saved.getEntryNumber(), "SUBMITTED",
                submittedBy != null ? submittedBy : "System",
                "Submitted for approval.");
        return saved;
    }

    @Transactional
    public JournalVoucher approveJournalVoucher(Long id, String approvedBy) {
        JournalVoucher jv = (JournalVoucher) getEntryById(id);
        if (!"Submitted".equalsIgnoreCase(jv.getStatus())) {
            throw new RuntimeException("Only Submitted journal vouchers can be approved.");
        }
        jv.setStatus("Approved");
        jv.setApprovedBy(approvedBy != null ? approvedBy : "System");
        jv.setApprovedAt(LocalDateTime.now());
        JournalVoucher saved = journalVoucherRepository.save(jv);
        auditService.logEvent("JOURNAL_VOUCHER", saved.getEntryNumber(), "APPROVED",
                approvedBy != null ? approvedBy : "System", "Journal voucher approved.");
        return saved;
    }

    @Transactional
    public JournalVoucher rejectJournalVoucher(Long id, String rejectedBy, String reason) {
        JournalVoucher jv = (JournalVoucher) getEntryById(id);
        if (!"Submitted".equalsIgnoreCase(jv.getStatus())) {
            throw new RuntimeException("Only Submitted journal vouchers can be rejected.");
        }
        jv.setStatus("Rejected");
        jv.setRejectionReason(reason);
        JournalVoucher saved = journalVoucherRepository.save(jv);
        auditService.logEvent("JOURNAL_VOUCHER", saved.getEntryNumber(), "REJECTED",
                rejectedBy != null ? rejectedBy : "System",
                "Rejected. Reason: " + reason);
        return saved;
    }

    @Transactional
    public void deleteJournalVoucher(Long id) {
        JournalVoucher jv = (JournalVoucher) getEntryById(id);
        if ("Posted".equalsIgnoreCase(jv.getStatus())) {
            throw new RuntimeException("Cannot delete a Posted journal voucher");
        }
        auditService.logEvent("JOURNAL_VOUCHER", jv.getEntryNumber(), "DELETED", "System",
                "JV deleted. Was in status: " + jv.getStatus());
        journalVoucherRepository.delete(jv);
    }

    public void validateManualEntry(JournalEntry entry) {
        // System-generated entries bypass control account protection
        if (entry.getEntryType() == EntryType.SYSTEM)
            return;

        for (JournalLine line : entry.getLines()) {
            Account account = accountRepository.findByCode(line.getAccountCode());
            if (account != null && account.getTaxRole() != null) {
                if (PROTECTED_ACCOUNT_ROLES.contains(account.getTaxRole())) {
                    throw new RuntimeException(
                            "Manual entries to protected account '" + account.getName() + "' are not allowed.");
                }
            }
            if (account != null && account.getControlAccount() != null && account.getControlAccount()) {
                throw new RuntimeException(
                        "Manual entries to control account '" + account.getName() + "' are not allowed.");
            }
        }
    }

    private void validateBalance(JournalEntry entry) {
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        for (JournalLine line : entry.getLines()) {
            totalDebit = totalDebit.add(line.getDebit() != null ? line.getDebit() : BigDecimal.ZERO);
            totalCredit = totalCredit.add(line.getCredit() != null ? line.getCredit() : BigDecimal.ZERO);
        }
        // Round to 2 decimal places (currency precision) before comparing to
        // eliminate floating-point noise from double → BigDecimal conversions.
        BigDecimal roundedDebit  = totalDebit.setScale(2, RoundingMode.HALF_UP);
        BigDecimal roundedCredit = totalCredit.setScale(2, RoundingMode.HALF_UP);
        if (roundedDebit.compareTo(roundedCredit) != 0) {
            throw new RuntimeException("Journal is not balanced. Debit: " + roundedDebit + ", Credit: " + roundedCredit);
        }
    }

    public synchronized String generateEntryNumber() {
        long count = journalEntryRepository.count(); // Simple count for the base entity
        long next = count + 1;
        String candidate = String.format("JE-%06d", next);
        while (journalEntryRepository.existsByEntryNumber(candidate)) {
            next++;
            candidate = String.format("JE-%06d", next);
        }
        return candidate;
    }

    // Support for approval workflow if needed (re-implement if required by
    // JournalVoucher)
}
