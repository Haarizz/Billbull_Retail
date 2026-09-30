package com.billbull.backend.sales.customerledger;

import java.math.BigDecimal;

/**
 * Read-only financial snapshot of one customer, backing the global search details panel.
 *
 * <p>Deliberately not the {@link Customer} entity: the panel needs identity plus three
 * figures, and shipping the whole aggregate would drag saved addresses, contacts,
 * documents and opening invoices across the wire for a hover-sized view.
 *
 * <p>The three money fields keep the semantics {@code CustomerService} already uses for
 * the customer list, and they are <em>not</em> interchangeable:
 *
 * <ul>
 *   <li>{@link #openingBalance} — {@code Customer.balance}, the balance carried in when
 *       the customer was set up. Not "the balance".
 *   <li>{@link #outstanding} — what is still owed now: invoice outstanding + opening
 *       outstanding. This is the list's {@code currentBalance}.
 *   <li>{@link #totalSales} — opening balance + everything invoiced, lifetime.
 * </ul>
 *
 * <p>{@link #totalPaid} is the lifetime settled figure, {@code totalSales - outstanding}.
 * It is derived from the two fields above it rather than from receipt vouchers on purpose:
 * a receipt-voucher sum misses any sale settled at the till without one, whereas this
 * definition is consistent with the other two figures by construction and can never
 * disagree with them.
 *
 * <p>{@link #overdueInvoiceCount} and {@link #overdueAmount} age the customer's own
 * invoices by their {@code dueDate}, counting only those still carrying a positive
 * balance. The overdue amount is a subset of {@link #outstanding} sliced by date, so it
 * belongs to the same tier of information and rides the same {@code sales.customer} gate;
 * the per-document recent-invoice list is separate and stays behind {@code sales.invoice}.
 *
 * <p>There is still no Due Amount or Last Transaction field here, and there will not be.
 * "Due Amount" would be {@link #outstanding} under a second name, and the panel derives
 * its Last Invoice from the bounded recent-invoice list rather than from a union across
 * every document type.
 */
public class CustomerSummaryResponse {

    private Long id;
    private String customerCode;
    private String customerName;
    private String status;
    private String branch;
    private String currency;

    /** {@code Customer.balance} — the opening balance, not the current one. */
    private BigDecimal openingBalance;

    /** Invoice outstanding + opening outstanding, the list's {@code currentBalance}. */
    private BigDecimal outstanding;

    /** Opening balance + lifetime invoiced. */
    private BigDecimal totalSales;

    /** Lifetime settled: {@code totalSales - outstanding}. Computed server-side. */
    private BigDecimal totalPaid;

    /** Invoices with {@code dueDate < today} and a positive balance. */
    private long overdueInvoiceCount;

    /** Sum of those invoices' own persisted balances. Never derived from invoice totals. */
    private BigDecimal overdueAmount;

    public CustomerSummaryResponse() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public BigDecimal getOpeningBalance() { return openingBalance; }
    public void setOpeningBalance(BigDecimal openingBalance) { this.openingBalance = openingBalance; }

    public BigDecimal getOutstanding() { return outstanding; }
    public void setOutstanding(BigDecimal outstanding) { this.outstanding = outstanding; }

    public BigDecimal getTotalSales() { return totalSales; }
    public void setTotalSales(BigDecimal totalSales) { this.totalSales = totalSales; }

    public BigDecimal getTotalPaid() { return totalPaid; }
    public void setTotalPaid(BigDecimal totalPaid) { this.totalPaid = totalPaid; }

    public long getOverdueInvoiceCount() { return overdueInvoiceCount; }
    public void setOverdueInvoiceCount(long overdueInvoiceCount) { this.overdueInvoiceCount = overdueInvoiceCount; }

    public BigDecimal getOverdueAmount() { return overdueAmount; }
    public void setOverdueAmount(BigDecimal overdueAmount) { this.overdueAmount = overdueAmount; }
}
