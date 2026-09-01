package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.pos.admin.CorrectionTargetType;
import com.billbull.backend.pos.admin.EffectiveCorrectionViewService;
import com.billbull.backend.sales.payment.PaymentRepository;

import jakarta.persistence.EntityManager;

/**
 * Day-level reconciliation, aggregated from frozen session snapshots.
 *
 * <p>The day had never reconciled physical cash: its only check compared one derivation of
 * EXPECTED against another, which can detect data drift but never that the money is missing.
 * These tests pin down the real reconciliation and, just as importantly, what it refuses to
 * claim when only some drawers were counted.
 */
@ExtendWith(MockitoExtension.class)
class PosDayCashReconciliationTest {

    @Mock private PaymentRepository paymentRepository;
    @Mock private ReceiptVoucherRepository receiptVoucherRepository;
    @Mock private EffectiveCorrectionViewService effectiveCorrectionViewService;
    @Mock private EntityManager entityManager;

    private PosCashReconciliationService service;

    @BeforeEach
    void setUp() {
        service = new PosCashReconciliationService(
                paymentRepository, receiptVoucherRepository, effectiveCorrectionViewService, entityManager);
        lenient().when(effectiveCorrectionViewService.resolveOverlays(any(), anyList(), any()))
                .thenAnswer(inv -> inv.getArgument(1));
        lenient().when(paymentRepository.sumTenderByModeForSessions(any())).thenReturn(List.of());
        lenient().when(receiptVoucherRepository.findByPosSessionId(anyLong())).thenReturn(List.of());
        lenient().when(effectiveCorrectionViewService.getEffectiveView(
                org.mockito.ArgumentMatchers.eq(CorrectionTargetType.POS_SESSION), anyLong()))
                .thenReturn(uncorrected());
    }

    // ── 1-3: counted days ────────────────────────────────────────────────────────────────

    @Test
    void allSessionsBalancedGivesABalancedDayWithZeroVariance() {
        var day = service.summarizeDay(List.of(
                closed(1L, "500", "500"), closed(2L, "300", "300")));

        assertMoney("800", day.expectedCash());
        assertMoney("800", day.countedCash());
        assertMoney("0", day.cashVariance());
        assertEquals(PosCashReconciliationStatus.BALANCED, day.status());
        assertEquals(0, day.sessionsWithVariance());
        assertEquals(0, day.uncountedSessionCount());
        assertTrue(day.isFullyCounted());
    }

    @Test
    void oneSessionOverMakesTheDayOver() {
        var day = service.summarizeDay(List.of(
                closed(1L, "500", "530"), closed(2L, "300", "300")));

        assertMoney("830", day.countedCash());
        assertMoney("30", day.cashVariance());
        assertEquals(PosCashReconciliationStatus.OVER, day.status());
        assertEquals(1, day.sessionsWithVariance());
    }

    @Test
    void oneSessionShortMakesTheDayShort() {
        var day = service.summarizeDay(List.of(
                closed(1L, "500", "480"), closed(2L, "300", "300")));

        assertMoney("780", day.countedCash());
        assertMoney("-20", day.cashVariance());
        assertEquals(PosCashReconciliationStatus.SHORT, day.status());
        assertEquals(1, day.sessionsWithVariance());
    }

    // ── 4-6: uncounted, and the partial-day rule ─────────────────────────────────────────

    @Test
    void aSingleUncountedSessionIsNotCounted() {
        var day = service.summarizeDay(List.of(uncounted(1L, "500")));

        assertMoney("500", day.expectedCash());
        assertNull(day.countedCash(), "no drawer was counted, so there is no counted cash");
        assertNull(day.cashVariance());
        assertEquals(PosCashReconciliationStatus.NOT_COUNTED, day.status());
        assertEquals(1, day.uncountedSessionCount());
    }

    @Test
    void aDayWithOneBalancedAndOneUncountedSessionIsNotBalanced() {
        // The rule that matters: one verified till does not make the day verified. Labelling
        // this BALANCED would hide the drawer nobody counted.
        var day = service.summarizeDay(List.of(
                closed(1L, "500", "500"), uncounted(2L, "300")));

        assertEquals(PosCashReconciliationStatus.NOT_COUNTED, day.status());
        assertEquals(1, day.uncountedSessionCount());
        assertEquals(1, day.countedSessionCount());
        assertFalse(day.isFullyCounted());
    }

    @Test
    void aPartlyCountedDayStatesNoDayVarianceButStillReportsTheCountedSubset() {
        // Σ counted(500) − Σ expected(800) would read as 300 short, which is not a finding: it
        // is the uncounted drawer showing up as missing money. The day withholds a variance and
        // reports the honest figure for the drawers that were actually verified.
        var day = service.summarizeDay(List.of(
                closed(1L, "500", "500"), uncounted(2L, "300")));

        assertMoney("800", day.expectedCash());
        assertMoney("500", day.countedCash());
        assertNull(day.cashVariance(), "a partly counted day cannot state a day variance");
        assertMoney("500", day.countedSessionsExpectedCash());
        assertMoney("0", day.countedSessionsVariance());
    }

    @Test
    void allSessionsUncountedYieldsNoCountedCashAtAll() {
        var day = service.summarizeDay(List.of(uncounted(1L, "500"), uncounted(2L, "300")));

        assertMoney("800", day.expectedCash());
        assertNull(day.countedCash());
        assertNull(day.cashVariance());
        assertEquals(2, day.uncountedSessionCount());
    }

