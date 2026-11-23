package com.billbull.backend.document.share;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.quotation.Quotation;
import com.billbull.backend.sales.quotation.QuotationStatus;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderStatus;
import com.billbull.backend.settings.whatsapp.WhatsAppDocumentType;
import com.billbull.backend.settings.whatsapp.WhatsAppTemplateParams;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Locale;

/**
 * What the customer's page (and the WhatsApp message) says about a document: read live from the
 * document each time, so a payment made after the link was sent shows as paid.
 *
 * @param paid       null when the document type has no payments (quotation)
 * @param balance    null when the document type has no payments (quotation)
 * @param dueDate    invoice due date, quotation valid-till date, or order delivery date
 * @param dueLabel   what {@code dueDate} means on this document ("Due date", "Valid until", ...)
 * @param statusTone success | warning | danger | neutral — colours the status pill
 */
public record DocumentShareSummary(
        String documentType,
        String label,
        String documentNo,
        String customerName,
        LocalDate date,
        LocalDate dueDate,
        String dueLabel,
        String currency,
        BigDecimal total,
        BigDecimal paid,
        BigDecimal balance,
        String status,
        String statusLabel,
        String statusTone) {

    static final String SUCCESS = "success";
    static final String WARNING = "warning";
    static final String DANGER = "danger";
    static final String NEUTRAL = "neutral";

    public static DocumentShareSummary of(SalesInvoice inv, String companyCurrency, LocalDate today) {
        BigDecimal total = nz(inv.getInvoiceTotal());
        BigDecimal paid = nz(inv.getAmountPaid());
        BigDecimal balance = inv.getBalance() != null ? inv.getBalance() : total.subtract(paid);
        if (balance.signum() < 0) balance = BigDecimal.ZERO;
        LocalDate due = inv.getDueDate();

        String label;
        String tone;
        SalesInvoiceStatus status = inv.getStatus();
        if (status == SalesInvoiceStatus.CANCELLED) {
            label = "Cancelled"; tone = DANGER;
        } else if (status == SalesInvoiceStatus.DRAFT) {
            label = "Draft"; tone = NEUTRAL;
        } else if (balance.signum() == 0) {
            label = "Paid"; tone = SUCCESS;
        } else if (due != null && due.isBefore(today)) {
            label = "Overdue"; tone = DANGER;
        } else if (paid.signum() > 0) {
            label = "Partly paid"; tone = WARNING;
        } else {
            label = "Unpaid"; tone = WARNING;
        }
        return new DocumentShareSummary(
                WhatsAppDocumentType.SALES_INVOICE.name(), "Invoice", inv.getInvoiceNumber(),
                WhatsAppTemplateParams.customerName(inv.getCustomerName(), inv.getCustomerCode()),
                inv.getInvoiceDate(), due, "Due date", currency(companyCurrency),
                total, paid, balance, status == null ? null : status.name(), label, tone);
    }

    public static DocumentShareSummary of(Quotation q, String companyCurrency, LocalDate today) {
        QuotationStatus status = q.getStatus();
        String label;
        String tone;
        if (status == QuotationStatus.REJECTED) {
            label = "Rejected"; tone = DANGER;
        } else if (status == QuotationStatus.CONVERTED || status == QuotationStatus.INVOICED) {
            label = "Accepted"; tone = SUCCESS;
        } else if (status == QuotationStatus.EXPIRED || (q.getValidTill() != null && q.getValidTill().isBefore(today))) {
            label = "Expired"; tone = DANGER;
        } else {
            label = "Open"; tone = NEUTRAL;
        }
        String cur = q.getCurrency() != null && !q.getCurrency().isBlank() ? q.getCurrency() : companyCurrency;
        return new DocumentShareSummary(
                WhatsAppDocumentType.QUOTATION.name(), "Quotation", q.getQtnNo(),
                WhatsAppTemplateParams.customerName(q.getCustomer(), q.getCustomerCode()),
                q.getDate(), q.getValidTill(), "Valid until", currency(cur),
                nz(q.getTotalAmount()), null, null, status == null ? null : status.name(), label, tone);
    }

    public static DocumentShareSummary of(SalesOrder so, String companyCurrency) {
        BigDecimal total = nz(so.getOrderTotal());
        BigDecimal paid = nz(so.getAdvanceAmount());
        BigDecimal balance = so.getBalanceDue() != null ? so.getBalanceDue() : total.subtract(paid);
        if (balance.signum() < 0) balance = BigDecimal.ZERO;
        SalesOrderStatus status = so.getStatus();
        String label;
        String tone;
        if (status == null || status == SalesOrderStatus.DRAFT) {
            label = "Draft"; tone = NEUTRAL;
        } else if (status == SalesOrderStatus.DELIVERED || status == SalesOrderStatus.INVOICED) {
            label = humanize(status.name()); tone = SUCCESS;
        } else if (status == SalesOrderStatus.DISPATCHED || status == SalesOrderStatus.PARTIALLY_DELIVERED) {
            label = humanize(status.name()); tone = NEUTRAL;
        } else if (balance.signum() == 0 && total.signum() > 0) {
            label = "Paid"; tone = SUCCESS;
        } else if (paid.signum() > 0) {
            label = "Advance paid"; tone = WARNING;
        } else {
            label = "Confirmed"; tone = NEUTRAL;
        }
        return new DocumentShareSummary(
                WhatsAppDocumentType.SALES_ORDER.name(), "Sales Order", so.getSoNumber(),
                WhatsAppTemplateParams.customerName(so.getCustomerName(), so.getCustomerCode()),
                so.getOrderDate(), so.getExpectedDeliveryDate(), "Expected delivery", currency(companyCurrency),
                total, paid, balance, status == null ? null : status.name(), label, tone);
    }

    /** The same summary under another label ("Receipt"); null/blank keeps this one. */
    public DocumentShareSummary withLabel(String newLabel) {
        if (newLabel == null || newLabel.isBlank()) return this;
        return new DocumentShareSummary(documentType, newLabel, documentNo, customerName, date, dueDate, dueLabel,
                currency, total, paid, balance, status, statusLabel, statusTone);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String currency(String c) {
        return c == null || c.isBlank() ? "AED" : c.trim();
    }

    /** PARTIALLY_DELIVERED → "Partially delivered". */
    static String humanize(String enumName) {
        String s = enumName.replace('_', ' ').toLowerCase(Locale.ENGLISH);
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
