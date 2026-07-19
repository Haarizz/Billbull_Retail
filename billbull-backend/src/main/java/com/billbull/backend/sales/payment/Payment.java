package com.billbull.backend.sales.payment;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "sales_payments", indexes = {
    @Index(name = "idx_sales_payment_branch", columnList = "branch_id")
})
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
@jakarta.persistence.EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class Payment  implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable owner id for ownership filtering; stamped on persist by OwnershipAuditListener. Nullable forever. */
    @jakarta.persistence.Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Column(unique = true)
    private String paymentNumber;

    private LocalDate paymentDate;

    @Enumerated(EnumType.STRING)
    private PaymentType paymentType; // RECEIVED or MADE

    // Customer/Vendor Info
    private String customerCode;
    private String customerName;

    // Linked Invoice
    private String linkedInvoice;
    @Column(precision = 15, scale = 2)
    private BigDecimal invoiceAmount;
    @Column(precision = 15, scale = 2)
    private BigDecimal invoiceBalance;

    // Payment Details
    @Column(precision = 15, scale = 2)
    private BigDecimal amount;
    private String paymentMode; // Cash, Card, Bank Transfer, Cheque, Online
    private String referenceNumber;
    private String bankName;

    @Column(length = 1000)
    private String notes;
    private Long receiptVoucherRecordId;

    private LocalDate chequeDate; // ✅ Added Cheque Date

    @Enumerated(EnumType.STRING)
    private PaymentStatus status;

    private String createdBy;
    private LocalDate createdDate;

    private String splitGroupId; // shared UUID for all entries in the same split payment

    /* ===== GETTERS & SETTERS ===== */

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public String getPaymentNumber() {
        return paymentNumber;
    }

    public void setPaymentNumber(String paymentNumber) {
        this.paymentNumber = paymentNumber;
    }

    public LocalDate getPaymentDate() {
        return paymentDate;
    }

    public void setPaymentDate(LocalDate paymentDate) {
        this.paymentDate = paymentDate;
    }

    public PaymentType getPaymentType() {
        return paymentType;
    }

    public void setPaymentType(PaymentType paymentType) {
        this.paymentType = paymentType;
    }

    public String getCustomerCode() {
        return customerCode;
    }

    public void setCustomerCode(String customerCode) {
        this.customerCode = customerCode;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getLinkedInvoice() {
        return linkedInvoice;
    }

    public void setLinkedInvoice(String linkedInvoice) {
        this.linkedInvoice = linkedInvoice;
    }

    public BigDecimal getInvoiceAmount() {
        return invoiceAmount;
    }

    public void setInvoiceAmount(BigDecimal invoiceAmount) {
        this.invoiceAmount = invoiceAmount;
    }

    public BigDecimal getInvoiceBalance() {
        return invoiceBalance;
    }

    public void setInvoiceBalance(BigDecimal invoiceBalance) {
        this.invoiceBalance = invoiceBalance;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getPaymentMode() {
        return paymentMode;
    }

    public void setPaymentMode(String paymentMode) {
        this.paymentMode = paymentMode;
    }

    public String getReferenceNumber() {
        return referenceNumber;
    }

    public void setReferenceNumber(String referenceNumber) {
        this.referenceNumber = referenceNumber;
    }

    public String getBankName() {
        return bankName;
    }

    public void setBankName(String bankName) {
        this.bankName = bankName;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Long getReceiptVoucherRecordId() {
        return receiptVoucherRecordId;
    }

    public void setReceiptVoucherRecordId(Long receiptVoucherRecordId) {
        this.receiptVoucherRecordId = receiptVoucherRecordId;
    }

    public LocalDate getChequeDate() {
        return chequeDate;
    }

    public void setChequeDate(LocalDate chequeDate) {
        this.chequeDate = chequeDate;
    }

    public PaymentStatus getStatus() {
        return status;
    }

    public void setStatus(PaymentStatus status) {
        this.status = status;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public LocalDate getCreatedDate() {
        return createdDate;
    }

    public void setCreatedDate(LocalDate createdDate) {
        this.createdDate = createdDate;
    }

    public String getSplitGroupId() {
        return splitGroupId;
    }

    public void setSplitGroupId(String splitGroupId) {
        this.splitGroupId = splitGroupId;
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
