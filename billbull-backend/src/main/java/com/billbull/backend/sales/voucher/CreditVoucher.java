package com.billbull.backend.sales.voucher;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Store credit issued to a customer by a Sales Return settled as {@code CREDIT_VOUCHER}.
 *
 * <p><b>A voucher is not a coupon.</b> A coupon is a promotional discount that reduces the price
 * of a sale; a voucher is money the business owes the customer, carried on the balance sheet as a
 * liability (account 2061) until it is redeemed at the till. They are deliberately separate
 * subsystems — putting voucher balances in the Coupons module would turn a liability into a
 * discount and silently understate what the business owes.
 *
 * <p><b>Balance model.</b> {@code originalAmount = usedAmount + remainingAmount} is an invariant
 * enforced on every mutation ({@link #redeem}). {@code remainingAmount} is a materialised running
 * total; the authoritative history is the {@link CreditVoucherTransaction} ledger, so the balance
 * can always be reconstructed and audited.
 *
 * <p><b>Concurrency.</b> Redemption must take a pessimistic write lock on this row
 * ({@code CreditVoucherRepository.findByIdForUpdate}). Without it two terminals can each read the
 * same balance and both redeem it, spending the voucher twice.
 */
@Entity
@Table(name = "credit_vouchers", indexes = {
        @Index(name = "idx_credit_voucher_code", columnList = "voucher_code", unique = true),
        @Index(name = "idx_credit_voucher_number", columnList = "voucher_number", unique = true),
        @Index(name = "idx_credit_voucher_barcode", columnList = "barcode_value"),
        @Index(name = "idx_credit_voucher_customer", columnList = "customer_code"),
        @Index(name = "idx_credit_voucher_status_expiry", columnList = "status, expiry_date"),
        @Index(name = "idx_credit_voucher_source_return", columnList = "source_return_number"),
        @Index(name = "idx_credit_voucher_source_invoice", columnList = "source_invoice_number"),
        @Index(name = "idx_credit_voucher_branch", columnList = "branch_id")
})
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class CreditVoucher extends BaseEntity {

    /**
     * Human/business reference, e.g. {@code CV-2026-000184}. Printed on the voucher and used in
     * conversation with a customer. Never used as the redemption key.
     */
    @Column(name = "voucher_number", length = 40, nullable = false, unique = true)
    private String voucherNumber;

    /**
     * The redemption key, e.g. {@code 7KQ4-9PXM-2W8R}. Generated from a CSPRNG so it cannot be
     * guessed or enumerated from a neighbouring voucher — unlike the sequential voucher number,
     * which is safe to print but must never authorise anything on its own.
     */
    @Column(name = "voucher_code", length = 40, nullable = false, unique = true)
    private String voucherCode;

    /**
     * The machine-readable payload encoded into the printed barcode/QR. Held separately from
     * {@link #voucherCode} so the scannable representation can change format later without
     * invalidating already-issued codes.
     */
    @Column(name = "barcode_value", length = 80)
    private String barcodeValue;

    // ── Ownership ────────────────────────────────────────────────────────────

    /** Null for walk-in/guest returns, which the POS supports; such a voucher is bearer credit. */
    @Column(name = "customer_code", length = 100)
    private String customerCode;

    @Column(name = "customer_name", length = 255)
    private String customerName;

    @Column(name = "customer_mobile", length = 50)
    private String customerMobile;

    /** Branch that issued it. Redemption scope is governed by configuration, not by this alone. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    // ── Money ────────────────────────────────────────────────────────────────

    @Column(name = "original_amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal originalAmount = BigDecimal.ZERO;

    @Column(name = "used_amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal usedAmount = BigDecimal.ZERO;

    @Column(name = "remaining_amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal remainingAmount = BigDecimal.ZERO;

    @Column(name = "currency_code", length = 10)
    private String currencyCode;

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @Column(name = "issue_date", nullable = false)
    private LocalDate issueDate;

    /** Null means the voucher never expires, which is a valid configured policy. */
    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 25, nullable = false)
    private CreditVoucherStatus status = CreditVoucherStatus.ACTIVE;

    @Column(name = "cancelled_reason", length = 500)
    private String cancelledReason;

    @Column(name = "cancelled_by", length = 150)
    private String cancelledBy;

    @Column(name = "cancelled_at")
    private java.time.LocalDateTime cancelledAt;

    // ── Provenance ───────────────────────────────────────────────────────────

    /**
     * The Sales Return that issued this voucher. Unique, which is what makes voucher issuance
     * idempotent: a retried confirmation cannot produce a second voucher for the same refund
     * because the database refuses the duplicate.
     */
    @Column(name = "source_return_id")
    private Long sourceReturnId;

    @Column(name = "source_return_number", length = 60, unique = true)
    private String sourceReturnNumber;

    @Column(name = "source_invoice_number", length = 60)
    private String sourceInvoiceNumber;

    // ── Derived ──────────────────────────────────────────────────────────────

    /**
     * True when the expiry date has passed, regardless of stored status.
     *
     * <p>This — not {@link CreditVoucherStatus#EXPIRED} — is what refuses an expired redemption,
     * so a voucher is correctly rejected even if no sweep has run since it lapsed.
     */
    @Transient
    public boolean isExpiredOn(LocalDate asOf) {
        return expiryDate != null && asOf != null && asOf.isAfter(expiryDate);
    }

    /**
     * Applies a redemption, keeping {@code used + remaining = original} exact.
     *
     * <p>Callers must already hold the row lock. Rejects over-redemption rather than clamping:
     * silently trimming would let a cashier believe more credit was applied than actually was,
     * and the sale would then be under-settled.
     */
    public void redeem(BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Redemption amount must be positive.");
        }
        if (amount.compareTo(remainingAmount) > 0) {
            throw new IllegalArgumentException(
                    "Redemption of " + amount + " exceeds the remaining balance of " + remainingAmount + ".");
        }
        this.usedAmount = this.usedAmount.add(amount);
        this.remainingAmount = this.originalAmount.subtract(this.usedAmount);
        recalculateStatus();
    }

    /**
     * Re-derives status from the balance so the two can never disagree.
     *
     * <p>Terminal statuses are left alone: a cancelled voucher stays cancelled regardless of what
     * balance remains on it.
     */
    public void recalculateStatus() {
        if (status == CreditVoucherStatus.CANCELLED) return;
        if (remainingAmount.compareTo(BigDecimal.ZERO) <= 0) {
            status = CreditVoucherStatus.FULLY_REDEEMED;
        } else if (usedAmount.compareTo(BigDecimal.ZERO) > 0) {
            status = CreditVoucherStatus.PARTIALLY_REDEEMED;
        } else {
            status = CreditVoucherStatus.ACTIVE;
        }
    }

    // ── Getters & setters ────────────────────────────────────────────────────

    public String getVoucherNumber() { return voucherNumber; }
    public void setVoucherNumber(String voucherNumber) { this.voucherNumber = voucherNumber; }

    public String getVoucherCode() { return voucherCode; }
    public void setVoucherCode(String voucherCode) { this.voucherCode = voucherCode; }

    public String getBarcodeValue() { return barcodeValue; }
    public void setBarcodeValue(String barcodeValue) { this.barcodeValue = barcodeValue; }

    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getCustomerMobile() { return customerMobile; }
    public void setCustomerMobile(String customerMobile) { this.customerMobile = customerMobile; }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public BigDecimal getOriginalAmount() { return originalAmount; }
    public void setOriginalAmount(BigDecimal originalAmount) { this.originalAmount = originalAmount; }

    public BigDecimal getUsedAmount() { return usedAmount; }
    public void setUsedAmount(BigDecimal usedAmount) { this.usedAmount = usedAmount; }

    public BigDecimal getRemainingAmount() { return remainingAmount; }
    public void setRemainingAmount(BigDecimal remainingAmount) { this.remainingAmount = remainingAmount; }

    public String getCurrencyCode() { return currencyCode; }
    public void setCurrencyCode(String currencyCode) { this.currencyCode = currencyCode; }

    public LocalDate getIssueDate() { return issueDate; }
    public void setIssueDate(LocalDate issueDate) { this.issueDate = issueDate; }

    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }

    public CreditVoucherStatus getStatus() { return status; }
    public void setStatus(CreditVoucherStatus status) { this.status = status; }

    public String getCancelledReason() { return cancelledReason; }
    public void setCancelledReason(String cancelledReason) { this.cancelledReason = cancelledReason; }

    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String cancelledBy) { this.cancelledBy = cancelledBy; }

    public java.time.LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(java.time.LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }

    public Long getSourceReturnId() { return sourceReturnId; }
    public void setSourceReturnId(Long sourceReturnId) { this.sourceReturnId = sourceReturnId; }

    public String getSourceReturnNumber() { return sourceReturnNumber; }
    public void setSourceReturnNumber(String sourceReturnNumber) { this.sourceReturnNumber = sourceReturnNumber; }

    public String getSourceInvoiceNumber() { return sourceInvoiceNumber; }
    public void setSourceInvoiceNumber(String sourceInvoiceNumber) { this.sourceInvoiceNumber = sourceInvoiceNumber; }
}
