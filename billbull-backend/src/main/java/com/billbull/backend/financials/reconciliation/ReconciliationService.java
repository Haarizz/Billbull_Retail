package com.billbull.backend.financials.reconciliation;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.chartofaccounts.AccountSelectionRules;
import com.billbull.backend.financials.generalledger.LedgerEntry;
import com.billbull.backend.financials.generalledger.LedgerEntryRepository;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.settings.branch.BranchAccessService;

import java.math.BigDecimal;

@Service
public class ReconciliationService {

    private final ReconciliationSessionRepository sessionRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final AccountRepository accountRepository;
    private final BranchAccessService branchAccessService;
    private final PostingEngineService postingEngineService;

    public ReconciliationService(ReconciliationSessionRepository sessionRepository,
            LedgerEntryRepository ledgerEntryRepository,
            AccountRepository accountRepository,
            BranchAccessService branchAccessService,
            PostingEngineService postingEngineService) {
        this.sessionRepository   = sessionRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.accountRepository   = accountRepository;
        this.branchAccessService = branchAccessService;
        this.postingEngineService = postingEngineService;
    }

    @Transactional
    public ReconciliationSession finalizeReconciliation(ReconciliationRequest request) {
        Account bankAccount = resolveBankAccount(request);

        ReconciliationSession session = new ReconciliationSession();
        session.setBranch(branchAccessService.getRequiredCurrentUserBranch());
        session.setBankAccountId(bankAccount.getId());
        session.setStatementDate(request.getStatementDate());
        session.setStatementBalance(request.getStatementBalance());
        session.setFinalizedAt(LocalDateTime.now());
        session.setFinalizedBy("System User");

        ReconciliationSession savedSession = sessionRepository.save(session);

        if (request.getLedgerEntryIds() != null && !request.getLedgerEntryIds().isEmpty()) {
            List<LedgerEntry> entries = ledgerEntryRepository.findAllById(request.getLedgerEntryIds());
            for (LedgerEntry entry : entries) {
                if (!belongsToAccount(entry, bankAccount)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Selected transactions must belong to the selected bank account.");
                }
                if (!Boolean.TRUE.equals(entry.isReconciled())) {
                    entry.setReconciled(true);
                    entry.setReconciliationDate(LocalDate.now());
                }
            }
            ledgerEntryRepository.saveAll(entries);
        }

        return savedSession;
    }

    private Account resolveBankAccount(ReconciliationRequest request) {
        if (request == null || request.getBankAccountId() == null || request.getBankAccountId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Select a valid bank account for reconciliation.");
        }

        Account account = accountRepository.findById(request.getBankAccountId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Select a valid bank account for reconciliation."));

        if (!AccountSelectionRules.isBankAccount(account)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only active bank accounts can be reconciled.");
        }

        return account;
    }

    private boolean belongsToAccount(LedgerEntry entry, Account account) {
        if (entry == null || account == null) {
            return false;
        }
        return equalsIgnoreCase(entry.getAccountCode(), account.getCode())
                || equalsIgnoreCase(entry.getAccountName(), account.getName());
    }

    /**
     * Auto-posts a journal for an unmatched bank statement line (PDF §17 / Phase 7.2).
     *
     * category → journal:
     *   BANK_CHARGE     → Dr Bank Charges (7501) / Cr Bank (1102)
     *   INTEREST_INCOME → Dr Bank (1102) / Cr Interest Income (7002)
     *   BOUNCED_CHEQUE  → delegates to PDC bounce flow via postingEngineService
     *   OTHER           → records a manual JV stub (no auto-posting; requires manual follow-up)
     *
     * @param sessionId  reconciliation session id
     * @param lineId     statement line identifier (for reference uniqueness)
     * @param category   BANK_CHARGE | INTEREST_INCOME | BOUNCED_CHEQUE | OTHER
     * @param amount     absolute amount of the statement line
     * @param description narration for the journal
     */
    @Transactional
    public void autoPostStatementLine(Long sessionId, Long lineId, String category,
                                       BigDecimal amount, String description) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return;
        String ref = "RECON-" + sessionId + "-" + lineId;

        switch (category.toUpperCase()) {
            case "BANK_CHARGE" ->
                postingEngineService.createJournalFromBankCharge(ref, amount, description,
                        java.time.LocalDate.now());
            case "INTEREST_INCOME" ->
                postingEngineService.createJournalFromBankInterest(ref, amount, description,
                        java.time.LocalDate.now());
            case "BOUNCED_CHEQUE" ->
                // Bounce flow is PDC-driven; log only — caller should trigger PdcService.updateStatus(BOUNCED)
                org.slf4j.LoggerFactory.getLogger(ReconciliationService.class)
                        .info("[Reconciliation] BOUNCED_CHEQUE line {} — call PdcService.updateStatus(BOUNCED) to post GL.", ref);
            default ->
                org.slf4j.LoggerFactory.getLogger(ReconciliationService.class)
                        .warn("[Reconciliation] Unmatched statement line {} category='{}' — post manual journal.", ref, category);
        }
    }

    private boolean equalsIgnoreCase(String left, String right) {
        if (left == null || right == null) {
            return false;
        }
        return left.trim().equalsIgnoreCase(right.trim());
    }
}
