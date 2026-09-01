package com.billbull.backend.pos.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.session.denomination.PosDenominationCountService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The real correction path: {@code apply()} through to the adjustment journal, the superseded
 * approval and the audit.
 *
 * <p>Distinct from {@code PosSessionCorrectionJournalTest}, which proves the journal's shape in
 * isolation. What is exercised here is the wiring — that applying an approved correction actually
 * reaches the posting engine with the right figures, actually supersedes the approval, and
 * actually records both. A correction that overlays cleanly but never posts is exactly the
 * failure this pass exists to rule out: reports would move and the ledger would not.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PosSessionCorrectionEndToEndTest {

    @Mock private PosSessionDenominationCorrectionRepository repo;
    @Mock private CorrectionRequestRepository correctionRequestRepo;
    @Mock private CorrectionRequestService correctionRequestService;
    @Mock private PosSessionRepository posSessionRepository;
    @Mock private FinancialAuditService auditService;
    @Mock private CorrectionOverlayRepository overlayRepository;
    @Mock private PosDenominationCountService denominationCountService;
    @Mock private PostingEngineService postingEngine;
    @Mock private BranchRepository branchRepository;

    private PosSessionDenominationCorrectionService service;
    private PosSession session;

    @BeforeEach
    void setUp() {
        service = new PosSessionDenominationCorrectionService(
                repo, correctionRequestRepo, correctionRequestService, posSessionRepository,
                auditService, new ObjectMapper(), overlayRepository, denominationCountService,
                postingEngine, branchRepository);

        session = new PosSession();
        ReflectionTestUtils.setField(session, "id", 1L);
        session.setStatus(PosSessionStatus.CLOSED);
        session.setBranchId(7L);
        session.setSessionDate(LocalDate.of(2026, 8, 31));
        session.setExpectedCash(bd("5000"));
        session.setVarianceApprovalStatus("APPROVED");
        session.setVarianceApprovedBy("supervisor");
        session.setVarianceApprovedAt(LocalDateTime.of(2026, 8, 31, 20, 0));
        lenient().when(posSessionRepository.findById(1L)).thenReturn(Optional.of(session));
        lenient().when(posSessionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        lenient().when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        lenient().when(overlayRepository.findAppliedForTargetOrderByVersionDesc(any(), any()))
                .thenReturn(List.of());
    }

    // ── Every direction, through the real apply() path ───────────────────────────────────

    @Test
    void shortageCorrectedToZero() { assertAppliesCorrection("4800", "5000"); }

    @Test
    void shortageCorrectedToADifferentShortage() { assertAppliesCorrection("4800", "4900"); }

    @Test
    void shortageCorrectedToAnOverage() { assertAppliesCorrection("4800", "5200"); }

    @Test
    void overageCorrectedToAShortage() { assertAppliesCorrection("5200", "4800"); }

    @Test
    void overageCorrectedToZero() { assertAppliesCorrection("5200", "5000"); }

    // ── The approval the correction supersedes ───────────────────────────────────────────

    @Test
    void applyingACorrectionSupersedesTheOriginalApprovalWithoutErasingIt() {
        stubApply(correction("4800", "5000"), 10L);
        service.apply(10L);

        ArgumentCaptor<PosSession> saved = ArgumentCaptor.forClass(PosSession.class);
        verify(posSessionRepository).save(saved.capture());

        assertEquals("SUPERSEDED_BY_CORRECTION", saved.getValue().getVarianceApprovalStatus());
        // The approval is a statement someone made about a specific figure. It stays exactly as
        // recorded — overwriting the approver or the timestamp would falsify the record of who
        // authorized what.
        assertEquals("supervisor", saved.getValue().getVarianceApprovedBy());
        assertEquals(LocalDateTime.of(2026, 8, 31, 20, 0), saved.getValue().getVarianceApprovedAt());
    }

    @Test
    void aSessionThatNeverNeededApprovalIsLeftAlone() {
        session.setVarianceApprovalStatus("NOT_REQUIRED");
        stubApply(correction("4800", "5000"), 10L);

        service.apply(10L);

        verify(posSessionRepository, never()).save(any());
    }

    // ── Failure and retry ────────────────────────────────────────────────────────────────

    @Test
    void aFailedAdjustmentIsPersistedAndAuditedRatherThanSwallowed() {
        PosSessionDenominationCorrection c = correction("4800", "5000");
        stubApply(c, 10L);
        when(postingEngine.createAdjustmentJournalFromSessionCorrection(
                any(), org.mockito.ArgumentMatchers.anyInt(), any(), any(), any(), any(), any()))
                .thenThrow(new IllegalStateException("period is locked"));

        service.apply(10L);

        // The correction still applied — the overlay is real — but the accounting did not, and
        // that is recorded rather than left as a silent divergence between report and ledger.
        assertEquals("SCLADJ-1-v1", c.getAdjustmentJournalReference());
        assertNotNull(c.getAdjustmentPostingError());
        assertTrue(c.getAdjustmentPostingError().contains("period is locked"));
        assertNull(c.getAdjustmentPostedAt(), "a failed posting must not claim a posted-at time");
    }

    @Test
    void aRetriedApplyIsRefusedSoASecondAdjustmentIsNeverEvenAttempted() {
        // Two independent guarantees, and this is the first: apply() only accepts an APPROVED
        // correction, and applying moves it to APPLIED. A retry is therefore refused outright,
        // so the posting engine is called exactly once no matter how many times the request
        // arrives. Journal-level idempotency on SCLADJ-{id}-v{n} is the second line of defence
        // (proven in PosSessionCorrectionJournalTest) and covers the case where two calls race
        // before either has committed the status change.
        PosSessionDenominationCorrection c = correction("4800", "5000");
        stubApply(c, 10L);

        service.apply(10L);
        assertEquals("SCLADJ-1-v1", c.getAdjustmentJournalReference());
        assertNull(c.getAdjustmentPostingError());

        org.springframework.web.server.ResponseStatusException ex = org.junit.jupiter.api.Assertions
                .assertThrows(org.springframework.web.server.ResponseStatusException.class,
                        () -> service.apply(10L));
        assertTrue(ex.getReason().contains("Only APPROVED corrections can be applied"));

        verify(postingEngine, times(1)).createAdjustmentJournalFromSessionCorrection(
                eq(1L), eq(1), eq(bd("4800")), eq(bd("5000")), eq(bd("5000")), any(), any());
    }

    @Test
    void aSecondCorrectionGetsTheNextVersionedReference() {
        CorrectionOverlay existing = new CorrectionOverlay();
        existing.setVersion(1);
        when(overlayRepository.findAppliedForTargetOrderByVersionDesc(
                eq(CorrectionTargetType.POS_SESSION), eq(1L))).thenReturn(List.of(existing));

        PosSessionDenominationCorrection c = correction("5000", "4900");
        stubApply(c, 11L);

        service.apply(11L);

        assertEquals("SCLADJ-1-v2", c.getAdjustmentJournalReference());
        verify(postingEngine).createAdjustmentJournalFromSessionCorrection(
                eq(1L), eq(2), any(), any(), any(), any(), any());
    }

    // ── The audit records both states ────────────────────────────────────────────────────

    @Test
    void theAuditRecordsTheOriginalAndCorrectedStateAndBothJournalReferences() {
        PosSessionDenominationCorrection c = correction("4800", "5200");
        stubApply(c, 10L);

        service.apply(10L);

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(auditService).logEvent(anyString(), anyString(), eq("APPLIED"), any(), detail.capture());

        String text = detail.getValue();
        assertTrue(text.contains("4800") && text.contains("5200"),
                "the audit must state the count transition, not just that something changed");
        assertTrue(text.contains("SCL-1"), "the original journal must be named");
        assertTrue(text.contains("SCLADJ-1-v1"), "the adjustment journal must be named");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────

    /**
     * Applies a correction and asserts the posting engine was handed exactly the figures the
     * correction represents — original count, corrected count, and the session's own expected
     * cash, which a recount never changes.
     */
    private void assertAppliesCorrection(String originalCounted, String correctedCounted) {
        PosSessionDenominationCorrection c = correction(originalCounted, correctedCounted);
        stubApply(c, 10L);

        service.apply(10L);

        verify(postingEngine).createAdjustmentJournalFromSessionCorrection(
                eq(1L), eq(1), eq(bd(originalCounted)), eq(bd(correctedCounted)),
                eq(bd("5000")), any(), any());
        assertEquals("SCLADJ-1-v1", c.getAdjustmentJournalReference());
        assertNotNull(c.getAdjustmentPostedAt());

        // effective counted − expected = effective variance, as the correction states it.
        BigDecimal effectiveVariance = bd(correctedCounted).subtract(bd("5000"));
        assertEquals(0, c.getCorrectedTotal().subtract(bd("5000")).compareTo(effectiveVariance));
    }

    private PosSessionDenominationCorrection correction(String originalTotal, String correctedTotal) {
        PosSessionDenominationCorrection c = new PosSessionDenominationCorrection();
        ReflectionTestUtils.setField(c, "id", 10L);
        c.setSessionId(1L);
        c.setBranchId(7L);
        c.setCorrectionRequestId(99L);
        c.setStatus(CorrectionRequestStatus.APPROVED);
        c.setOriginalTotal(bd(originalTotal));
        c.setCorrectedTotal(bd(correctedTotal));
        c.setOriginalDenominationJson("{}");
        c.setCorrectedDenominationJson("{}");
        c.setDifference(bd(correctedTotal).subtract(bd(originalTotal)));
        c.setReason("recount");
        return c;
    }

    private void stubApply(PosSessionDenominationCorrection c, Long id) {
        when(repo.findById(id)).thenReturn(Optional.of(c));
        CorrectionRequest request = new CorrectionRequest();
        request.setStatus(CorrectionRequestStatus.APPLIED);
        request.setRequestNumber("CR-0001");
        request.setExecutedBy("admin");
        request.setExecutedAt(LocalDateTime.of(2026, 9, 1, 9, 0));
        when(correctionRequestService.markApplied(99L)).thenReturn(request);
    }

    private static BigDecimal bd(String v) { return new BigDecimal(v); }
}
