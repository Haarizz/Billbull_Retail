package com.billbull.backend.financials.reconciliation;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.generalledger.LedgerEntry;
import com.billbull.backend.financials.generalledger.LedgerEntryRepository;

@Service
public class ReconciliationService {

    private final ReconciliationSessionRepository sessionRepository;
    private final LedgerEntryRepository ledgerEntryRepository;

    public ReconciliationService(ReconciliationSessionRepository sessionRepository,
            LedgerEntryRepository ledgerEntryRepository) {
        this.sessionRepository = sessionRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
    }

    @Transactional
    public ReconciliationSession finalizeReconciliation(ReconciliationRequest request) {
        ReconciliationSession session = new ReconciliationSession();
        session.setBankAccountId(request.getBankAccountId());
        session.setStatementDate(request.getStatementDate());
        session.setStatementBalance(request.getStatementBalance());
        session.setFinalizedAt(LocalDateTime.now());
        session.setFinalizedBy("System User");

        ReconciliationSession savedSession = sessionRepository.save(session);

        if (request.getLedgerEntryIds() != null && !request.getLedgerEntryIds().isEmpty()) {
            List<LedgerEntry> entries = ledgerEntryRepository.findAllById(request.getLedgerEntryIds());
            for (LedgerEntry entry : entries) {
                if (!Boolean.TRUE.equals(entry.isReconciled())) {
                    entry.setReconciled(true);
                    entry.setReconciliationDate(LocalDate.now());
                }
            }
            ledgerEntryRepository.saveAll(entries);
        }

        return savedSession;
    }
}
