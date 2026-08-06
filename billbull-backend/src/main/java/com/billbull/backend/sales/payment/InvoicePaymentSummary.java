package com.billbull.backend.sales.payment;

import java.math.BigDecimal;
import java.util.List;

/**
 * How one invoice was actually paid, expressed as payment allocations.
 *
 * <p>Built from the recorded {@code sales_payments} rows rather than the invoice's stored
 * {@code paymentMode} text. Those rows are the persisted form of the cashier's allocations —
 * one per tender — so this reconstructs the same picture the till showed, for any screen that
 * needs it after the fact (sales list, invoice details, customer history, exports).
 *
 * <p>Works for historical invoices too: a sale recorded before progressive payments still has
 * its Payment rows, so it yields real allocations rather than an opaque "Mixed" label.
 */
public class InvoicePaymentSummary {

    /** One recorded tender. */
    public static class Allocation {
        private final String label;
        private final String type;
        private final BigDecimal amount;
        private final String reference;
        private final String bankName;

        public Allocation(String label, String type, BigDecimal amount, String reference, String bankName) {
            this.label = label;
            this.type = type;
            this.amount = amount;
            this.reference = reference;
            this.bankName = bankName;
        }

        public String getLabel() { return label; }
        /** CASH | CARD | ONLINE | CREDIT | ADVANCE, inferred from the recorded mode label. */
        public String getType() { return type; }
        public BigDecimal getAmount() { return amount; }
        public String getReference() { return reference; }
        public String getBankName() { return bankName; }
    }

    private final String invoiceNumber;
    private final List<Allocation> allocations;
    /** De-duplicated, in recorded order: "Cash + Visa + Online". Never "Mixed". */
    private final String summaryLabel;
    private final BigDecimal totalReceived;

    public InvoicePaymentSummary(String invoiceNumber, List<Allocation> allocations,
                                 String summaryLabel, BigDecimal totalReceived) {
        this.invoiceNumber = invoiceNumber;
        this.allocations = allocations;
        this.summaryLabel = summaryLabel;
        this.totalReceived = totalReceived;
    }

    public String getInvoiceNumber() { return invoiceNumber; }
    public List<Allocation> getAllocations() { return allocations; }
    public String getSummaryLabel() { return summaryLabel; }
    public BigDecimal getTotalReceived() { return totalReceived; }
}
