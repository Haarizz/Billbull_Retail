package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.exception.SessionRangeExclusionException;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.pos.audit.PosAuditLogRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Characterization tests for {@link PosSessionService} cash-reconciliation and
 * Z/X-report aggregation.
 *
 * <p>Purpose: pin the behaviour of the money math so the {@code Double -> BigDecimal}
 * conversion is provably behaviour-preserving. Every asserted figure here is a value
 * that is exactly representable in IEEE-754 {@code double} AND in {@code BigDecimal},
 * so these assertions held identically before and after the type change (the suite
 * was first run green against the pre-conversion {@code double} code, then again
 * after). Cases that exercise <em>branching</em> logic (null coalescing,
 * payment-mode classification, the sign / clamping of derived figures) are the real
 * safety net — those are where a naive type flip silently breaks the books.
 *
 * <p>Money assertions compare by <em>numeric value</em> ({@link BigDecimal#compareTo})
 * via {@link #assertMoney}, so {@code 380} and {@code 380.00} are treated as equal —
 * scale is not part of the contract, value is.
 */
@ExtendWith(MockitoExtension.class)
class PosSessionServiceTest {

    @Mock private PosSessionRepository repo;
    @Mock private SalesInvoiceRepository invoiceRepo;
    @Mock private BranchAccessService branchAccessService;
    @Mock private BranchRepository branchRepository;
    @Mock private PostingEngineService postingEngine;
    @Mock private PosSettingsRepository posSettingsRepository;
    @Mock private PosAuditService auditService;
    @Mock private PaymentRepository paymentRepository;
    @Mock private PosAuditLogRepository auditLogRepository;
    @Mock private PosTerminalRepository terminalRepository;
    @Mock private SalesReturnRepository returnRepository;
    @Mock private com.billbull.backend.pos.dayclose.PosDayCloseRepository dayCloseRepository;
    @Mock private com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    @Mock private com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;
    @Mock private com.billbull.backend.pos.businessdate.PosBusinessDateService businessDateService;
    @Mock private PosCashMovementRepository cashMovementRepository;
    @Mock private com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository receiptVoucherRepository;

    private PosSessionService service;

    @BeforeEach
    void setUp() {
        service = new PosSessionService(repo, invoiceRepo, branchAccessService, branchRepository,
                postingEngine, posSettingsRepository, auditService, paymentRepository, auditLogRepository,
                terminalRepository, returnRepository, dayCloseRepository, objectMapper, terminalActivityService,
                businessDateService, cashMovementRepository, receiptVoucherRepository);
        lenient().when(repo.save(any(PosSession.class))).thenAnswer(inv -> inv.getArgument(0));
        // Default: no tender / audit rows unless a test stubs them.
        lenient().when(paymentRepository.sumTenderByModeForInvoices(any())).thenReturn(List.of());
        lenient().when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of());
        lenient().when(auditLogRepository.findBySessionIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        lenient().when(terminalRepository.findByTerminalId(any())).thenReturn(java.util.Optional.empty());
        lenient().when(returnRepository.findByReturnDateAndBranchWithItems(any(), any())).thenReturn(List.of());
        lenient().when(cashMovementRepository.sumAmountByMovementTypeForSessionIds(any(), any())).thenReturn(List.of());
        lenient().when(cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(any())).thenReturn(List.of());
        lenient().when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(any(), any(), any())).thenReturn(List.of());
    }

    // ---------------------------------------------------------------------
    // closeSession() — expected cash + cash difference
    // ---------------------------------------------------------------------

    @Test
    void closeSessionComputesExpectedCashAndDifference() {
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("50")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("20")));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        // closeSession() now derives expected cash from actual cash tender collected
        // (same formula as getXReport()), not the session.totalCashSales counter.
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(250.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("250"), 1L }));

        // expected = opening(100) + cashTender(250) + (dropIn 50 - dropOut 20) = 380
        PosSession closed = service.closeSession(1L, bd("400"), "ok");

        assertMoney("380", closed.getExpectedCash());
        // over by 20
        assertMoney("20", closed.getCashDifference());
        assertMoney("400", closed.getClosingCash());
        assertEquals(PosSessionStatus.CLOSED, closed.getStatus());
    }

    @Test
    @SuppressWarnings("unchecked")
    void closeSessionAndXReportAgreeOnExpectedCashForNonStandardPaymentMode() {
        // Regression test for the modal/X-Report desync: a payment mode that isn't a
        // literal "cash"/"card"/"credit" match (e.g. a voucher tender row) must still
        // produce the SAME expected cash from closeSession() and getXReport(), since
        // both now share computeExpectedCash()/aggregateTender() instead of diverging
        // (one via the session.totalCashSales counter, the other via a live query).
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("50")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("20")));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(250.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("250"), 1L }));

        Map<String, Object> report = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) report.get("summary");
        PosSession closed = service.closeSession(1L, bd("400"), "ok");

        assertMoney("380", (BigDecimal) summary.get("expectedCash"));
        assertMoney("380", closed.getExpectedCash());
    }

    @Test
    void closeSessionTreatsNullMoneyFieldsAsZero() {
        PosSession session = openSession();
        session.setOpeningCash(null);
        session.setTotalCashSales(null);
        // no cash movements
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));

        PosSession closed = service.closeSession(1L, null, null);

        // opening(0) + cashSales(0) + net(0) = 0
        assertMoney("0", closed.getExpectedCash());
        // closingCash null -> coalesced to 0, and difference 0 when closing null
        assertMoney("0", closed.getClosingCash());
        assertMoney("0", closed.getCashDifference());
    }

    @Test
    void closeSessionShortfallIsNegativeDifference() {
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.setTotalCashSales(bd("0"));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));

        PosSession closed = service.closeSession(1L, bd("90"), null);

        assertMoney("100", closed.getExpectedCash());
        // counted 90 against expected 100 -> short by 10
        assertMoney("-10", closed.getCashDifference());
        assertTrue(closed.getCashDifference().signum() < 0, "shortfall must be negative");
    }

    // ---------------------------------------------------------------------
    // recordInvoiceOnSession() — payment-mode classification + accumulation
    // ---------------------------------------------------------------------

    // recordInvoiceOnSession now uses an atomic SQL UPDATE (incrementSessionTotals)
    // instead of load-then-save to avoid hot-row contention at checkout throughput.
    // Tests verify that the correct deltas are passed to the repository method.

    @Test
    void recordInvoiceClassifiesCashSale() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(105.0, "Cash"));

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("105.0")),  // totalSales
                eq(bd("105.0")),  // cashDelta
                eq(BigDecimal.ZERO),  // cardDelta
                eq(BigDecimal.ZERO),  // creditDelta
                eq(BigDecimal.ZERO),  // mixedDelta
                eq(BigDecimal.ZERO),  // onlineDelta
                eq(0));               // voidDelta
    }

    @Test
    void recordInvoiceClassifiesMixedWhenCashAndCard() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(200.0, "Cash + Card"));

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("200.0")),
                eq(BigDecimal.ZERO),  // cashDelta
                eq(BigDecimal.ZERO),  // cardDelta
                eq(BigDecimal.ZERO),  // creditDelta
                eq(bd("200.0")),      // mixedDelta
                eq(BigDecimal.ZERO),  // onlineDelta
                eq(0));               // voidDelta
    }

    @Test
    void recordInvoiceClassifiesCreditSale() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(75.0, "Credit"));

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("75.0")),
                eq(BigDecimal.ZERO),  // cashDelta
                eq(BigDecimal.ZERO),  // cardDelta
                eq(bd("75.0")),       // creditDelta
                eq(BigDecimal.ZERO),  // mixedDelta
                eq(BigDecimal.ZERO),  // onlineDelta
                eq(0));               // voidDelta
    }

    @Test
    void recordInvoiceUnknownModeFallsBackToCash() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(33.0, "Voucher"));

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("33.0")),
                eq(bd("33.0")),       // falls back to cashDelta
                eq(BigDecimal.ZERO),
                eq(BigDecimal.ZERO),
                eq(BigDecimal.ZERO),
                eq(BigDecimal.ZERO),  // onlineDelta
                eq(0));               // voidDelta
    }

    @Test
    void recordInvoiceAccumulatesAcrossInvoices() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(100.25, "Cash"));
        service.recordInvoiceOnSession(1L, invoice(50.50, "Cash"));

        // Two separate atomic increments — each fires one UPDATE.
        verify(repo, org.mockito.Mockito.times(2))
                .incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void recordInvoiceDoesNothingForNullSession() {
        // Null sessionId — no DB call should be made.
        service.recordInvoiceOnSession(null, invoice(100.0, "Cash"));
        verify(repo, org.mockito.Mockito.never())
                .incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt());
    }

    // ---------------------------------------------------------------------
    // getXReport() — derived figures, clamping, drop netting
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void xReportDerivesExpectedCashAndExTaxClamped() {
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.setTotalSales(bd("500"));
        session.setTotalCashSales(bd("300"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("40")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("10")));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(500.0, 25.0)));
        // Expected cash now derives from ACTUAL cash tender collected, not the session
        // counter — stub 300 of cash tender for this session's invoice.
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("300"), 1L }));

        Map<String, Object> result = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        // expectedCash = opening(100) + cashTender(300) + net(40-10=30) = 430
        assertMoney("430", (BigDecimal) summary.get("expectedCash"));
        assertMoney("300", (BigDecimal) summary.get("cashSales"));
        assertMoney("40", (BigDecimal) summary.get("cashDropIn"));
        assertMoney("10", (BigDecimal) summary.get("cashDropOut"));
        assertMoney("25", (BigDecimal) summary.get("totalTax"));
        // salesAmountExTax = max(0, 500 - 25) = 475 (invoice total, net of voids)
        assertMoney("475", (BigDecimal) summary.get("salesAmountExTax"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void xReportClampsNegativeExTaxToZero() {
        PosSession session = openSession();
        session.setTotalSales(bd("10"));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        // tax greater than total sales (degenerate, but the clamp must hold)
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(10.0, 30.0)));

        Map<String, Object> result = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        // salesAmountExTax = max(0, 10 - 30) = 0
        assertMoney("0", (BigDecimal) summary.get("salesAmountExTax"));
    }

    // ---------------------------------------------------------------------
    // getXReport() — session isolation (BBQA X-Report leak fix)
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void xReportExcludesReturnsLinkedToAnotherSessionsInvoiceSameBranchAndDay() {
        // Regression test: cashier closes session #1 on Device A (INV-A-1), then opens
        // session #2 on Device B and rings INV-B-1. Sales Return rows carry no
        // posSessionId (only branch+date), so a return posted against the OLD session's
        // invoice (INV-A-1) must not bleed into the NEW session's X-Report.
        PosSession session = openSession();
        session.setId(2L);
        when(repo.findById(2L)).thenReturn(java.util.Optional.of(session));
        SalesInvoice ownInvoice = invoiceWithNumber("INV-B-1", 100.0, 0.0);
        when(invoiceRepo.findByPosSessionIdWithItems(2L)).thenReturn(List.of(ownInvoice));

        SalesReturn otherSessionReturn = salesReturn("INV-A-1", SalesReturnStatus.APPROVED, "Refund", 40.0);
        SalesReturn ownSessionReturn = salesReturn("INV-B-1", SalesReturnStatus.APPROVED, "Refund", 15.0);
        when(returnRepository.findByReturnDateAndBranchWithItems(any(), any()))
                .thenReturn(List.of(otherSessionReturn, ownSessionReturn));

        Map<String, Object> result = service.getXReport(2L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        assertEquals(1, summary.get("salesReturnCount"));
        assertMoney("15", (BigDecimal) summary.get("salesReturnTotal"));
        assertEquals(1, summary.get("refundCount"));
        assertMoney("15", (BigDecimal) summary.get("refundTotal"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void xReportIsolatesConcurrentCashiersOnSameBranchAndDay() {
        // Cashier A (session #1) and Cashier B (session #2) both have OPEN sessions on
        // the same branch+day. A return is posted against Cashier B's invoice while
        // Cashier A's X-Report is generated — it must not appear in Cashier A's report,
        // regardless of which cashier closes/reports first.
        PosSession sessionA = openSession();
        sessionA.setId(1L);
        sessionA.setOpenedBy("cashierA");
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(sessionA));

        SalesInvoice invoiceA = invoiceWithNumber("INV-A-1", 200.0, 0.0);
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceA));

        SalesReturn returnForCashierB = salesReturn("INV-B-1", SalesReturnStatus.APPROVED, "Credit Note", 60.0);
        when(returnRepository.findByReturnDateAndBranchWithItems(any(), any()))
                .thenReturn(List.of(returnForCashierB));

        Map<String, Object> result = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        assertEquals(0, summary.get("salesReturnCount"));
        assertMoney("0", (BigDecimal) summary.get("salesReturnTotal"));
        assertEquals(0, summary.get("creditNoteCount"));
        assertMoney("0", (BigDecimal) summary.get("creditNoteTotal"));
    }

    // ---------------------------------------------------------------------
    // getZReport() — cross-session aggregation
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void zReportAggregatesAcrossSessions() {
        // Z-Report only aggregates CLOSED sessions (generateDynamicZReport filters on
        // PosSessionStatus.CLOSED) — openSession() defaults to OPEN, so override here.
        PosSession s1 = openSession();
        s1.setStatus(PosSessionStatus.CLOSED);
        s1.setTotalSales(bd("200"));
        s1.setTotalCashSales(bd("120"));
        s1.setInvoiceCount(2);
        PosSession s2 = openSession();
        s2.setId(2L);
        s2.setStatus(PosSessionStatus.CLOSED);
        s2.setTotalSales(bd("100"));
        s2.setTotalCashSales(bd("80"));
        s2.setInvoiceCount(1);

        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(anyLong(), any(LocalDate.class)))
                .thenReturn(List.of(s1, s2));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(anyLong(), any()))
                .thenReturn(List.of(invoiceWithTax(200.0, 10.0), invoiceWithTax(100.0, 5.0)));
        // totalSales now sums invoice rows (net of voids); cashSales is actual tender.
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("200"), 2L }));

        Map<String, Object> result = service.getZReport(7L, LocalDate.now());
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        assertMoney("300", (BigDecimal) summary.get("totalSales"));   // 200 + 100 (invoices)
        assertMoney("200", (BigDecimal) summary.get("cashSales"));     // actual cash tender
        assertEquals(3, summary.get("invoiceCount"));                  // 2 + 1
        assertEquals(2, summary.get("sessionCount"));
        assertMoney("15", (BigDecimal) summary.get("totalTax"));       // 10 + 5
        assertMoney("285", (BigDecimal) summary.get("salesAmountExTax")); // max(0, 300 - 15)
    }

    // ---------------------------------------------------------------------
    // Day Close session-range resolution (ARCHFIX: unified resolution + SUSPENDED gap)
    // ---------------------------------------------------------------------

    @Test
    void closeDayBlocksOnSuspendedSession() {
        // Previously SUSPENDED sessions neither blocked close nor appeared in the
        // report — they were silently dropped. Must now behave like OPEN: block.
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession closed = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));
        PosSession suspended = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.SUSPENDED, date.atStartOfDay().plusHours(10));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(suspended, closed));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date));

        assertTrue(ex.getReason().contains("suspended"), () -> "expected suspended-session message, got: " + ex.getReason());
    }

    @Test
    void closeDayBlocksOnOpenSession() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession open = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.OPEN, date.atStartOfDay().plusHours(9));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(open));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date));

        assertTrue(ex.getReason().contains("open"), () -> "expected open-session message, got: " + ex.getReason());
    }

    @Test
    void closeDayNarrowedRangeExcludingEligibleSessionRequiresAcknowledgement() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(10));
        PosSession s3 = sessionAt(3L, branchId, date, "cashierC", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(12));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s3, s2, s1));
        when(repo.findById(1L)).thenReturn(Optional.of(s1));
        when(repo.findById(2L)).thenReturn(Optional.of(s2));

        // Narrow the range to [s1, s2] — s3 falls outside and must be flagged, not
        // silently dropped from the day's audit trail.
        SessionRangeExclusionException ex = assertThrows(SessionRangeExclusionException.class,
                () -> service.closeDay(branchId, date, 1L, 2L, false));

        assertEquals(1, ex.getDetails().get("excludedSessionCount"));
    }

    @Test
    void closeDayStartAfterEndIsRejected() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(10));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s2, s1));
        when(repo.findById(1L)).thenReturn(Optional.of(s1));
        when(repo.findById(2L)).thenReturn(Optional.of(s2));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date, 2L, 1L, false));

        assertTrue(ex.getReason().contains("Start session must occur before End session"));
    }

    @Test
    void closeDayBoundarySessionFromDifferentBranchIsRejected() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        PosSession otherBranch = sessionAt(9L, 99L, date, "cashierZ", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s1));
        when(repo.findById(9L)).thenReturn(Optional.of(otherBranch));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date, 9L, 1L, false));

        assertTrue(ex.getReason().contains("does not belong to branch"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void dayCloseSummaryAutoResolvesFirstAndLastAndAggregatesFields() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.OPEN, date.atStartOfDay().plusHours(8));
        s1.setCounterName("Counter-1");
        s1.setTerminalId("T-1");
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(11));
        s2.setCounterName("Counter-2");
        s2.setTerminalId("T-2");

        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s2, s1));

        Map<String, Object> summary = service.getDayCloseSummary(branchId, date, null, null);

        assertEquals(1L, summary.get("startSessionId"));
        assertEquals(2L, summary.get("endSessionId"));
        assertEquals(2, summary.get("totalSessions"));
        assertEquals(List.of("cashierA", "cashierB"), summary.get("cashiers"));
        assertEquals(List.of("Counter-1", "Counter-2"), summary.get("counters"));
        assertEquals(List.of("T-1", "T-2"), summary.get("terminals"));
        assertEquals(1L, summary.get("openSessionCount"));
        assertEquals(0L, summary.get("suspendedSessionCount"));
        assertFalse((Boolean) summary.get("readyToClose"));
        assertEquals(0, summary.get("excludedSessionCount"));
    }

    @Test
    void dayCloseSummaryReportsExclusionsWhenRangeIsNarrowed() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(10));
        PosSession s3 = sessionAt(3L, branchId, date, "cashierC", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(12));

        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s3, s2, s1));
        when(repo.findById(1L)).thenReturn(Optional.of(s1));
        when(repo.findById(2L)).thenReturn(Optional.of(s2));

        Map<String, Object> summary = service.getDayCloseSummary(branchId, date, 1L, 2L);

        assertEquals(2, summary.get("totalSessions"));
        assertEquals(1, summary.get("excludedSessionCount"));
        assertTrue((Boolean) summary.get("readyToClose"));
    }

    // ---------------------------------------------------------------------
    // Consolidated Cash Position — additive section, must not disturb Expected Cash
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void xReportConsolidatedCashPositionExcludesBackOfficeReceipts() {
        PosSession session = openSession();
        session.setBranchId(7L);
        session.setSessionDate(LocalDate.now());
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("40")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("10")));
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(300.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("300"), 1L }));

        PosCashMovement dropIn = cashMovement(PosCashMovementType.DROP_IN, bd("40"));
        PosCashMovement dropOut = cashMovement(PosCashMovementType.DROP_OUT, bd("10"));
        when(cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(List.of(1L)))
                .thenReturn(List.of(dropIn, dropOut));

        Map<String, Object> result = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");
        Map<String, Object> cashPosition = (Map<String, Object>) summary.get("cashPosition");

        List<Map<String, Object>> cashDropRows = (List<Map<String, Object>>) cashPosition.get("cashDropRows");
        assertEquals(2, cashDropRows.size());
        assertMoney("30", (BigDecimal) cashPosition.get("cashDropTotal"));
        assertMoney("0", (BigDecimal) cashPosition.get("customerReceiptsTotal"));
        assertMoney("0", (BigDecimal) cashPosition.get("customerAdvancesTotal"));
        assertEquals(false, cashPosition.get("cashRefundsSupported"));
        // net = opening(100) + cashSales(300) + receipts(0) + advances(0) + dropIn(40) - dropOut(10)
        assertMoney("430", (BigDecimal) cashPosition.get("netCashPosition"));

        // X-Report must never query back-office receipts (no session linkage exists yet).
        verify(receiptVoucherRepository, org.mockito.Mockito.never())
                .findCompletedByBranchAndDateAndPurpose(any(), any(), any());

        // Existing Expected Cash in Drawer must be untouched by the new section.
        assertMoney("430", (BigDecimal) summary.get("expectedCash"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void zReportConsolidatedCashPositionIncludesCashOnlyReceiptsAndAdvances() {
        PosSession s1 = openSession();
        s1.setStatus(PosSessionStatus.CLOSED);
        s1.setBranchId(7L);
        s1.setOpeningCash(bd("100"));
        s1.setInvoiceCount(1);

        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(anyLong(), any(LocalDate.class)))
                .thenReturn(List.of(s1));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(anyLong(), any()))
                .thenReturn(List.of(invoiceWithTax(200.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("200"), 1L }));
        when(cashMovementRepository.sumAmountByMovementTypeForSessionIds(List.of(1L), PosCashMovementStatus.ACTIVE))
                .thenReturn(List.<Object[]>of(
                        new Object[]{ PosCashMovementType.DROP_IN, bd("30") },
                        new Object[]{ PosCashMovementType.DROP_OUT, bd("5") }));

        ReceiptVoucher cashReceipt = receiptVoucher("Alice", "Cash", bd("50"));
        ReceiptVoucher cardReceipt = receiptVoucher("Bob", "Card", bd("999")); // must be excluded (not cash)
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.CASH_SALE)))
                .thenReturn(List.of(cashReceipt, cardReceipt));
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.AGAINST_INVOICE)))
                .thenReturn(List.of());
        ReceiptVoucher cashAdvance = receiptVoucher("Dana", "Cash", bd("75"));
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(cashAdvance));

        Map<String, Object> result = service.getZReport(7L, LocalDate.now());
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");
        Map<String, Object> cashPosition = (Map<String, Object>) summary.get("cashPosition");

        assertMoney("50", (BigDecimal) cashPosition.get("customerReceiptsTotal")); // card receipt excluded
        assertMoney("75", (BigDecimal) cashPosition.get("customerAdvancesTotal"));
        List<Map<String, Object>> receiptRows = (List<Map<String, Object>>) cashPosition.get("customerReceiptRows");
        assertEquals(1, receiptRows.size());
        assertEquals("Alice", receiptRows.get(0).get("customerName"));
        assertMoney("30", (BigDecimal) cashPosition.get("cashDropIn"));
        assertMoney("5", (BigDecimal) cashPosition.get("cashDropOut"));

        // net = opening(100) + cashSales(200) + receipts(50) + advances(75) + dropIn(30) - dropOut(5)
        assertMoney("450", (BigDecimal) cashPosition.get("netCashPosition"));
    }

    // ---------------------------------------------------------------------
    // Day Close reconciliation bug fix — DROP_IN/DROP_OUT, not PAY_IN/PAY_OUT
    // ---------------------------------------------------------------------

    @Test
    void closeDayCashReconciliationAccountsForActualDropInDropOutMovementTypes() {
        // Regression test for the PAY_IN/PAY_OUT vs DROP_IN/DROP_OUT mismatch: before the
        // fix, cashPaidIn/cashPaidOut were always zero (no code ever writes "PAY_IN"/
        // "PAY_OUT"), so a business day with real cash drops recorded on its session(s)
        // would fail this reconciliation with a false variance, purely from the string
        // mismatch — not a genuine discrepancy.
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));
        s1.setOpeningCash(bd("100"));
        s1.setInvoiceCount(1);
        // Persisted per-session Expected Cash already correctly includes the drop in/out
        // (computeExpectedCash is untouched): 100 opening + 200 cash tender + 50 dropIn - 20 dropOut = 330.
        s1.setExpectedCash(bd("330"));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s1));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(eq(branchId), any()))
                .thenReturn(List.of(invoiceWithTax(200.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("200"), 1L }));
        when(cashMovementRepository.sumAmountByMovementTypeForSessionIds(List.of(1L), PosCashMovementStatus.ACTIVE))
                .thenReturn(List.<Object[]>of(
                        new Object[]{ PosCashMovementType.DROP_IN, bd("50") },
                        new Object[]{ PosCashMovementType.DROP_OUT, bd("20") }));
        when(dayCloseRepository.save(any(com.billbull.backend.pos.dayclose.PosDayClose.class))).thenAnswer(inv -> {
            com.billbull.backend.pos.dayclose.PosDayClose d = inv.getArgument(0);
            d.setId(99L);
            return d;
        });

        // Must NOT throw ReconciliationException("CASH", ...) now that DROP_IN/DROP_OUT
        // are the movement types actually checked.
        Map<String, Object> report = service.closeDay(branchId, date);

        assertEquals(true, report.get("isDayClosed"));
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    private static BigDecimal bd(String v) { return new BigDecimal(v); }

    private static Branch branch(Long id) {
        Branch b = new Branch();
        b.setId(id);
        b.setName("Main Branch");
        b.setCode("MB");
        return b;
    }

    private static PosSession sessionAt(Long id, Long branchId, LocalDate date, String openedBy,
                                        PosSessionStatus status, LocalDateTime openedAt) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setBranchId(branchId);
        s.setSessionDate(date);
        s.setOpenedBy(openedBy);
        s.setStatus(status);
        s.setOpenedAt(openedAt);
        s.setInvoiceCount(0);
        s.setTotalSales(BigDecimal.ZERO);
        s.setTotalCashSales(BigDecimal.ZERO);
        s.setTotalCardSales(BigDecimal.ZERO);
        s.setTotalCreditSales(BigDecimal.ZERO);
        s.setTotalMixedSales(BigDecimal.ZERO);
        return s;
    }

    /** Assert numeric equality independent of scale (380 == 380.00). */
    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }

    private PosSession openSession() {
        PosSession s = new PosSession();
        s.setId(1L);
        s.setStatus(PosSessionStatus.OPEN);
        s.setInvoiceCount(0);
        s.setTotalSales(BigDecimal.ZERO);
        s.setTotalCashSales(BigDecimal.ZERO);
        s.setTotalCardSales(BigDecimal.ZERO);
        s.setTotalCreditSales(BigDecimal.ZERO);
        s.setTotalMixedSales(BigDecimal.ZERO);
        return s;
    }

    private PosCashMovement cashMovement(PosCashMovementType type, BigDecimal amount) {
        PosCashMovement m = new PosCashMovement();
        m.setMovementType(type);
        m.setAmount(amount);
        m.setStatus(PosCashMovementStatus.ACTIVE);
        return m;
    }

    private SalesInvoice invoice(double total, String mode) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceTotal(BigDecimal.valueOf(total));
        inv.setPaymentMode(mode);
        return inv;
    }

    private SalesInvoice invoiceWithTax(double total, double tax) {
        return invoiceWithNumber("INV-" + System.nanoTime(), total, tax);
    }

    private SalesInvoice invoiceWithNumber(String invoiceNumber, double total, double tax) {
        SalesInvoice inv = new SalesInvoice();
        // A non-blank invoice number is required for tender aggregation to run
        // (aggregateTender skips invoices without a number).
        inv.setInvoiceNumber(invoiceNumber);
        inv.setInvoiceTotal(BigDecimal.valueOf(total));
        inv.setTaxTotal(BigDecimal.valueOf(tax));
        inv.setBillDiscountAmount(BigDecimal.ZERO);
        inv.setPaymentMode("Cash");
        return inv;
    }

    private ReceiptVoucher receiptVoucher(String customerName, String paymentMode, BigDecimal amount) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setMemberName(customerName);
        rv.setPaymentMode(paymentMode);
        rv.setAmount(amount);
        rv.setStatus("Completed");
        return rv;
    }

    private SalesReturn salesReturn(String linkedInvoice, SalesReturnStatus status, String action, double amount) {
        SalesReturn r = new SalesReturn();
        r.setLinkedInvoice(linkedInvoice);
        r.setStatus(status);
        r.setReturnAction(action);
        r.setTotalAmount(BigDecimal.valueOf(amount));
        return r;
    }
}
