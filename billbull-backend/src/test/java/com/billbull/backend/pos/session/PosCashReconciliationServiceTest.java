package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.pos.admin.CorrectionTargetType;
import com.billbull.backend.pos.admin.EffectiveCorrectionViewService;
import com.billbull.backend.sales.payment.PaymentRepository;

import jakarta.persistence.EntityManager;

/**
 * The authoritative reconciliation, exercised directly.
 *
 * <pre>
 *   Expected Cash = Opening Float + Cash Tender Collected + Authorized Cash-In - Authorized Cash-Out
 * </pre>
 *
 * <p>One test per physical cash flow, so a regression names the flow that broke rather than just
 * a number. Float is 100 unless a scenario says otherwise.
 */
@ExtendWith(MockitoExtension.class)
class PosCashReconciliationServiceTest {

    @Mock private PaymentRepository paymentRepository;
    @Mock private ReceiptVoucherRepository receiptVoucherRepository;
    @Mock private EffectiveCorrectionViewService effectiveCorrectionViewService;
    @Mock private EntityManager entityManager;

    private PosCashReconciliationService service;

    @BeforeEach
    void setUp() {
        service = new PosCashReconciliationService(
                paymentRepository, receiptVoucherRepository, effectiveCorrectionViewService, entityManager);
        // Default: no correction applied — overlays pass the rows through untouched.
        lenient().when(effectiveCorrectionViewService.resolveOverlays(any(), anyList(), any()))
                .thenAnswer(inv -> inv.getArgument(1));
        lenient().when(paymentRepository.sumTenderByModeForSessions(any())).thenReturn(List.of());
        lenient().when(receiptVoucherRepository.findByPosSessionId(anyLong())).thenReturn(List.of());
    }

    // ── §15 scenarios ────────────────────────────────────────────────────────────────────

    @Test
    void s01_openingFloatOnly() {
        assertExpected("100", session("100"));
    }

    @Test
    void s02_posCashSale() {
        tender(mode("Cash", "300"));
        assertExpected("400", session("100"));
    }

    @Test
    void s03_deliveryCashCollection() {
        // Keyed on the COLLECTION session, so an order rung up elsewhere still lands here.
        tender(mode("Cash", "400"));
        assertExpected("500", session("100"));
    }

    @Test
    void s04_mixedTenderOnlyTheCashLegCounts() {
        tender(mode("Cash", "150"), mode("Visa", "250"), mode("Online", "90"));
        assertExpected("250", session("100"));
    }

    @Test
    void s05_posCustomerCreditReceipt() {
        tender(mode("Cash", "250"));
        assertExpected("350", session("100"));
    }

    @Test
    void s06_posCustomerAdvance() {
        advances(advance("Cash", "200"));
        assertExpected("300", session("100"));
    }

    @Test
    void s07_layawayCashDeposit() {
        assertExpected("700", session("100", movement(PosCashMovementType.DROP_IN, "600")));
    }

    @Test
    void s08_layawayInstalment() {
        assertExpected("300", session("100", movement(PosCashMovementType.DROP_IN, "200")));
    }

    @Test
    void s09_salesReturnCashRefund() {
        tender(mode("Cash", "500"));
        assertExpected("450", session("100", movement(PosCashMovementType.DROP_OUT, "150")));
    }

    @Test
    void s10_advanceCashRefund() {
        assertExpected("0", session("100", movement(PosCashMovementType.DROP_OUT, "100")));
    }

    @Test
    void s11_layawayCancellationRefund() {
        assertExpected("100", session("100",
                movement(PosCashMovementType.DROP_IN, "600"),
                movement(PosCashMovementType.DROP_OUT, "600")));
    }

    @Test
    void s12_cashDropIn() {
        assertExpected("1100", session("100", movement(PosCashMovementType.DROP_IN, "1000")));
    }

    @Test
    void s13_cashDropOut() {
        assertExpected("60", session("100", movement(PosCashMovementType.DROP_OUT, "40")));
    }

    @Test
    void s14_cashPayout() {
        assertExpected("25", session("100", movement(PosCashMovementType.DROP_OUT, "75")));
    }

    @Test
    void s15_drawerTransferOutOfThisDrawer() {
        // A transfer is two movements in two sessions; this drawer sees only its own leg.
        assertExpected("-150", session("100", movement(PosCashMovementType.DROP_OUT, "250")));
    }

