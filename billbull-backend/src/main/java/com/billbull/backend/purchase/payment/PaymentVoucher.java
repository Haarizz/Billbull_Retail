package com.billbull.backend.purchase.payment;

import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "payment_vouchers", indexes = {
    @Index(name = "idx_purchase_payment_branch", columnList = "branch_id"),
    // Supports the paginated list query: branch scope + status filter, ordered by date.
    @Index(name = "idx_purchase_payment_branch_status_date", columnList = "branch_id, status, payment_date"),
    @Index(name = "idx_purchase_payment_status", columnList = "status"),
    @Index(name = "idx_purchase_payment_date", columnList = "payment_date"),
    // Speeds the per-vendor payment-total aggregates used by the vendor list.
    @Index(name = "idx_purchase_payment_vendor_name", columnList = "vendor_name")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@jakarta.persistence.EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class PaymentVoucher  implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable owner id for ownership filtering; stamped on persist by OwnershipAuditListener. Nullable forever. */
    @jakarta.persistence.Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Column(name = "voucher_number", unique = true)
    private String voucherNumber;

    @Column(name = "vendor_name", nullable = false)
    private String vendorName;

    @Column(name = "vendor_id")
    private String vendorId;

    @Column(name = "payment_date", nullable = false)
    private LocalDate paymentDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_mode", nullable = false)
    private PaymentMode paymentMode;

    @Column(nullable = false)
    private BigDecimal amount;

    private BigDecimal allocated = BigDecimal.ZERO;
    private BigDecimal unallocated = BigDecimal.ZERO;

    @Column(name = "reference_number")
    private String referenceNumber; 

    @Enumerated(EnumType.STRING)
    private PaymentStatus status;

    @Column(name = "invoice_id")
    private Long invoiceId;

    @Column(name = "lpo_id")
    private Long lpoId;

    @Column(name = "bank_account")
    private String bankAccount;

    @Column(name = "cheque_date")
    private LocalDate chequeDate;

    @Column(length = 500)
    private String notes;

    /**
     * Settlement discount received from vendor on early payment (PDF §12 / Phase 4.4).
     * When > 0, posting engine adds a third line: Cr Discount Received (7001).
     */
    @Column(name = "discount_amount", precision = 15, scale = 2)
    private BigDecimal discountAmount;

    @PrePersist
    public void prePersist() {
        if (this.status == null) {
            this.status = PaymentStatus.PENDING_APPROVAL;
        }
        if (this.unallocated == null) {
            this.unallocated = this.amount;
        }
    }

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public String getVoucherNumber() {
		return voucherNumber;
	}

	public void setVoucherNumber(String voucherNumber) {
		this.voucherNumber = voucherNumber;
	}

	public String getVendorName() {
		return vendorName;
	}

	public void setVendorName(String vendorName) {
		this.vendorName = vendorName;
	}

	public String getVendorId() {
		return vendorId;
	}

	public void setVendorId(String vendorId) {
		this.vendorId = vendorId;
	}

	public LocalDate getPaymentDate() {
		return paymentDate;
	}

	public void setPaymentDate(LocalDate paymentDate) {
		this.paymentDate = paymentDate;
	}

	public PaymentMode getPaymentMode() {
		return paymentMode;
	}

	public void setPaymentMode(PaymentMode paymentMode) {
		this.paymentMode = paymentMode;
	}

	public BigDecimal getAmount() {
		return amount;
	}

	public void setAmount(BigDecimal amount) {
		this.amount = amount;
	}

	public BigDecimal getAllocated() {
		return allocated;
	}

	public void setAllocated(BigDecimal allocated) {
		this.allocated = allocated;
	}

	public BigDecimal getUnallocated() {
		return unallocated;
	}

	public void setUnallocated(BigDecimal unallocated) {
		this.unallocated = unallocated;
	}

	public String getReferenceNumber() {
		return referenceNumber;
	}

	public void setReferenceNumber(String referenceNumber) {
		this.referenceNumber = referenceNumber;
	}

	public PaymentStatus getStatus() {
		return status;
	}

	public void setStatus(PaymentStatus status) {
		this.status = status;
	}

	public Long getInvoiceId() {
		return invoiceId;
	}

	public void setInvoiceId(Long invoiceId) {
		this.invoiceId = invoiceId;
	}

	public Long getLpoId() {
		return lpoId;
	}

	public void setLpoId(Long lpoId) {
		this.lpoId = lpoId;
	}

	public String getBankAccount() {
		return bankAccount;
	}

	public void setBankAccount(String bankAccount) {
		this.bankAccount = bankAccount;
	}

	public LocalDate getChequeDate() {
		return chequeDate;
	}

	public void setChequeDate(LocalDate chequeDate) {
		this.chequeDate = chequeDate;
	}

	public String getNotes() {
		return notes;
	}

	public void setNotes(String notes) {
		this.notes = notes;
	}

    @Override
    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    @Override
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
}
