package com.billbull.backend.document.share;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.quotation.Quotation;
import com.billbull.backend.sales.quotation.QuotationStatus;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class DocumentShareSummaryTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 20);

    @Test
    void invoiceWithPartPaymentIsPartlyPaidWithItsBalance() {
        SalesInvoice inv = invoice("250.00", "200.00", "50.00", SalesInvoiceStatus.PARTIALLY_PAID, TODAY.plusDays(7));
        DocumentShareSummary s = DocumentShareSummary.of(inv, "AED", TODAY);
        assertThat(s.statusLabel()).isEqualTo("Partly paid");
        assertThat(s.statusTone()).isEqualTo("warning");
        assertThat(s.balance()).isEqualByComparingTo("50.00");
        assertThat(s.currency()).isEqualTo("AED");
        assertThat(s.label()).isEqualTo("Invoice");
    }

    @Test
    void invoiceWithNoBalanceIsPaidWhateverTheStoredStatus() {
        SalesInvoice inv = invoice("250.00", "250.00", "0", SalesInvoiceStatus.POSTED, null);
        assertThat(DocumentShareSummary.of(inv, "AED", TODAY).statusLabel()).isEqualTo("Paid");
    }

    @Test
    void invoicePastItsDueDateWithABalanceIsOverdue() {
        SalesInvoice inv = invoice("100", "0", "100", SalesInvoiceStatus.POSTED, TODAY.minusDays(1));
        assertThat(DocumentShareSummary.of(inv, "AED", TODAY).statusLabel()).isEqualTo("Overdue");
    }

    @Test
    void cancelledInvoiceSaysCancelledEvenWithABalance() {
        SalesInvoice inv = invoice("100", "0", "100", SalesInvoiceStatus.CANCELLED, null);
        assertThat(DocumentShareSummary.of(inv, "AED", TODAY).statusLabel()).isEqualTo("Cancelled");
    }

    @Test
    void invoiceWithoutStoredBalanceFallsBackToTotalMinusPaid() {
        SalesInvoice inv = invoice("300", "100", null, SalesInvoiceStatus.POSTED, null);
        DocumentShareSummary s = DocumentShareSummary.of(inv, null, TODAY);
        assertThat(s.balance()).isEqualByComparingTo("200");
        assertThat(s.currency()).isEqualTo("AED");
    }

    @Test
    void customerCodeSuffixIsStripped() {
        SalesInvoice inv = invoice("1", "0", "1", SalesInvoiceStatus.POSTED, null);
        inv.setCustomerName("Hari Krishnan - C001");
        inv.setCustomerCode("C001");
        assertThat(DocumentShareSummary.of(inv, "AED", TODAY).customerName()).isEqualTo("Hari Krishnan");
    }

    @Test
    void quotationPastValidTillIsExpiredAndHasNoPayments() {
        Quotation q = new Quotation();
        q.setQtnNo("QTN-1");
        q.setTotalAmount(new BigDecimal("99"));
        q.setValidTill(TODAY.minusDays(1));
        q.setStatus(QuotationStatus.APPROVED);
        q.setCurrency("USD");
        DocumentShareSummary s = DocumentShareSummary.of(q, "AED", TODAY);
        assertThat(s.statusLabel()).isEqualTo("Expired");
        assertThat(s.paid()).isNull();
        assertThat(s.balance()).isNull();
        assertThat(s.currency()).isEqualTo("USD");
        assertThat(s.dueLabel()).isEqualTo("Valid until");
    }

    @Test
    void salesOrderWithAdvanceShowsAdvancePaid() {
        SalesOrder so = new SalesOrder();
        so.setSoNumber("SO-1");
        so.setOrderTotal(new BigDecimal("500"));
        so.setAdvanceAmount(new BigDecimal("100"));
        so.setBalanceDue(new BigDecimal("400"));
        so.setStatus(SalesOrderStatus.PARTIALLY_PAID);
        DocumentShareSummary s = DocumentShareSummary.of(so, "AED");
        assertThat(s.statusLabel()).isEqualTo("Advance paid");
        assertThat(s.balance()).isEqualByComparingTo("400");
    }

    @Test
    void salesOrderDeliveredIsHumanized() {
        SalesOrder so = new SalesOrder();
        so.setStatus(SalesOrderStatus.PARTIALLY_DELIVERED);
        assertThat(DocumentShareSummary.of(so, "AED").statusLabel()).isEqualTo("Partially delivered");
    }

    private static SalesInvoice invoice(String total, String paid, String balance, SalesInvoiceStatus status, LocalDate due) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber("INV-1");
        inv.setInvoiceTotal(new BigDecimal(total));
        inv.setAmountPaid(new BigDecimal(paid));
        inv.setBalance(balance == null ? null : new BigDecimal(balance));
        inv.setStatus(status);
        inv.setDueDate(due);
        return inv;
    }
}