    @Test
    void s16_creditSaleWithoutCollectionTouchesNothing() {
        // A CREDIT allocation creates no Payment row at all, so there is nothing to exclude.
        assertExpected("100", session("100"));
    }

    @Test
    void s17_combinedCrossModuleScenario() {
        // §16 — the composite that must survive the extraction.
        //   500 float
        //  +300 POS cash sale        +250 credit receipt      +400 delivery cash   (= 950 tender)
        //  +200 customer advance                                                   (tender)
        //  +600 layaway deposit                                                    (cash-in)
        //  -150 sales refund  -100 advance refund  -75 payout  -400 drop-out       (= 725 cash-out)
        //  = 1525
        tender(mode("Cash", "950"), mode("Visa", "500"));
        advances(advance("Cash", "200"));
        PosSession session = session("500",
                movement(PosCashMovementType.DROP_IN, "600"),
                movement(PosCashMovementType.DROP_OUT, "150"),
                movement(PosCashMovementType.DROP_OUT, "100"),
                movement(PosCashMovementType.DROP_OUT, "75"),
                movement(PosCashMovementType.DROP_OUT, "400"));

        PosCashReconciliationResult r = service.reconcile(session);

        assertMoney("500", r.openingFloat());
        assertMoney("1150", r.cashTenderCollected());   // 950 + 200 advance
        assertMoney("600", r.authorizedCashIn());
        assertMoney("725", r.authorizedCashOut());
        assertMoney("1525", r.expectedCash());
    }

    // ── Bucketing and exclusions ─────────────────────────────────────────────────────────

    @Test
    void nonCashAdvancesDoNotReachTheDrawer() {
        advances(advance("Visa", "200"));
        assertExpected("100", session("100"));
    }

    @Test
    void nonAdvanceVouchersOnTheSessionAreIgnored() {
        // A voucher generated for an invoice receipt is already inside the Payment tender; only
        // ADVANCE_RECEIVED vouchers are a separate source.
        ReceiptVoucher againstInvoice = advance("Cash", "500");
        againstInvoice.setPurpose(ReceiptPurpose.AGAINST_INVOICE);
        advances(againstInvoice);
        assertExpected("100", session("100"));
    }

    @Test
    void voidedMovementsNeverContribute() {
        PosCashMovement voided = movement(PosCashMovementType.DROP_OUT, "500");
        voided.setStatus(PosCashMovementStatus.VOIDED);
        assertExpected("100", session("100", voided));
    }

    @Test
    void legacyMovementsWithNoStatusAreTreatedAsActive() {
        PosCashMovement legacy = movement(PosCashMovementType.DROP_IN, "50");
        legacy.setStatus(null);
        assertExpected("150", session("100", legacy));
    }

    // ── §5 counted cash: null is not zero ────────────────────────────────────────────────

    @Test
    void anUncountedDrawerHasNoCountAndNoVariance() {
        PosCashReconciliationResult r = service.reconcile(session("100"));

        assertNull(r.countedCash(), "an open session has not been counted");
        assertNull(r.variance(), "an uncounted drawer has no variance");
        assertNull(r.countedAt());
        assertEquals(PosCashReconciliationStatus.NOT_COUNTED, r.status());
    }

    @Test
    void aDrawerCountedAsEmptyIsNotTheSameAsUncounted() {
        PosSession session = session("0");
        closed(session, "0");

        PosCashReconciliationResult r = service.reconcile(session);

        assertNotNull(r.countedCash(), "counted-zero is a real count");
        assertMoney("0", r.countedCash());
        assertMoney("0", r.variance());
        assertEquals(PosCashReconciliationStatus.BALANCED, r.status());
    }

    @Test
    void statusReportsOverAndShort() {
        PosSession over = session("100");
        closed(over, "130");
        assertEquals(PosCashReconciliationStatus.OVER, service.reconcile(over).status());
        assertMoney("30", service.reconcile(over).variance());

        PosSession short_ = session("100");
        closed(short_, "80");
        assertEquals(PosCashReconciliationStatus.SHORT, service.reconcile(short_).status());
        assertMoney("-20", service.reconcile(short_).variance());
    }

