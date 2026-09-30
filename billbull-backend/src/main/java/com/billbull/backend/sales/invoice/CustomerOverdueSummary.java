package com.billbull.backend.sales.invoice;

import java.math.BigDecimal;

/**
 * How much one customer owes past its due date, and across how many invoices.
 *
 * <p>Carrier for the single grouped query behind
 * {@code SalesInvoiceRepository#overdueSummaryForCustomerCode} — the count and the amount
 * are read together so the details panel never issues two aggregates over the same rows,
 * and can never show a count and an amount taken from different instants.
 *
 * <p>The amount is the sum of the invoices' own persisted {@code balance}, never
 * {@code invoiceTotal} and never a subtraction performed downstream. "Overdue" here means
 * exactly {@code dueDate < today AND balance > 0}, within the same status window the rest
 * of the receivables figures use ({@code NOT IN (CANCELLED, PAID)}). An invoice due today
 * is not overdue.
 */
public class CustomerOverdueSummary {

    public static final CustomerOverdueSummary EMPTY =
            new CustomerOverdueSummary(0L, BigDecimal.ZERO);

    private final long invoiceCount;
    private final BigDecimal amount;

    /** Constructor expression target: {@code COUNT(s)} is a Long, {@code SUM(s.balance)} a BigDecimal. */
    public CustomerOverdueSummary(Long invoiceCount, BigDecimal amount) {
        this.invoiceCount = invoiceCount != null ? invoiceCount : 0L;
        this.amount = amount != null ? amount : BigDecimal.ZERO;
    }

    public long getInvoiceCount() {
        return invoiceCount;
    }

    public BigDecimal getAmount() {
        return amount;
    }
}