    @Test
    void aDayWithNoSessionsIsNotCounted() {
        var day = service.summarizeDay(List.of());
        assertMoney("0", day.expectedCash());
        assertNull(day.countedCash());
        assertEquals(PosCashReconciliationStatus.NOT_COUNTED, day.status());
    }

    // ── 11: counted zero survives aggregation ────────────────────────────────────────────

    @Test
    void aDrawerCountedAsEmptyContributesARealZeroNotAnAbsence() {
        var day = service.summarizeDay(List.of(closed(1L, "0", "0"), closed(2L, "300", "300")));

        assertMoney("300", day.countedCash());
        assertMoney("0", day.cashVariance());
        assertEquals(0, day.uncountedSessionCount(), "counted-zero is counted");
        assertEquals(2, day.countedSessionCount());
    }

    // ── 12: historical rows ──────────────────────────────────────────────────────────────

    @Test
    void aHistoricalSessionWithASnapshotButNoCountedAtStillCounts() {
        PosSession historical = closed(1L, "500", "500");
        historical.setCountedAt(null);   // predates the counted_at column
        historical.setClosingDenominationsJson("{\"500\":1}");

        var day = service.summarizeDay(List.of(historical));

        assertMoney("500", day.countedCash());
        assertEquals(0, day.uncountedSessionCount());
    }

    @Test
    void aHistoricalSessionWithNeitherSnapshotNorCountIsNotCounted() {
        // Never fabricate a count for a session that has no evidence of one.
        var day = service.summarizeDay(List.of(uncounted(1L, "500")));
        assertNull(day.countedCash());
        assertEquals(1, day.uncountedSessionCount());
    }

    // ── 14: corrections after close ──────────────────────────────────────────────────────

    @Test
    void anApprovedCorrectionRestatesTheDayThroughTheSameOverlay() {
        PosSession session = closed(1L, "500", "480");   // recorded 20 short
        Map<String, Object> corrected = new LinkedHashMap<>();
        corrected.put("corrected", true);
        corrected.put("effectiveTotal", new BigDecimal("500"));
        when(effectiveCorrectionViewService.getEffectiveView(CorrectionTargetType.POS_SESSION, 1L))
                .thenReturn(corrected);

        var day = service.summarizeDay(List.of(session));

        assertMoney("500", day.countedCash());
        assertMoney("0", day.cashVariance(), "the correction must move counted and variance together");
        assertMoney("500", day.expectedCash(), "and must leave expected cash alone");
        assertEquals(PosCashReconciliationStatus.BALANCED, day.status());
    }

    // ── Frozen, not recomputed ───────────────────────────────────────────────────────────

    @Test
    void aClosedSessionReportsWhatItWasFrozenWithNotWhatTodaysDataSays() {
        // Live tender that landed after the close must not restate a counted drawer. Asserted
        // twice over: the frozen figure is returned, AND the live tender ledger is never even
        // consulted -- so a closed session cannot drift as later data arrives.
        lenient().when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", new BigDecimal("9999"), 1L }));

        PosCashReconciliationResult r = service.frozen(closed(1L, "500", "500"));

        assertMoney("500", r.expectedCash());
        assertMoney("0", r.variance());
        org.mockito.Mockito.verify(paymentRepository, org.mockito.Mockito.never())
                .sumTenderByModeForSessions(any());
    }

    @Test
    void anOpenSessionIsReconciledLiveBecauseNothingIsFrozenYet() {
        PosSession open = new PosSession();
        ReflectionTestUtils.setField(open, "id", 9L);
        open.setStatus(PosSessionStatus.OPEN);
        open.setOpeningCash(new BigDecimal("100"));
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", new BigDecimal("50"), 1L }));

        assertMoney("150", service.frozen(open).expectedCash());
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────────────────

    private static Map<String, Object> uncorrected() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("corrected", false);
        return m;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertMoney(expected, actual, null);
    }

    private static void assertMoney(String expected, BigDecimal actual, String because) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual + (because == null ? "" : " — " + because));
    }

    /** A closed, counted drawer with the given frozen expected and counted figures. */
    private PosSession closed(Long id, String expectedCash, String countedCash) {
        PosSession s = new PosSession();
        ReflectionTestUtils.setField(s, "id", id);
        s.setStatus(PosSessionStatus.CLOSED);
        s.setExpectedCash(new BigDecimal(expectedCash));
        s.setClosingCash(new BigDecimal(countedCash));
        s.setClosingDenominationsJson("{}");
        s.setCountedAt(LocalDateTime.of(2026, 8, 31, 20, 0));
        s.setClosedAt(LocalDateTime.of(2026, 8, 31, 20, 0));
        return s;
    }

    /** A closed drawer nobody counted. */
    private PosSession uncounted(Long id, String expectedCash) {
        PosSession s = new PosSession();
        ReflectionTestUtils.setField(s, "id", id);
        s.setStatus(PosSessionStatus.CLOSED);
        s.setExpectedCash(new BigDecimal(expectedCash));
        s.setClosedAt(LocalDateTime.of(2026, 8, 31, 20, 0));
        return s;
    }
}
