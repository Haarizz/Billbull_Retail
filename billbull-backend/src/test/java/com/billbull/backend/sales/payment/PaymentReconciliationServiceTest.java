package com.billbull.backend.sales.payment;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static com.billbull.backend.sales.payment.PaymentReconciliationFinding.Code;
import static com.billbull.backend.sales.payment.PaymentReconciliationFinding.Severity;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Tests for the payment reconciliation checks.
 *
 * <p>The value of this service is that it catches divergences nothing previously looked for,
 * so the tests are written as the failure modes a support engineer would be called about: a
 * settlement that half-committed, a double-submitted payment, a stale label. Each asserts the
 * specific code raised, because alerting keys off codes rather than message text.
 */
class PaymentReconciliationServiceTest {

    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private PaymentRepository paymentRepository;

    private PaymentReconciliationService service;
    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        // The summary service is pure mapping over the repository, so a real instance keeps
        // these tests honest about what the reconciliation actually sees.
        service = new PaymentReconciliationService(
                invoiceRepository, new InvoicePaymentSummaryService(paymentRepository));
        lenient().when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of());
    }

    @AfterEach
    void tearDown() throws Exception {
        mocks.close();
    }

    // ── The healthy case ───────────────────────────────────────────────────────

    @Test
    void aFullySettledSplitSaleReconciles() {
        givenInvoice("INV-1", "156.45", "156.45", "Cash + Visa + Online");
        givenTender(
                tender("INV-1", "Online", "50.00"),
                tender("INV-1", "Visa", "10.00"),
                tender("INV-1", "Cash", "96.45"));

        InvoicePaymentDiagnostics d = service.diagnose("INV-1");

        assertTrue(d.isConsistent());
        assertEquals(3, d.getAllocationCount());
        assertEquals(List.of("Cash", "Visa", "Online"), d.getAllocationOrder());
        assertEquals(List.of("CASH", "CARD", "ONLINE"), d.getAllocationTypes());
        assertEquals(0, d.getTotalReceived().compareTo(new BigDecimal("156.45")));
        assertEquals(0, d.getOutstanding().compareTo(BigDecimal.ZERO));
    }

    @Test
    void aCreditSaleWithAPartPaymentReconcilesWithTheRemainderOutstanding() {
        givenInvoice("INV-2", "156.45", "140.00", "Cash + Credit");
        givenTender(tender("INV-2", "Cash", "140.00"));

        InvoicePaymentDiagnostics d = service.diagnose("INV-2");

        assertEquals(0, d.getTotalReceived().compareTo(new BigDecimal("140.00")));
        assertEquals(0, d.getOutstanding().compareTo(new BigDecimal("16.45")));
        assertFalse(hasCode(d, Code.TOTALS_DO_NOT_RECONCILE));
    }

    // ── The failure modes ──────────────────────────────────────────────────────

    @Test
    void detectsASettlementThatHalfCommitted() {
        // The invoice was marked paid but no tender row was written — money the books think
        // was collected and the drawer has no record of.
        givenInvoice("INV-3", "100.00", "100.00", "Cash");
        givenTender();

        InvoicePaymentDiagnostics d = service.diagnose("INV-3");

        assertFalse(d.isConsistent());
        assertTrue(hasCode(d, Code.MISSING_PAYMENT_ROWS));
        assertTrue(messageFor(d, Code.MISSING_PAYMENT_ROWS).contains("100.00"));
    }

    @Test
    void detectsTenderThatDoesNotMatchTheInvoice() {
        givenInvoice("INV-4", "100.00", "100.00", "Cash");
        givenTender(tender("INV-4", "Cash", "90.00"));

        InvoicePaymentDiagnostics d = service.diagnose("INV-4");

        assertTrue(hasCode(d, Code.RECEIVED_DOES_NOT_MATCH_AMOUNT_PAID));
        // A shortfall is only a warning: an advance applied at invoice creation posts a
        // receipt voucher rather than a tender row and legitimately produces one.
        assertEquals(Severity.WARNING, severityFor(d, Code.RECEIVED_DOES_NOT_MATCH_AMOUNT_PAID));
        assertTrue(messageFor(d, Code.RECEIVED_DOES_NOT_MATCH_AMOUNT_PAID).contains("10.00"));
    }

    @Test
    void tenderExceedingTheInvoiceIsAnError() {
        givenInvoice("INV-5", "100.00", "100.00", "Cash");
        givenTender(tender("INV-5", "Cash", "130.00"));

        InvoicePaymentDiagnostics d = service.diagnose("INV-5");

        assertFalse(d.isConsistent());
        assertEquals(Severity.ERROR, severityFor(d, Code.RECEIVED_DOES_NOT_MATCH_AMOUNT_PAID));
        assertTrue(hasCode(d, Code.OVER_ALLOCATED));
    }

    @Test
    void cashOverpaymentIsNotFlagged() {
        // The customer handed over 200 for a 156.45 bill; 43.55 came back as change and was
        // never recorded as tender, so the books are correct and nothing should be raised.
        givenInvoice("INV-6", "156.45", "156.45", "Cash");
        givenTender(tender("INV-6", "Cash", "156.45"));

        assertTrue(service.diagnose("INV-6").isConsistent());
    }

    @Test
    void detectsADoubleSubmittedPayment() {
        // Same mode, same amount, same auth code — one card payment recorded twice.
        givenInvoice("INV-7", "100.00", "100.00", "Visa");
        givenTender(
                tender("INV-7", "Visa", "50.00", "AUTH-9"),
                tender("INV-7", "Visa", "50.00", "AUTH-9"));

        InvoicePaymentDiagnostics d = service.diagnose("INV-7");

        assertTrue(hasCode(d, Code.DUPLICATE_PAYMENT_ROW));
        assertTrue(messageFor(d, Code.DUPLICATE_PAYMENT_ROW).contains("AUTH-9"));
    }

    @Test
    void repeatingATenderWithoutAReferenceIsNotADuplicate() {
        // Cash 20 then Cash 30 is a legitimate progressive allocation, not a double-submit.
        givenInvoice("INV-8", "50.00", "50.00", "Cash");
        givenTender(tender("INV-8", "Cash", "20.00"), tender("INV-8", "Cash", "30.00"));

        InvoicePaymentDiagnostics d = service.diagnose("INV-8");

        assertFalse(hasCode(d, Code.DUPLICATE_PAYMENT_ROW));
        assertTrue(d.isConsistent());
    }

    @Test
    void detectsANonPositiveTenderRow() {
        givenInvoice("INV-9", "100.00", "100.00", "Cash");
        givenTender(tender("INV-9", "Cash", "100.00"), tender("INV-9", "Visa", "0.00"));

        InvoicePaymentDiagnostics d = service.diagnose("INV-9");

        assertTrue(hasCode(d, Code.NON_POSITIVE_ALLOCATION));
        assertFalse(d.isConsistent());
    }

    @Test
    void detectsAStaleStoredLabel() {
        givenInvoice("INV-10", "100.00", "100.00", "Cash");
        givenTender(tender("INV-10", "Cash", "60.00"), tender("INV-10", "Visa", "40.00"));

        InvoicePaymentDiagnostics d = service.diagnose("INV-10");

        assertTrue(hasCode(d, Code.STORED_SUMMARY_STALE));
        assertEquals(Severity.WARNING, severityFor(d, Code.STORED_SUMMARY_STALE));
        // Cosmetic only — the figures still add up, so the invoice is not "inconsistent".
        assertTrue(d.isConsistent());
        assertTrue(d.isHasWarnings());
    }

    @Test
    void doesNotFlagAReorderedLabelAsStale() {
        // Order is presentational; the set of tenders is the claim.
        givenInvoice("INV-11", "100.00", "100.00", "Visa + Cash");
        givenTender(tender("INV-11", "Cash", "60.00"), tender("INV-11", "Visa", "40.00"));

        assertFalse(hasCode(service.diagnose("INV-11"), Code.STORED_SUMMARY_STALE));
    }

    @Test
    void reportsAHistoricalMixedLabelAsInformationOnly() {
        givenInvoice("OLD-1", "100.00", "100.00", "Mixed");
        // Repository order is latest-first; the service reverses it so the breakdown reads
        // in the order the tenders were taken.
        givenTender(tender("OLD-1", "Card", "40.00"), tender("OLD-1", "Cash", "60.00"));

        InvoicePaymentDiagnostics d = service.diagnose("OLD-1");

        assertTrue(hasCode(d, Code.LEGACY_MIXED_LABEL));
        assertEquals(Severity.INFO, severityFor(d, Code.LEGACY_MIXED_LABEL));
        // The breakdown is recovered from the rows, so the invoice still reconciles.
        assertTrue(d.isConsistent());
        assertEquals("Cash + Card", d.getDerivedSummaryLabel());
    }

    @Test
    void anUnpaidCreditSaleWithNoTenderIsConsistent() {
        givenInvoice("INV-12", "100.00", "0.00", "Credit");
        givenTender();

        InvoicePaymentDiagnostics d = service.diagnose("INV-12");

        assertTrue(d.isConsistent());
        assertEquals(0, d.getOutstanding().compareTo(new BigDecimal("100.00")));
    }

    // ── Batch + lookup ─────────────────────────────────────────────────────────

    @Test
    void diagnosesManyInvoicesWithoutPerInvoiceQueries() {
        when(invoiceRepository.findByInvoiceNumberIn(any())).thenReturn(List.of(
                invoice("INV-A", "100.00", "100.00", "Cash"),
                invoice("INV-B", "50.00", "50.00", "Visa")));
        givenTender(tender("INV-A", "Cash", "100.00"), tender("INV-B", "Visa", "50.00"));

        List<InvoicePaymentDiagnostics> all = service.diagnoseAll(List.of("INV-A", "INV-B"));

        assertEquals(2, all.size());
        assertTrue(all.stream().allMatch(InvoicePaymentDiagnostics::isConsistent));
        // One tender query for the whole batch, not one per invoice.
        org.mockito.Mockito.verify(paymentRepository, org.mockito.Mockito.times(1))
                .findTenderForInvoices(any());
    }

    @Test
    void skipsUnknownInvoiceNumbersInABatchRatherThanFailingIt() {
        when(invoiceRepository.findByInvoiceNumberIn(any()))
                .thenReturn(List.of(invoice("INV-A", "100.00", "100.00", "Cash")));
        givenTender(tender("INV-A", "Cash", "100.00"));

        assertEquals(1, service.diagnoseAll(List.of("INV-A", "NOPE")).size());
    }

    @Test
    void anUnknownInvoiceIsDistinguishedFromAnInconsistentOne() {
        when(invoiceRepository.findByInvoiceNumber("NOPE")).thenReturn(Optional.empty());
        assertThrows(IllegalArgumentException.class, () -> service.diagnose("NOPE"));
    }

    @Test
    void handlesEmptyInput() {
        assertTrue(service.diagnoseAll(null).isEmpty());
        assertTrue(service.diagnoseAll(List.of()).isEmpty());
    }

    // ── Fixtures ───────────────────────────────────────────────────────────────

    private void givenInvoice(String number, String total, String paid, String mode) {
        when(invoiceRepository.findByInvoiceNumber(number))
                .thenReturn(Optional.of(invoice(number, total, paid, mode)));
    }

    private void givenTender(Payment... payments) {
        when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of(payments));
    }

    private SalesInvoice invoice(String number, String total, String paid, String mode) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(number);
        inv.setInvoiceTotal(new BigDecimal(total));
        inv.setAmountPaid(new BigDecimal(paid));
        inv.setPaymentMode(mode);
        return inv;
    }

    private Payment tender(String invoice, String mode, String amount) {
        return tender(invoice, mode, amount, null);
    }

    private Payment tender(String invoice, String mode, String amount, String reference) {
        Payment p = new Payment();
        p.setLinkedInvoice(invoice);
        p.setPaymentMode(mode);
        p.setAmount(new BigDecimal(amount));
        p.setReferenceNumber(reference);
        return p;
    }

    private boolean hasCode(InvoicePaymentDiagnostics d, Code code) {
        return d.getFindings().stream().anyMatch(f -> f.getCode() == code);
    }

    private String messageFor(InvoicePaymentDiagnostics d, Code code) {
        return d.getFindings().stream().filter(f -> f.getCode() == code)
                .findFirst().map(PaymentReconciliationFinding::getMessage).orElse("");
    }

    private Severity severityFor(InvoicePaymentDiagnostics d, Code code) {
        return d.getFindings().stream().filter(f -> f.getCode() == code)
                .findFirst().map(PaymentReconciliationFinding::getSeverity).orElse(null);
    }
}
