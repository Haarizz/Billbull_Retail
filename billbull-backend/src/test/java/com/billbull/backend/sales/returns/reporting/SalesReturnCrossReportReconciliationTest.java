package com.billbull.backend.sales.returns.reporting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.pos.dayclose.PosDayClose;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.reports.SalesReportDataResponse;
import com.billbull.backend.sales.reports.SalesReportDataService;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnItem;
import com.billbull.backend.sales.returns.SalesReturnRefundMethod;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.settings.branch.Branch;

/**
 * One sale and one Sales Return, read through both report paths, asserted to agree.
 *
 * <p>This is the test the reporting layer did not have. The Back Office Sales Report and the POS
 * X/Z reports each aggregated {@code sales_returns} independently, and the two definitions had
 * drifted far enough that neither number could be used to check the other:
 *
 * <ul>
 *   <li>the Sales Report's Returns column was <b>not branch-scoped</b>, so it subtracted every
 *       branch's returns from the selected branch's sales;</li>
 *   <li>the POS reports' Net Sales was {@code totalSales - totalTax} and never deducted returns
 *       at all, so a day with returns reported the same Net Sales as a day without any;</li>
 *   <li>the Sales Report's "VAT Collected" card showed gross output VAT while the Tax Summary
 *       report, over the same dates, showed it net of return VAT.</li>
 * </ul>
 *
 * <p>Each case below states the reconciliation it holds, so a future change that breaks one
 * fails with the identity it violated rather than with a bare number mismatch.
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnCrossReportReconciliationTest {

    private static final LocalDate FROM = LocalDate.of(2026, 3, 1);
    private static final LocalDate TO = LocalDate.of(2026, 3, 31);
    private static final LocalDate BUSINESS_DATE = LocalDate.of(2026, 3, 15);
    private static final Long BRANCH = 7L;
    private static final Long OTHER_BRANCH = 9L;

    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private SalesReturnRepository returnRepository;
    @Mock private SalesOrderRepository orderRepository;
    @Mock private DeliveryNoteRepository deliveryNoteRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private ProductRepository productRepository;
    @Mock private PaymentRepository paymentRepository;

    private SalesReturnReportingService reportingService;
    private SalesReportDataService salesReport;

    @BeforeEach
    void setUp() {
        reportingService = new SalesReturnReportingService(returnRepository);
        salesReport = new SalesReportDataService(invoiceRepository, returnRepository, orderRepository,
                deliveryNoteRepository, customerRepository, productRepository, paymentRepository,
                reportingService);

        lenient().when(productRepository.findActiveProductReportBasics()).thenReturn(List.of());
        lenient().when(customerRepository.findAll()).thenReturn(List.of());
        lenient().when(orderRepository.findForReports(any(), any())).thenReturn(List.of());
        lenient().when(deliveryNoteRepository.findForReports(any(), any())).thenReturn(List.of());
        lenient().when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of());
    }

    // ---- §13 cross-report reconciliation ------------------------------------

    @Test
    void theSalesReportAndThePosReportsAgreeOnReturnValueAndOnNetSales() {
        // Sale 1050 incl. VAT (1000 + 50). Return 210 incl. VAT (200 + 10), cash refunded.
        SalesInvoice invoice = invoice("INV-1", "1050.00", "50.00", 10);
        SalesReturn ret = cashReturn("200.00", "10.00", "210.00", "210.00", 2);

        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));
        when(returnRepository.findForReports(FROM, TO)).thenReturn(List.of(ret));
        when(returnRepository.findByReturnDateAndBranchWithItems(BUSINESS_DATE, BRANCH))
                .thenReturn(List.of(ret));

        // (a) Back Office Sales Report
        SalesReportDataResponse report = salesReport.getReport(
                "sales-summary", FROM, TO, BRANCH, null, null, null, null, null, null);
        double reportGross = card(report, "Gross Sales");
        double reportNet = card(report, "Net Sales");

        // (b) POS X/Z reporting block, built the way PosSessionService builds it
        SalesReturnReportingTotals posTotals = reportingService.forBranchAndDate(BRANCH, BUSINESS_DATE);
        NetSalesReportingBlock pos = NetSalesReportingBlock.of(
                bd("1050.00"), bd("50.00"), 10, posTotals);

        // Return value: Sales Report == POS
        assertEquals(bd("210.00"), posTotals.value());
        assertEquals(210.0, reportGross - reportNet, 0.001,
                "Sales Report's Gross-minus-Net must be exactly the return value the POS reports publish");

        // Net Sales: same basis, same number
        assertEquals(1050.0, reportGross, 0.001);
        assertEquals(840.0, reportNet, 0.001);
        assertEquals(bd("840.00"), pos.netSales());
        assertEquals(reportNet, pos.netSales().doubleValue(), 0.001,
                "Net Sales must be identical across the Sales Report and the POS reports");

        // ...and the basis is stated, not assumed.
        assertEquals("VAT_INCLUSIVE", SalesReturnReportingTotals.NET_SALES_BASIS);
        assertEquals("VAT_INCLUSIVE", pos.toSummaryMap().get("netSalesBasis"));
    }

    @Test
    void returnQuantityAndCashRefundReconcileAcrossTheSameTwoPaths() {
        SalesReturn ret = cashReturn("200.00", "10.00", "210.00", "210.00", 2);
        when(returnRepository.findByReturnDateAndBranchWithItems(BUSINESS_DATE, BRANCH))
                .thenReturn(List.of(ret));

        SalesReturnReportingTotals totals = reportingService.forBranchAndDate(BRANCH, BUSINESS_DATE);
        NetSalesReportingBlock block = NetSalesReportingBlock.of(bd("1050.00"), bd("50.00"), 10, totals);

        // Quantity: sold 10, returned 2, net 8 — the figure inventory reports must also show.
        assertEquals(2, totals.quantity());
        assertEquals(8, block.netQuantity());

        // Cash refund: the one figure the drawer's SALES_RETURN_REFUND movement is checked
        // against, and it is the settled amount rather than the document total.
        assertEquals(bd("210.00"), totals.cashRefund());
        assertEquals(bd("210.00"), block.cashRefund());
        assertEquals(bd("210.00"), totals.refundsPaidOut());
        // No money moved by any other instrument.
        assertEquals(BigDecimal.ZERO, totals.creditNotesIssued());
    }

    @Test
    void vatNetsReturnVatOnBothSidesAndNeverMixesTheTwoBases() {
        SalesInvoice invoice = invoice("INV-1", "1050.00", "50.00", 10);
        SalesReturn ret = cashReturn("200.00", "10.00", "210.00", "210.00", 2);

        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));
        when(returnRepository.findForReports(FROM, TO)).thenReturn(List.of(ret));

        SalesReportDataResponse summary = salesReport.getReport(
                "sales-summary", FROM, TO, BRANCH, null, null, null, null, null, null);
        SalesReportDataResponse tax = salesReport.getReport(
                "tax-summary", FROM, TO, BRANCH, null, null, null, null, null, null);

        // Sales VAT 50 - return VAT 10 = 40, and the two reports must say so with one voice.
        // The summary card used to publish the gross 50 while Tax Summary published 40.
        assertEquals(40.0, card(summary, "VAT Collected"), 0.001);
        assertEquals(40.0, card(tax, "Net VAT Payable"), 0.001);

        // The ex-VAT netting is done on BOTH sides — never by taking a VAT-inclusive return
        // off an ex-VAT sales figure, which would have given 1000 - 210 = 790.
        NetSalesReportingBlock block = NetSalesReportingBlock.of(
                bd("1050.00"), bd("50.00"), 10, reportingService.totalsOf(List.of(ret)));
        assertEquals(bd("800.00"), block.netSalesExTax());
        assertEquals(bd("40.00"), block.netTax());
        // Identity: netSalesExTax + netTax == netSales.
        assertEquals(block.netSales(), block.netSalesExTax().add(block.netTax()));
    }

    @Test
    void theSameDayAgreesAcrossTheSalesReportTheZReportAndThePersistedDayCloseSnapshot() {
        // The third leg the identity was missing. Net Sales agreeing between the Sales Report and
        // a freshly rendered Z-Report is not enough on its own: the Z-Report a branch actually
        // reconciles against months later is the PERSISTED Day Close snapshot, and until now that
        // row carried no returns-netted figure at all — only gross_sales (POS line gross) and
        // net_sales (the pre-returns taxable base). A reconciler comparing either of those to the
        // Sales Report was comparing two different quantities.
        SalesInvoice invoice = invoice("INV-1", "1050.00", "50.00", 10);
        SalesReturn ret = cashReturn("200.00", "10.00", "210.00", "210.00", 2);

        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));
        when(returnRepository.findForReports(FROM, TO)).thenReturn(List.of(ret));
        when(returnRepository.findByReturnDateAndBranchWithItems(BUSINESS_DATE, BRANCH))
                .thenReturn(List.of(ret));

        // (a) Back Office Sales Report
        SalesReportDataResponse report = salesReport.getReport(
                "sales-summary", FROM, TO, BRANCH, null, null, null, null, null, null);
        double reportNet = card(report, "Net Sales");

        // (b) the POS Z-Report summary, built and published the way PosSessionService does
        NetSalesReportingBlock block = NetSalesReportingBlock.of(
                bd("1050.00"), bd("50.00"), 10,
                reportingService.forBranchAndDate(BRANCH, BUSINESS_DATE));
        Map<String, Object> zSummary = new LinkedHashMap<>(block.toSummaryMap());

        // (c) the persisted Day Close snapshot, written from that summary the way closeDay does —
        //     by reading the block back out, never by recomputing gross - returns a second time.
        PosDayClose dayClose = new PosDayClose();
        NetSalesReportingBlock persisted = NetSalesReportingBlock.fromSummaryMap(zSummary);
        dayClose.setReportingGrossSales(persisted.grossSales());
        dayClose.setReportingReturnValue(persisted.returnValue());
        dayClose.setReportingNetSales(persisted.netSales());
        dayClose.setReportingNetSalesExTax(persisted.netSalesExTax());
        dayClose.setReportingNetSalesBasis(persisted.basis());
        // The two historical columns keep their own, different meanings on the same row.
        dayClose.setGrossSales(bd("1100.00"));
        dayClose.setNetSales(bd("1000.00"));

        // One number, three paths, on the one declared basis.
        assertEquals(840.0, reportNet, 0.001);
        assertEquals(bd("840.00"), block.netSales());
        assertEquals(bd("840.00"), dayClose.getReportingNetSales());
        assertEquals(reportNet, dayClose.getReportingNetSales().doubleValue(), 0.001,
                "Sales Report Net Sales == Z-Report Net Sales == persisted Day Close reporting Net Sales");
        assertEquals("VAT_INCLUSIVE", dayClose.getReportingNetSalesBasis());

        // And the snapshot's own historical columns were not restated into the new basis.
        assertEquals(bd("1100.00"), dayClose.getGrossSales());
        assertEquals(bd("1000.00"), dayClose.getNetSales());
    }

    // ---- scope correctness --------------------------------------------------

    @Test
    void theSalesReportSubtractsOnlyTheSelectedBranchsReturns() {
        SalesInvoice invoice = invoice("INV-1", "1050.00", "50.00", 10);
        SalesReturn mine = cashReturn("200.00", "10.00", "210.00", "210.00", 2);
        SalesReturn theirs = cashReturn("400.00", "20.00", "420.00", "420.00", 4);
        theirs.setBranch(branch(OTHER_BRANCH));

        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));
        when(returnRepository.findForReports(FROM, TO)).thenReturn(List.of(mine, theirs));

        SalesReportDataResponse report = salesReport.getReport(
                "sales-summary", FROM, TO, BRANCH, null, null, null, null, null, null);

        // 1050 - 210, and emphatically not 1050 - 630: the other branch's 420 belongs to the
        // other branch's books. This is the defect the branch filter closes.
        assertEquals(840.0, card(report, "Net Sales"), 0.001);
    }

    @Test
    void anUnapprovedReturnIsInvisibleToEveryReport() {
        SalesInvoice invoice = invoice("INV-1", "1050.00", "50.00", 10);
        SalesReturn draft = cashReturn("200.00", "10.00", "210.00", "210.00", 2);
        draft.setStatus(SalesReturnStatus.DRAFT);
        SalesReturn cancelled = cashReturn("400.00", "20.00", "420.00", "420.00", 4);
        cancelled.setStatus(SalesReturnStatus.CANCELLED);

        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));
        when(returnRepository.findForReports(FROM, TO)).thenReturn(List.of(draft, cancelled));

        SalesReportDataResponse report = salesReport.getReport(
                "sales-summary", FROM, TO, BRANCH, null, null, null, null, null, null);

        // Neither has moved stock, posted a journal nor settled anything, so Net Sales is
        // untouched. A DRAFT return used to reach the Returns column through a status check
        // that treated a null status as approved.
        assertEquals(1050.0, card(report, "Net Sales"), 0.001);
        assertEquals(BigDecimal.ZERO, reportingService.totalsOf(List.of(draft, cancelled)).value());
    }

    // ---- §12 the four settlement cases, as reported -------------------------
    //
    // The economic split itself is covered by SalesReturnSettlementSplitTest. What matters
    // here is the REPORTING consequence: the return value reported is the document total in
    // every case, while the refund bucket carries only the paid portion. Conflating the two is
    // how a part-paid invoice's return came to be reported as money paid out.

    @Test
    void caseAFullyUnpaidInvoiceReportsTheReturnValueWithNoRefundSettlement() {
        // Invoice 1000, paid 0, return 200 => unpaid 200, paid 0, settled by Customer Credit.
        SalesReturn ret = creditReturn("200.00", "0.00", 2);

        SalesReturnReportingTotals totals = reportingService.totalsOf(List.of(ret));

        assertEquals(bd("200.00"), totals.value(), "the return value reported is the document total");
        assertEquals(BigDecimal.ZERO, totals.refundsPaidOut(), "nothing was paid out");
        assertEquals(bd("0.00"), totals.customerCredit(), "and the paid portion it credits is zero");
        assertEquals(2, totals.quantity());
    }

    @Test
    void caseCReturnExceedingOutstandingReportsTheFullValueButRefundsOnlyThePaidPortion() {
        // Invoice 1000, paid 800, return 500 => unpaid 200, paid 300, cash-refunded.
        SalesReturn ret = cashReturn("500.00", "0.00", "500.00", "300.00", 5);

        SalesReturnReportingTotals totals = reportingService.totalsOf(List.of(ret));

        assertEquals(bd("500.00"), totals.value(),
                "sales net off by the whole 500, because all 500 of goods came back");
        assertEquals(bd("300.00"), totals.cashRefund(),
                "but only the 300 the customer had actually paid left the drawer");
        assertEquals(bd("300.00"), totals.refundsPaidOut());
    }

    @Test
    void caseDFullyPaidInvoiceRefundsTheWholeReturnValue() {
        // Invoice 1000, paid 1000, return 300 => unpaid 0, paid 300.
        SalesReturn ret = cashReturn("300.00", "0.00", "300.00", "300.00", 3);

        SalesReturnReportingTotals totals = reportingService.totalsOf(List.of(ret));

        assertEquals(bd("300.00"), totals.value());
        assertEquals(bd("300.00"), totals.cashRefund(), "value and refund coincide only here");
    }

    @Test
    void theHeaderInvariantHoldsAcrossAMixedDay() {
        SalesReturnReportingTotals totals = reportingService.totalsOf(List.of(
                cashReturn("200.00", "10.00", "210.00", "210.00", 2),
                cashReturn("500.00", "25.00", "525.00", "300.00", 5),
                creditReturn("100.00", "0.00", 1)));

        // value == base - discount + tax, on every scope, or no report built on it can foot.
        assertTrue(totals.isConsistent(),
                "value " + totals.value() + " != base " + totals.base()
                        + " - discount " + totals.discount() + " + tax " + totals.tax());
        assertEquals(bd("835.00"), totals.value());
        assertEquals(bd("35.00"), totals.tax());
        assertEquals(8, totals.quantity());
    }

    // ---- fixtures -----------------------------------------------------------

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    private static Branch branch(Long id) {
        Branch b = new Branch();
        b.setId(id);
        b.setName("Branch " + id);
        return b;
    }

    private static SalesInvoice invoice(String number, String total, String taxTotal, int qty) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(number);
        invoice.setInvoiceDate(BUSINESS_DATE);
        invoice.setBranchId(BRANCH);
        invoice.setCustomerName("Walk-in");
        invoice.setStatus(SalesInvoiceStatus.CONFIRMED);
        invoice.setSubTotal(new BigDecimal(total).subtract(new BigDecimal(taxTotal)));
        invoice.setTaxTotal(new BigDecimal(taxTotal));
        invoice.setInvoiceTotal(new BigDecimal(total));

        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setItemCode("SKU-1");
        item.setQuantity(qty);
        item.setTaxRate(5.0);
        item.setTaxAmount(new BigDecimal(taxTotal));
        item.setNetAmount(new BigDecimal(total));
        invoice.setItems(List.of(item));
        return invoice;
    }

    /** A cash-refunded return; {@code refunded} is the server-derived paid portion. */
    private static SalesReturn cashReturn(String subTotal, String tax, String total,
                                         String refunded, int qty) {
        SalesReturn ret = base(subTotal, tax, total, qty);
        ret.setRefundMethod(SalesReturnRefundMethod.CASH_REFUND);
        ret.setRefundAmount(new BigDecimal(refunded));
        return ret;
    }

    /** A Customer Credit return — the whole value is an AR allocation, nothing is paid out. */
    private static SalesReturn creditReturn(String total, String tax, int qty) {
        SalesReturn ret = base(new BigDecimal(total).add(new BigDecimal(tax)).toPlainString(),
                tax, total, qty);
        ret.setRefundMethod(SalesReturnRefundMethod.CUSTOMER_CREDIT);
        ret.setRefundAmount(new BigDecimal("0.00"));
        return ret;
    }

    private static SalesReturn base(String subTotal, String tax, String total, int qty) {
        SalesReturn ret = new SalesReturn();
        ret.setReturnNumber("SR-" + System.nanoTime());
        ret.setReturnDate(BUSINESS_DATE);
        ret.setTradingDate(BUSINESS_DATE);
        ret.setBranch(branch(BRANCH));
        ret.setStatus(SalesReturnStatus.APPROVED);
        ret.setSubTotal(new BigDecimal(subTotal));
        ret.setTaxAmount(new BigDecimal(tax));
        ret.setTotalAmount(new BigDecimal(total));

        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode("SKU-1");
        item.setReturnQty(qty);
        ret.setItems(new java.util.ArrayList<>(List.of(item)));
        return ret;
    }

    private static double card(SalesReportDataResponse report, String label) {
        return report.getCards().stream()
                .filter(c -> label.equals(c.get("label")))
                .mapToDouble(c -> c.get("value") instanceof Number n ? n.doubleValue() : 0d)
                .findFirst()
                .orElseThrow(() -> new AssertionError("no card labelled " + label));
    }
}
