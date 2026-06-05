package com.billbull.backend.financials.receiptvoucher;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

@Entity
@Table(name = "sales_receipt_vouchers", indexes = {
    @Index(name = "idx_receipt_voucher_branch", columnList = "branch_id")
})
public class ReceiptVoucher extends BaseEntity {

    @Column(unique = true)
    private String voucherId; // e.g., RV-2026-001

    private LocalDate date;
    /** Legacy free-text branch label; kept until callers migrate to {@link #branchEntity}. */
    private String branch;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branchEntity;

    @Transient
    private Long branchEntityId;
    @Transient
    private String branchEntityName;
    @Transient
    private String branchEntityCode;

    private String memberName; // Employee or Payer
    private String category; // Income Source
    private BigDecimal amount;
    private String paymentMode;
    private String reference; // Description
    private String notes;
    private String status; // Completed, Pending, etc.

    // For file upload
    private String attachmentPath;
    private String attachmentName;

    @Column(name = "receipt_purpose")
    private ReceiptPurpose purpose = ReceiptPurpose.AGAINST_INVOICE; // Default to existing behavior

    // Settlement link — set when this receipt is created against a specific Sales Invoice
    private Long salesInvoiceId;

    // Set when this receipt is created against a Sales Order advance payment.
    // Used to (a) reprint the advance receipt from the SO screen and (b)
    // surface the advance on the downstream invoice generated from the SO.
    @Column(name = "sales_order_id")
    private Long salesOrderId;

    // Settlement link for customer opening-balance bills migrated outside SalesInvoice
    private Long openingInvoiceId;

    @Column(name = "bank_account")
    private String bankAccount;

    @Column(name = "cheque_date")
    private LocalDate chequeDate;

    // Denormalised customer code so the SoA can query receipts without joining to SalesInvoice.
    // Populated at creation time from the linked salesInvoice / openingInvoice / payment.
    @Column(name = "customer_code")
    private String customerCode;

    /**
     * Settlement discount granted to the customer on early payment (PDF §7 / Phase 4.3).
     * When > 0, posting engine adds a third line: Dr Discount Allowed (6050) / Cr AR (for the discount).
     */
    @Column(name = "discount_amount", precision = 15, scale = 2)
    private BigDecimal discountAmount;

    public ReceiptVoucher() {
    }

    // Getters and Setters
    public String getVoucherId() {
        return voucherId;
    }

    public void setVoucherId(String voucherId) {
        this.voucherId = voucherId;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public String getBranch() {
        return branch;
    }

    public Branch getBranchEntity() { return branchEntity; }
    public void setBranchEntity(Branch branchEntity) { this.branchEntity = branchEntity; }

    /** Call while the Hibernate session is still open to snapshot branch scalars for JSON serialization. */
    public void snapshotBranchFields() {
        if (branchEntity != null) {
            this.branchEntityId = branchEntity.getId();
            this.branchEntityName = branchEntity.getName();
            this.branchEntityCode = branchEntity.getCode();
        }
    }

    public Long getBranchEntityId() { return branchEntityId; }
    public void setBranchEntityId(Long branchEntityId) { this.branchEntityId = branchEntityId; }

    public String getBranchEntityName() { return branchEntityName; }
    public void setBranchEntityName(String branchEntityName) { this.branchEntityName = branchEntityName; }

    public String getBranchEntityCode() { return branchEntityCode; }
    public void setBranchEntityCode(String branchEntityCode) { this.branchEntityCode = branchEntityCode; }

    public void setBranch(String branch) {
        this.branch = branch;
    }

    public String getMemberName() {
        return memberName;
    }

    public void setMemberName(String memberName) {
        this.memberName = memberName;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
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

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getAttachmentPath() {
        return attachmentPath;
    }

    public void setAttachmentPath(String attachmentPath) {
        this.attachmentPath = attachmentPath;
    }

    public String getAttachmentName() {
        return attachmentName;
    }

    public void setAttachmentName(String attachmentName) {
        this.attachmentName = attachmentName;
    }

    public ReceiptPurpose getPurpose() {
        return purpose;
    }

    public void setPurpose(ReceiptPurpose purpose) {
        this.purpose = purpose;
    }

    public Long getSalesInvoiceId() {
        return salesInvoiceId;
    }

    public void setSalesInvoiceId(Long salesInvoiceId) {
        this.salesInvoiceId = salesInvoiceId;
    }

    public Long getSalesOrderId() {
        return salesOrderId;
    }

    public void setSalesOrderId(Long salesOrderId) {
        this.salesOrderId = salesOrderId;
    }

    public Long getOpeningInvoiceId() {
        return openingInvoiceId;
    }

    public void setOpeningInvoiceId(Long openingInvoiceId) {
        this.openingInvoiceId = openingInvoiceId;
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

    public String getCustomerCode() {
        return customerCode;
    }

    public void setCustomerCode(String customerCode) {
        this.customerCode = customerCode;
    }

    public BigDecimal getDiscountAmount() { return discountAmount; }
    public void setDiscountAmount(BigDecimal discountAmount) { this.discountAmount = discountAmount; }
}
