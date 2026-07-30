package com.billbull.backend.pos.admin;

import com.billbull.backend.financials.audit.FinancialAuditLog;
import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Enterprise Console &gt; POS Administration &gt; Audit View (Phase 5 §9). Purely read-only —
 * links together data that already exists across three subsystems without ever writing to any
 * of them: {@link FinancialAuditService}'s structured audit trail (already keyed by each
 * correction's {@code requestNumber} — see {@code CorrectionRequestService}/{@code
 * PosSessionDenominationCorrectionService}/{@code PosTransactionCorrectionService}, all of
 * which call {@code auditService.logEvent} with the same requestNumber as entityId), and
 * {@link JournalEntryRepository} for the offsetting GL entries a Phase 4 transaction
 * correction posted (referenced as {@code TXNCORR-REV-{id}}/{@code TXNCORR-APPLY-{id}}).
 */
@Service
public class PosAdminAuditService {

    /** Every entity type a POS Administration correction ever logs against — see the
     *  {@code ENTITY_TYPE} constant in each of the four correction services. */
    private static final List<String> CORRECTION_ENTITY_TYPES = List.of(
            "POS_CORRECTION_REQUEST", "POS_SESSION_DENOMINATION_CORRECTION",
            "POS_TRANSACTION_CORRECTION", "POS_CASH_MOVEMENT_CATEGORY");

    private final FinancialAuditService auditService;
    private final JournalEntryRepository journalEntryRepository;
    private final PosTransactionCorrectionRepository transactionCorrectionRepository;

    public PosAdminAuditService(FinancialAuditService auditService,
                                 JournalEntryRepository journalEntryRepository,
                                 PosTransactionCorrectionRepository transactionCorrectionRepository) {
        this.auditService = auditService;
        this.journalEntryRepository = journalEntryRepository;
        this.transactionCorrectionRepository = transactionCorrectionRepository;
    }

    /** Merged, timestamp-descending audit trail across every POS Administration entity type —
     *  the Audit tab's default view before a specific correction is selected. Bounded to this
     *  governance module's own audit volume (four scoped entity types), not the system-wide
     *  audit_log table. */
    @Transactional(readOnly = true)
    public List<FinancialAuditLog> getRecentAuditActivity(int limit) {
        List<FinancialAuditLog> merged = new ArrayList<>();
        for (String entityType : CORRECTION_ENTITY_TYPES) {
            merged.addAll(auditService.getByEntityType(entityType));
        }
        merged.sort(Comparator.comparing(FinancialAuditLog::getTimestamp).reversed());
        return merged.size() > limit ? merged.subList(0, limit) : merged;
    }

    /** Full merged audit trail for one correction, across every entity type it was ever logged
     *  under — request lifecycle, denomination/transaction-specific events, all keyed by the
     *  same {@code requestNumber}. */
    @Transactional(readOnly = true)
    public List<FinancialAuditLog> getAuditTrailForRequest(String requestNumber) {
        List<FinancialAuditLog> merged = new ArrayList<>();
        for (String entityType : CORRECTION_ENTITY_TYPES) {
            merged.addAll(auditService.getAuditTrail(entityType, requestNumber));
        }
        merged.sort(Comparator.comparing(FinancialAuditLog::getTimestamp));
        return merged;
    }

    @Transactional(readOnly = true)
    public List<FinancialAuditLog> getCategoryAuditTrail(String categoryCode) {
        return auditService.getAuditTrail("POS_CASH_MOVEMENT_CATEGORY", categoryCode);
    }

    /** Flat, non-lazy view of a journal entry — computed here (inside the transaction) rather
     *  than returning the raw {@link JournalEntry} entity, since its {@code lines}/{@code
     *  branch} associations are LAZY and would risk a LazyInitializationException once Jackson
     *  serializes the response after the transaction closes. */
    public record LinkedJournalView(String entryNumber, String reference, String narration, String status, LocalDate date) {
        static LinkedJournalView from(JournalEntry j) {
            return new LinkedJournalView(j.getEntryNumber(), j.getReference(), j.getNarration(), j.getStatus(), j.getDate());
        }
    }

    /** The reversal/repost journal pair a Phase 4 transaction correction posted, if any (a
     *  customer correction posts neither — there is no GL dimension to correct). Never creates
     *  or edits a journal; purely a lookup by the exact reference each posting used. */
    @Transactional(readOnly = true)
    public List<LinkedJournalView> getLinkedJournals(Long transactionCorrectionId) {
        List<LinkedJournalView> journals = new ArrayList<>();
        journalEntryRepository.findByReference("TXNCORR-REV-" + transactionCorrectionId)
                .ifPresent(j -> journals.add(LinkedJournalView.from(j)));
        journalEntryRepository.findByReference("TXNCORR-APPLY-" + transactionCorrectionId)
                .ifPresent(j -> journals.add(LinkedJournalView.from(j)));
        return journals;
    }

    /** Convenience: linked journals for a correction identified by its {@code
     *  CorrectionRequest} id rather than the {@code PosTransactionCorrection} row id — a
     *  single indexed lookup, not a table scan. */
    @Transactional(readOnly = true)
    public List<LinkedJournalView> getLinkedJournalsForCorrectionRequest(Long correctionRequestId) {
        return transactionCorrectionRepository.findByCorrectionRequestId(correctionRequestId)
                .map(c -> getLinkedJournals(c.getId()))
                .orElseGet(List::of);
    }
}
