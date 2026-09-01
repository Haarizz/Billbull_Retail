package com.billbull.backend.sales.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
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

import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.returns.SalesReturnStatus;

/**
 * Regression tests for the sales VAT reports (Tax Summary and VAT Output Register).
 *
 * <p>These lock the corrections to three defects that made both reports disagree with the
 * VAT actually charged:
 * <ul>
 *   <li>the taxable basis was taken from the invoice header {@code subTotal}, which is the
 *       PRE-bill-discount figure and lumps zero-rated value in with standard-rated value;</li>
 *   <li>zero-rated sales were therefore counted twice — once inside "Taxable Sales" and again
 *       in the "Zero-Rated Sales" bucket;</li>
 *   <li>the returns adjustment used the gross refund ({@code totalAmount}, base + VAT) as a
 *       taxable amount, and the VAT rate column was hardcoded to 5%.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class SalesReportVatTest {

    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private SalesReturnRepository returnRepository;
    @Mock private SalesOrderRepository orderRepository;
    @Mock private DeliveryNoteRepository deliveryNoteRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private ProductRepository productRepository;
    @Mock private PaymentRepository paymentRepository;

    private SalesReportDataService service;

    private static final LocalDate FROM = LocalDate.of(2026, 1, 1);
    private static final LocalDate TO = LocalDate.of(2026, 3, 31);

    @BeforeEach
    void setUp() {
        service = new SalesReportDataService(invoiceRepository, returnRepository, orderRepository,
                deliveryNoteRepository, customerRepository, productRepository, paymentRepository);

        lenient().when(productRepository.findActiveProductReportBasics()).thenReturn(List.of());
        lenient().when(customerRepository.findAll()).thenReturn(List.of());
        lenient().when(orderRepository.findForReports(any(), any())).thenReturn(List.of());
        lenient().when(deliveryNoteRepository.findForReports(any(), any())).thenReturn(List.of());
        lenient().when(returnRepository.findForReports(any(), any())).thenReturn(List.of());
        lenient().when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of());
    }

    @Test
    void taxSummarySplitsStandardRatedFromZeroRatedInsteadOfDoubleCounting() {
        // One invoice: 1000 @ 5% (VAT 50) plus 400 zero-rated. Header subTotal deliberately
        // carries the whole 1400 — the old code read it as the standard-rated basis.
        SalesInvoice invoice = invoice("INV-1", "1400.00", "50.00",
                line("1000.00", "50.00", 5.0),
                line("400.00", "0.00", 0.0));
        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));

        SalesReportDataResponse report = service.getReport("tax-summary", FROM, TO, null, null, null, null, null, null, null);

        Map<String, Object> taxableRow = rowNamed(report, "Taxable Sales");
        Map<String, Object> zeroRow = rowNamed(report, "Zero-Rated Sales");

        // Standard-rated basis is the 1000 that VAT was charged on — not the 1400 header total.
        assertEquals(1000.0, num(taxableRow.get("taxableAmount")), 0.001);
        assertEquals(50.0, num(taxableRow.get("vatAmount")), 0.001);
        // ...and the 400 appears only once, in its own bucket.
        assertEquals(400.0, num(zeroRow.get("taxableAmount")), 0.001);
        // Rate is derived (50/1000), not the hardcoded 5.
        assertEquals(5.0, num(taxableRow.get("rate")), 0.001);
    }

    @Test
    void taxSummaryAdjustsReturnsAtExVatValueNotGrossRefund() {
        SalesInvoice invoice = invoice("INV-1", "1000.00", "50.00", line("1000.00", "50.00", 5.0));
        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));
        // Refund of 210 gross = 200 base + 10 VAT.
        when(returnRepository.findForReports(FROM, TO)).thenReturn(List.of(
                salesReturn("200.00", "10.00", "210.00")));

        SalesReportDataResponse report = service.getReport("tax-summary", FROM, TO, null, null, null, null, null, null, null);

        Map<String, Object> adjustment = rowNamed(report, "Adjustments / Returns");
        // The taxable-amount column takes the ex-VAT base (-200), never the gross refund (-210).
        assertEquals(-200.0, num(adjustment.get("taxableAmount")), 0.001);
        assertEquals(-10.0, num(adjustment.get("vatAmount")), 0.001);

        double netPayable = report.getCards().stream()
                .filter(c -> "Net VAT Payable".equals(c.get("label")))
                .mapToDouble(c -> num(c.get("value")))
                .findFirst().orElseThrow();
        assertEquals(40.0, netPayable, 0.001); // 50 output - 10 reversed
    }

    @Test
    void vatOutputRegisterFootsAndBlendsMixedRates() {
        // 1000 @ 5% + 1000 zero-rated: a 2.5% blended rate, not the 5% an unweighted
        // mean of the line rates would report.
        SalesInvoice invoice = invoice("INV-1", "9999.00", "50.00",
                line("1000.00", "50.00", 5.0),
                line("1000.00", "0.00", 0.0));
        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));

        SalesReportDataResponse report = service.getReport("vat-output-register", FROM, TO, null, null, null, null, null, null, null);

        Map<String, Object> row = report.getRows().get(0);
        assertEquals(2000.0, num(row.get("taxableAmount")), 0.001);
        assertEquals(50.0, num(row.get("vatAmount")), 0.001);
        assertEquals(2.5, num(row.get("vatRate")), 0.001);
        // Total must be base + VAT so the register foots against its own columns.
        assertEquals(2050.0, num(row.get("total")), 0.001);
    }

    @Test
    void vatReportsIgnoreVoidedLines() {
        SalesInvoiceItem voided = line("500.00", "25.00", 5.0);
        voided.setVoided(Boolean.TRUE);
        SalesInvoice invoice = invoice("INV-1", "1500.00", "50.00",
                line("1000.00", "50.00", 5.0), voided);
        when(invoiceRepository.findForReports(FROM, TO)).thenReturn(List.of(invoice));

        SalesReportDataResponse report = service.getReport("vat-output-register", FROM, TO, null, null, null, null, null, null, null);

        Map<String, Object> row = report.getRows().get(0);
        assertEquals(1000.0, num(row.get("taxableAmount")), 0.001);
        assertEquals(50.0, num(row.get("vatAmount")), 0.001);
    }

    // ---------- fixtures ----------

    /** A line whose persisted netAmount is VAT-inclusive (taxable + tax), as the app stores it. */
    private static SalesInvoiceItem line(String taxable, String tax, double taxRate) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setItemCode("SKU-1");
        item.setQuantity(1);
        item.setTaxRate(taxRate);
        item.setTaxAmount(new BigDecimal(tax));
        item.setNetAmount(new BigDecimal(taxable).add(new BigDecimal(tax)));
        return item;
    }

    private static SalesInvoice invoice(String number, String subTotal, String taxTotal, SalesInvoiceItem... items) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(number);
        invoice.setInvoiceDate(LocalDate.of(2026, 2, 1));
        invoice.setCustomerName("Walk-in");
        invoice.setStatus(SalesInvoiceStatus.CONFIRMED);
        invoice.setSubTotal(new BigDecimal(subTotal));
        invoice.setTaxTotal(new BigDecimal(taxTotal));
        invoice.setItems(List.of(items));
        return invoice;
    }

    private static SalesReturn salesReturn(String subTotal, String tax, String total) {
        SalesReturn ret = new SalesReturn();
        ret.setReturnDate(LocalDate.of(2026, 2, 10));
        ret.setStatus(SalesReturnStatus.APPROVED);
        ret.setSubTotal(new BigDecimal(subTotal));
        ret.setTaxAmount(new BigDecimal(tax));
        ret.setTotalAmount(new BigDecimal(total));
        return ret;
    }

    private static Map<String, Object> rowNamed(SalesReportDataResponse report, String name) {
        return report.getRows().stream()
                .filter(r -> name.equals(r.get("name")))
                .findFirst().orElseThrow(() -> new AssertionError("no row named " + name));
    }

    private static double num(Object value) {
        return value instanceof Number number ? number.doubleValue() : 0d;
    }
}
