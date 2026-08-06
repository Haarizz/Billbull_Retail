package com.billbull.backend.sales.payment;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Tests for the back-office payment breakdown.
 *
 * <p>The point of this service is that an administrative screen never has to parse an
 * invoice's {@code paymentMode} text again — so the cases that matter are the ones that text
 * cannot express: a split across several tenders, a historical "Mixed" sale, and card networks
 * that are not enum members.
 */
class InvoicePaymentSummaryServiceTest {

    @Mock private PaymentRepository paymentRepository;

    private InvoicePaymentSummaryService service;
    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        service = new InvoicePaymentSummaryService(paymentRepository);
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() throws Exception {
        mocks.close();
    }

    @Test
    void reconstructsAFourTenderSaleInTheOrderItWasTaken() {
        // The repository returns latest-first; the breakdown must read oldest-first so it
        // matches the receipt the customer was handed.
        when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of(
                payment("INV-1", "Online", "50.00", null, "1010 - FAB"),
                payment("INV-1", "Visa", "10.00", "AUTH-1", null),
                payment("INV-1", "Cash", "80.00", null, null)));

        InvoicePaymentSummary summary = service.summariesFor(List.of("INV-1")).get("INV-1");

        assertEquals(List.of("Cash", "Visa", "Online"),
                summary.getAllocations().stream().map(InvoicePaymentSummary.Allocation::getLabel).toList());
        assertEquals(List.of("CASH", "CARD", "ONLINE"),
                summary.getAllocations().stream().map(InvoicePaymentSummary.Allocation::getType).toList());
        assertEquals("Cash + Visa + Online", summary.getSummaryLabel());
        assertEquals(0, summary.getTotalReceived().compareTo(new BigDecimal("140.00")));
        assertEquals("AUTH-1", summary.getAllocations().get(1).getReference());
        assertEquals("1010 - FAB", summary.getAllocations().get(2).getBankName());
    }

    @Test
    void aHistoricalMixedSaleYieldsRealAllocationsNotTheOpaqueLabel() {
        // The invoice's stored paymentMode may say "Mixed"; its tender rows never did, so the
        // breakdown recovers what actually happened.
        when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of(
                payment("OLD-1", "Card", "40.00", null, null),
                payment("OLD-1", "Cash", "60.00", null, null)));

        InvoicePaymentSummary summary = service.summariesFor(List.of("OLD-1")).get("OLD-1");

        assertEquals("Cash + Card", summary.getSummaryLabel());
        assertTrue(!summary.getSummaryLabel().contains("Mixed"));
        assertEquals(2, summary.getAllocations().size());
    }

    @Test
    void treatsAnUnrecognisedModeLabelAsACardNetwork() {
        // "Mastercard"/"Amex" are the only labels the POS ever wrote that aren't enum members.
        when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of(
                payment("INV-2", "Mastercard", "100.00", null, null)));

        InvoicePaymentSummary summary = service.summariesFor(List.of("INV-2")).get("INV-2");

        assertEquals("CARD", summary.getAllocations().get(0).getType());
        assertEquals("Mastercard", summary.getAllocations().get(0).getLabel());
    }

    @Test
    void collapsesRepeatedTendersInTheSummaryButKeepsTheirRows() {
        when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of(
                payment("INV-3", "Cash", "30.00", null, null),
                payment("INV-3", "Cash", "20.00", null, null)));

        InvoicePaymentSummary summary = service.summariesFor(List.of("INV-3")).get("INV-3");

        assertEquals("Cash", summary.getSummaryLabel());
        assertEquals(2, summary.getAllocations().size());
        assertEquals(0, summary.getTotalReceived().compareTo(new BigDecimal("50.00")));
    }

    @Test
    void batchesSeveralInvoicesInOneQuery() {
        when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of(
                payment("INV-B", "Card", "20.00", null, null),
                payment("INV-A", "Cash", "10.00", null, null)));

        Map<String, InvoicePaymentSummary> summaries = service.summariesFor(List.of("INV-A", "INV-B"));

        assertEquals(2, summaries.size());
        assertEquals("Cash", summaries.get("INV-A").getSummaryLabel());
        assertEquals("Card", summaries.get("INV-B").getSummaryLabel());
    }

    @Test
    void anInvoiceWithNoRecordedTenderIsSimplyAbsent() {
        // An unpaid credit sale has nothing to show; the caller falls back to its status
        // rather than rendering an empty breakdown.
        when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of());

        assertTrue(service.summariesFor(List.of("INV-UNPAID")).isEmpty());
        assertNull(service.summaryFor("INV-UNPAID"));
    }

    @Test
    void handlesEmptyAndNullInput() {
        assertTrue(service.summariesFor(null).isEmpty());
        assertTrue(service.summariesFor(List.of()).isEmpty());
        assertTrue(service.summariesFor(java.util.Arrays.asList("", "  ")).isEmpty());
    }

    private Payment payment(String invoice, String mode, String amount, String reference, String bank) {
        Payment p = new Payment();
        p.setLinkedInvoice(invoice);
        p.setPaymentMode(mode);
        p.setAmount(new BigDecimal(amount));
        p.setReferenceNumber(reference);
        p.setBankName(bank);
        return p;
    }
}
