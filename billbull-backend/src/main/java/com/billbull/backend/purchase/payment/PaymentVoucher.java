package com.billbull.backend.purchase.payment;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "payment_vouchers")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PaymentVoucher {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

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
    
    @Column(length = 500)
    private String notes;

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

	public String getNotes() {
		return notes;
	}

	public void setNotes(String notes) {
		this.notes = notes;
	}
}