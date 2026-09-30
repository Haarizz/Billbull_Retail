package com.billbull.backend.purchase.vendor;

import java.math.BigDecimal;

/**
 * Read-only payables snapshot of one vendor, backing the global search details panel.
 *
 * <p>Vendor accounting is not customer accounting mirrored. The figures here follow
 * {@code VendorService.list()} exactly:
 *
 * <ul>
 *   <li>{@link #openingBalance} — {@code Vendor.openingBalance} as entered.
 *   <li>{@link #openingBalanceOutstanding} — {@code max(0, openingBalance − onAccountPaid)}:
 *       what remains of the opening balance after payments not linked to any invoice.
 *   <li>{@link #payableBalance} — {@code invoiceOutstanding + openingBalanceOutstanding},
 *       where invoice outstanding is {@code max(0, gross of POSTED unpaid/partial
 *       invoices − invoice-linked payments)}.
 *   <li>{@link #totalPaid} — lifetime POSTED/CLEARED payment vouchers for this vendor.
 *       This one <em>is</em> an existing unambiguous definition
 *       ({@code PaymentVoucherRepository.sumPaymentsByVendorName}), unlike its customer
 *       counterpart, which is why the vendor panel has a Total Paid and the customer
 *       panel does not.
 * </ul>
 *
 * <p>{@link #overdueInvoiceCount} is a count and nothing more. Whether an invoice is
 * settled is a fact it already carries in its own {@code paymentStatus}, so counting the
 * unsettled ones whose {@code dueDate} has passed invents nothing. An overdue *amount* is
 * a different matter and is deliberately absent: {@code PurchaseInvoice} carries no
 * per-invoice balance the way {@code SalesInvoice} does, and netting vendor-level payments
 * against these particular invoices would attribute money to documents it was never
 * applied to. The customer panel therefore shows an overdue amount and this one does not.
 *
 * <p>There is likewise no per-invoice due amount here.
 */
public class VendorSummaryResponse {

    private Long id;
    private String vendorCode;
    private String vendorName;
    private String status;
    private String branch;
    private String currency;

    private BigDecimal openingBalance;
    private BigDecimal openingBalanceOutstanding;
    private BigDecimal payableBalance;
    private BigDecimal totalPaid;

    /** POSTED, not-fully-paid invoices whose due date has passed. Count only — see above. */
    private long overdueInvoiceCount;

    public VendorSummaryResponse() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getVendorCode() { return vendorCode; }
    public void setVendorCode(String vendorCode) { this.vendorCode = vendorCode; }

    public String getVendorName() { return vendorName; }
    public void setVendorName(String vendorName) { this.vendorName = vendorName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public BigDecimal getOpeningBalance() { return openingBalance; }
    public void setOpeningBalance(BigDecimal openingBalance) { this.openingBalance = openingBalance; }

    public BigDecimal getOpeningBalanceOutstanding() { return openingBalanceOutstanding; }
    public void setOpeningBalanceOutstanding(BigDecimal v) { this.openingBalanceOutstanding = v; }

    public BigDecimal getPayableBalance() { return payableBalance; }
    public void setPayableBalance(BigDecimal payableBalance) { this.payableBalance = payableBalance; }

    public BigDecimal getTotalPaid() { return totalPaid; }
    public void setTotalPaid(BigDecimal totalPaid) { this.totalPaid = totalPaid; }

    public long getOverdueInvoiceCount() { return overdueInvoiceCount; }
    public void setOverdueInvoiceCount(long overdueInvoiceCount) { this.overdueInvoiceCount = overdueInvoiceCount; }
}
