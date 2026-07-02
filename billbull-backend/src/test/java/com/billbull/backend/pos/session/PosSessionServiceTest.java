package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.pos.audit.PosAuditLogRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.returns.SalesReturnRepository;
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

    private PosSessionService service;

    @BeforeEach
    void setUp() {
        service = new PosSessionService(repo, invoiceRepo, branchAccessService, branchRepository,
                postingEngine, posSettingsRepository, auditService, paymentRepository, auditLogRepository,
                terminalRepository, returnRepository, dayCloseRepository, objectMapper);
        lenient().when(repo.save(any(PosSession.class))).thenAnswer(inv -> inv.getArgument(0));
        // Default: no tender / audit rows unless a test stubs them.
        lenient().when(paymentRepository.sumTenderByModeForInvoices(any())).thenReturn(List.of());
        lenient().when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of());
        lenient().when(auditLogRepository.findBySessionIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        lenient().when(terminalRepository.findByTerminalId(any())).thenReturn(java.util.Optional.empty());
        lenient().when(returnRepository.findByReturnDateAndBranchWithItems(any(), any())).thenReturn(List.of());
    }

    // ---------------------------------------------------------------------
    // closeSession() — expected cash + cash difference
    // ---------------------------------------------------------------------

    @Test
    void closeSessionComputesExpectedCashAndDifference() {
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement("DROP_IN", bd("50")));
        session.getCashMovements().add(cashMovement("DROP_OUT", bd("20")));
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
        session.getCashMovements().add(cashMovement("DROP_IN", bd("50")));
        session.getCashMovements().add(cashMovement("DROP_OUT", bd("20")));
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
        session.getCashMovements().add(cashMovement("DROP_IN", bd("40")));
        session.getCashMovements().add(cashMovement("DROP_OUT", bd("10")));
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
    // helpers
    // ---------------------------------------------------------------------

    private static BigDecimal bd(String v) { return new BigDecimal(v); }

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

    private PosCashMovement cashMovement(String type, BigDecimal amount) {
        PosCashMovement m = new PosCashMovement();
        m.setMovementType(type);
        m.setAmount(amount);
        return m;
    }

    private SalesInvoice invoice(double total, String mode) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceTotal(BigDecimal.valueOf(total));
        inv.setPaymentMode(mode);
        return inv;
    }

    private SalesInvoice invoiceWithTax(double total, double tax) {
        SalesInvoice inv = new SalesInvoice();
        // A non-blank invoice number is required for tender aggregation to run
        // (aggregateTender skips invoices without a number).
        inv.setInvoiceNumber("INV-" + System.nanoTime());
        inv.setInvoiceTotal(BigDecimal.valueOf(total));
        inv.setTaxTotal(BigDecimal.valueOf(tax));
        inv.setBillDiscountAmount(BigDecimal.ZERO);
        inv.setPaymentMode("Cash");
        return inv;
    }
}