    // ── §17 corrections ──────────────────────────────────────────────────────────────────

    @Test
    void aCorrectedCashMovementChangesExpectedCash() {
        PosCashMovement raw = movement(PosCashMovementType.DROP_OUT, "300");
        PosSession session = session("100", raw);
        tender(mode("Cash", "500"));

        // Approved correction: the payout was really 200, not 300.
        PosCashMovement corrected = movement(PosCashMovementType.DROP_OUT, "200");
        when(effectiveCorrectionViewService.resolveOverlays(
                eq(CorrectionTargetType.CASH_MOVEMENT), anyList(), any()))
                .thenReturn(List.of(corrected));

        assertMoney("400", service.reconcile(session).expectedCash()); // 100 + 500 - 200
    }

    @Test
    void eachOverlayIsResolvedExactlyOncePerReconcile() {
        // The defect this phase removes was an overlay applied on one path and not another.
        // Applying one twice would be the opposite failure, so pin the count down.
        PosSession session = session("100", movement(PosCashMovementType.DROP_IN, "50"));
        advances(advance("Cash", "10"));

        service.reconcile(session);

        verify(effectiveCorrectionViewService, times(1))
                .resolveOverlays(eq(CorrectionTargetType.CASH_MOVEMENT), anyList(), any());
        verify(effectiveCorrectionViewService, times(1))
                .resolveOverlays(eq(CorrectionTargetType.RECEIPT_VOUCHER), anyList(), any());
    }

    @Test
    void theSessionsOwnMovementsAreNeitherDetachedNorMutatedByOverlayResolution() {
        // Regression: overlays were resolved onto the session's live PosCashMovement instances,
        // which were detached first so the corrected value could not be flushed back. But those
        // instances are elements of the still-managed PosSession.cashMovements collection, so
        // the next flush cascaded PERSIST over a detached element and Hibernate killed the
        // transaction with "detached entity passed to persist" — every Cash Out reconciles the
        // drawer before saving, so every Cash Out failed. Reconciliation must leave the
        // persistence context, and the session's own rows, completely untouched.
        PosCashMovement live = movement(PosCashMovementType.DROP_OUT, "300");
        PosSession session = session("100", live);

        PosCashMovement corrected = movement(PosCashMovementType.DROP_OUT, "200");
        when(effectiveCorrectionViewService.resolveOverlays(
                eq(CorrectionTargetType.CASH_MOVEMENT), anyList(), any()))
                .thenReturn(List.of(corrected));

        service.reconcile(session);

        verify(entityManager, never()).detach(any(PosCashMovement.class));
        assertMoney("300", live.getAmount());
        // ...and the list handed to overlay resolution held copies, not the session's own rows.
        ArgumentCaptor<List<PosCashMovement>> captor = ArgumentCaptor.forClass(List.class);
        verify(effectiveCorrectionViewService)
                .resolveOverlays(eq(CorrectionTargetType.CASH_MOVEMENT), captor.capture(), any());
        assertEquals(1, captor.getValue().size());
        assertNotSame(live, captor.getValue().get(0));
    }

    @Test
    void anAppliedDenominationCorrectionRestatesCountedCashAndVarianceTogether() {
        // Previously the denominations were overlaid for display while closingCash was read
        // raw, so a corrected session showed a count, a breakdown and a variance that did not
        // agree. Counted cash and variance must move together with the correction.
        PosSession session = session("100");
        closed(session, "150");
        tender(mode("Cash", "100"));   // expected = 200

        Map<String, Object> overlay = new LinkedHashMap<>();
        overlay.put("corrected", true);
        overlay.put("effectiveTotal", new BigDecimal("200"));
        when(effectiveCorrectionViewService.getEffectiveView(CorrectionTargetType.POS_SESSION, 1L))
                .thenReturn(overlay);

        PosCashReconciliationResult r = service.reconcile(session);

        assertMoney("200", r.expectedCash());
        assertMoney("200", r.countedCash());   // the corrected count, not the stored 150
        assertMoney("0", r.variance());        // and therefore coherent
        assertEquals(PosCashReconciliationStatus.BALANCED, r.status());
    }

