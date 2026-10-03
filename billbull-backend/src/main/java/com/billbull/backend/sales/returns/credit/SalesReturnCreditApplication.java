package com.billbull.backend.sales.returns.credit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One immutable allocation of a Sales Return's credit against one sales invoice.
 *
 * <p>This is the <b>unpaid portion</b> of a return: the part of the returned value the customer
 * had not yet paid for, which therefore cancels a receivable rather than becoming money owed
 * back. The sum of this table's {@code APPLIED} rows for an invoice is the third term in
 * {@link com.billbull.backend.sales.invoice.InvoiceBalanceService#recomputeInvoiceBalance}, so a
 * return credit reduces AR through the same projection that receipts and advance applications
 * already do. Nothing subtracts it after the fact, and no AR surface has to know it exists.
 *
 * <p>Modelled deliberately on {@code advance_applications}: a plain table, an identity key, an
 * applied amount, an applied date, a status, and no updates. A reversal is a new row. That
 * ledger is the one place in the codebase where a customer-credit instrument already folds
 * correctly into every AR surface at once, and copying its shape is what makes this one do the
 * same.
 *
 * <p><b>Not to be confused with held customer credit.</b> A row here is credit that has
 * <em>already been applied</em> to a named invoice. Credit a customer leaves on account
 * unapplied is a different economic instrument (a liability, not negative AR) and is not
 * represented here — in particular, no row is ever written with a synthetic invoice number to
 * stand in for unapplied credit.
 *
 * <p>Carries no GL entry of its own. The return journal already posted {@code Cr 1100} for the
 * full return value and the settlement leg debits back only the paid portion, so the residue
 * <em>is</em> the receivable reduction; posting an allocation journal would double-count it.
 */
@Entity
@Table(
    name = "sales_return_credit_applications",
    indexes = {
        @Index(name = "idx_srca_invoice",  columnList = "invoice_number"),
        @Index(name = "idx_srca_return",   columnList = "return_number"),
        @Index(name = "idx_srca_customer", columnList = "customer_code, status")
    }
)
public class SalesReturnCreditApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** FK → {@code sales_returns.id}. */
    @Column(name = "sales_return_id", nullable = false)
    private Long salesReturnId;

    /** Denormalised for traceability and for the idempotency index; never the join key. */
    @Column(name = "return_number", nullable = false)
    private String returnNumber;

    /** The invoice whose outstanding balance this row reduces. */
    @Column(name = "invoice_number", nullable = false)
    private String invoiceNumber;

    @Column(name = "customer_code", nullable = false)
    private String customerCode;

    @Column(name = "applied_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal appliedAmount;

    /** The return's authoritative business date, so every leg of one return shares one date. */
    @Column(name = "applied_date", nullable = false)
    private LocalDate appliedDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SalesReturnCreditApplicationStatus status = SalesReturnCreditApplicationStatus.APPLIED;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    public SalesReturnCreditApplication() {}

    public static SalesReturnCreditApplication applied(Long salesReturnId, String returnNumber,
                                                       String invoiceNumber, String customerCode,
                                                       BigDecimal appliedAmount, LocalDate appliedDate) {
        SalesReturnCreditApplication row = new SalesReturnCreditApplication();
        row.salesReturnId = salesReturnId;
        row.returnNumber = returnNumber;
        row.invoiceNumber = invoiceNumber;
        row.customerCode = customerCode;
        row.appliedAmount = appliedAmount;
        row.appliedDate = appliedDate;
        row.status = SalesReturnCreditApplicationStatus.APPLIED;
        return row;
    }

    public Long getId() { return id; }

    public Long getSalesReturnId() { return salesReturnId; }
    public void setSalesReturnId(Long salesReturnId) { this.salesReturnId = salesReturnId; }

    public String getReturnNumber() { return returnNumber; }
    public void setReturnNumber(String returnNumber) { this.returnNumber = returnNumber; }

    public String getInvoiceNumber() { return invoiceNumber; }
    public void setInvoiceNumber(String invoiceNumber) { this.invoiceNumber = invoiceNumber; }

    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }

    public BigDecimal getAppliedAmount() { return appliedAmount; }
    public void setAppliedAmount(BigDecimal appliedAmount) { this.appliedAmount = appliedAmount; }

    public LocalDate getAppliedDate() { return appliedDate; }
    public void setAppliedDate(LocalDate appliedDate) { this.appliedDate = appliedDate; }

    public SalesReturnCreditApplicationStatus getStatus() { return status; }
    public void setStatus(SalesReturnCreditApplicationStatus status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
