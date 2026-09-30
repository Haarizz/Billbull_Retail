package com.billbull.backend.sales.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One row of the "recent invoices" list in the customer details panel.
 *
 * <p>A deliberately small projection of {@link SalesInvoice}: the panel shows four
 * columns, while the entity carries line items, batch allocations, salesperson
 * attribution, delivery and payment state. None of that belongs in a search preview.
 *
 * <p>{@link #balance} is the invoice's own persisted {@code balance} field — the same
 * one the AR aggregates sum, maintained on every payment. It is echoed, never derived
 * from {@code invoiceTotal} minus something.
 */
public class CustomerRecentInvoiceResponse {

    private Long id;
    private String invoiceNumber;
    private LocalDate invoiceDate;
    private BigDecimal invoiceTotal;
    private BigDecimal balance;
    private String status;
    private String branchName;

    public CustomerRecentInvoiceResponse() {}

    public static CustomerRecentInvoiceResponse from(SalesInvoice invoice) {
        CustomerRecentInvoiceResponse r = new CustomerRecentInvoiceResponse();
        r.id = invoice.getId();
        r.invoiceNumber = invoice.getInvoiceNumber();
        r.invoiceDate = invoice.getInvoiceDate();
        r.invoiceTotal = invoice.getInvoiceTotal();
        r.balance = invoice.getBalance();
        r.status = invoice.getStatus() != null ? invoice.getStatus().name() : null;
        r.branchName = invoice.getBranchName();
        return r;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getInvoiceNumber() { return invoiceNumber; }
    public void setInvoiceNumber(String invoiceNumber) { this.invoiceNumber = invoiceNumber; }

    public LocalDate getInvoiceDate() { return invoiceDate; }
    public void setInvoiceDate(LocalDate invoiceDate) { this.invoiceDate = invoiceDate; }

    public BigDecimal getInvoiceTotal() { return invoiceTotal; }
    public void setInvoiceTotal(BigDecimal invoiceTotal) { this.invoiceTotal = invoiceTotal; }

    public BigDecimal getBalance() { return balance; }
    public void setBalance(BigDecimal balance) { this.balance = balance; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
}