    @Test
    void anUncorrectedClosedSessionKeepsItsStoredCount() {
        PosSession session = session("100");
        closed(session, "150");
        Map<String, Object> overlay = new LinkedHashMap<>();
        overlay.put("corrected", false);
        when(effectiveCorrectionViewService.getEffectiveView(CorrectionTargetType.POS_SESSION, 1L))
                .thenReturn(overlay);

        assertMoney("150", service.reconcile(session).countedCash());
    }

    @Test
    void aClosedSessionWithNoCountRemainsNotCounted() {
        // Closing without submitting denominations leaves the drawer unverified. It must not
        // become a zero count, which would report the whole expected balance as a shortage.
        PosSession session = session("100");
        session.setStatus(PosSessionStatus.CLOSED);
        session.setClosedAt(java.time.LocalDateTime.of(2026, 8, 31, 20, 0));

        PosCashReconciliationResult r = service.reconcile(session);

        assertNull(r.countedCash());
        assertNull(r.variance());
        assertEquals(PosCashReconciliationStatus.NOT_COUNTED, r.status());
    }

    @Test
    void aHistoricalCountWithNoCountedAtStillReadsAsCounted() {
        // Sessions closed before counted_at existed carry only the denomination snapshot.
        // Without this fallback every one of them would regress to "not counted".
        PosSession session = session("100");
        session.setStatus(PosSessionStatus.CLOSED);
        session.setClosingCash(new BigDecimal("100"));
        session.setClosingDenominationsJson("{\"100\":1}");
        session.setClosedAt(java.time.LocalDateTime.of(2026, 1, 1, 20, 0));
        // countedAt deliberately left null.
        Map<String, Object> overlay = new LinkedHashMap<>();
        overlay.put("corrected", false);
        when(effectiveCorrectionViewService.getEffectiveView(CorrectionTargetType.POS_SESSION, 1L))
                .thenReturn(overlay);

        PosCashReconciliationResult r = service.reconcile(session);

        assertMoney("100", r.countedCash());
        assertEquals(java.time.LocalDateTime.of(2026, 1, 1, 20, 0), r.countedAt());
        assertEquals(PosCashReconciliationStatus.BALANCED, r.status());
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────────────────

    private void assertExpected(String expected, PosSession session) {
        assertMoney(expected, service.reconcile(session).expectedCash());
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }

    private PosSession session(String openingCash, PosCashMovement... movements) {
        PosSession session = new PosSession();
        ReflectionTestUtils.setField(session, "id", 1L);
        session.setOpeningCash(new BigDecimal(openingCash));
        session.setStatus(PosSessionStatus.OPEN);
        for (PosCashMovement m : movements) session.getCashMovements().add(m);
        return session;
    }

    /**
     * Marks the session closed with a counted amount, as closeSession() would leave it: the
     * denomination snapshot and countedAt are the evidence that a count happened, and
     * closingCash is the server-derived total of that snapshot.
     */
    private void closed(PosSession session, String countedCash) {
        session.setStatus(PosSessionStatus.CLOSED);
        session.setClosingCash(new BigDecimal(countedCash));
        session.setClosingDenominationsJson("{}");
        session.setCountedAt(java.time.LocalDateTime.of(2026, 8, 31, 20, 0));
        session.setCountedCurrencyCode("AED");
        session.setClosedAt(java.time.LocalDateTime.of(2026, 8, 31, 20, 0));
    }

    private PosCashMovement movement(PosCashMovementType type, String amount) {
        PosCashMovement m = new PosCashMovement();
        m.setMovementType(type);
        m.setAmount(new BigDecimal(amount));
        m.setStatus(PosCashMovementStatus.ACTIVE);
        return m;
    }

    private Object[] mode(String rawMode, String amount) {
        return new Object[]{ rawMode, new BigDecimal(amount), 1L };
    }

    private void tender(Object[]... rows) {
        when(paymentRepository.sumTenderByModeForSessions(any())).thenReturn(List.of(rows));
    }

    private ReceiptVoucher advance(String mode, String amount) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setPurpose(ReceiptPurpose.ADVANCE_RECEIVED);
        rv.setPaymentMode(mode);
        rv.setAmount(new BigDecimal(amount));
        return rv;
    }

    private void advances(ReceiptVoucher... vouchers) {
        when(receiptVoucherRepository.findByPosSessionId(1L))
                .thenReturn(new java.util.ArrayList<>(List.of(vouchers)));
    }
}
