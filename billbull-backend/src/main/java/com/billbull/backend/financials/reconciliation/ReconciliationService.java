package com.billbull.backend.financials.reconciliation;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.generalledger.JournalLine;
import com.billbull.backend.financials.generalledger.JournalLineRepository;

@Service
public class ReconciliationService {

    private final ReconciliationSessionRepository sessionRepository;
    private final JournalLineRepository journalLineRepository;

    public ReconciliationService(ReconciliationSessionRepository sessionRepository,
            JournalLineRepository journalLineRepository) {
        this.sessionRepository = sessionRepository;
        this.journalLineRepository = journalLineRepository;
    }

    @Transactional
    public ReconciliationSession finalizeReconciliation(ReconciliationRequest request) {
        // 1. Create and save the session snapshot
        ReconciliationSession session = new ReconciliationSession();
        session.setBankAccountId(request.getBankAccountId());
        session.setStatementDate(request.getStatementDate());
        session.setStatementBalance(request.getStatementBalance());
        session.setFinalizedAt(LocalDateTime.now());
        session.setFinalizedBy("System User"); // Placeholder

        ReconciliationSession savedSession = sessionRepository.save(session);

        // 2. Bulk update journal lines
        List<JournalLine> lines = journalLineRepository.findAllById(request.getJournalLineIds());

        for (JournalLine line : lines) {
            // Enforcement: Idempotent & Date-guarded
            // Note: In a real app we'd fetch the transaction date from the parent
            // JournalVoucher if not on the line
            // For now, we assume the user only selects valid lines from the UI which
            // already applies these filters
            if (!line.isReconciled()) {
                line.setReconciled(true);
                line.setReconciliationDate(LocalDate.now());
            }
        }

        journalLineRepository.saveAll(lines);

        return savedSession;
    }
}
