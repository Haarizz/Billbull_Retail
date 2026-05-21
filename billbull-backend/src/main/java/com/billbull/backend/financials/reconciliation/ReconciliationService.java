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

@Service
public class ReconciliationService {

    private final ReconciliationSessionRepository sessionRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final AccountRepository accountRepository;

    public ReconciliationService(ReconciliationSessionRepository sessionRepository,
            LedgerEntryRepository ledgerEntryRepository,
            AccountRepository accountRepository) {
        this.sessionRepository = sessionRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.accountRepository = accountRepository;
    }

    @Transactional
    public ReconciliationSession finalizeReconciliation(ReconciliationRequest request) {
        Account bankAccount = resolveBankAccount(request);

        ReconciliationSession session = new ReconciliationSession();
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

    private boolean equalsIgnoreCase(String left, String right) {
        if (left == null || right == null) {
            return false;
        }
        return left.trim().equalsIgnoreCase(right.trim());
    }
}
