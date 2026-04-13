package com.billbull.backend.sales.payment;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;

import java.time.LocalDate;

@Entity
@Table(name = "sales_payments")
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

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
    private Double invoiceAmount;
    private Double invoiceBalance;

    // Payment Details
    private Double amount;
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

    /* ===== GETTERS & SETTERS ===== */

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

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

    public Double getInvoiceAmount() {
        return invoiceAmount;
    }

    public void setInvoiceAmount(Double invoiceAmount) {
        this.invoiceAmount = invoiceAmount;
    }

    public Double getInvoiceBalance() {
        return invoiceBalance;
    }

    public void setInvoiceBalance(Double invoiceBalance) {
        this.invoiceBalance = invoiceBalance;
    }

    public Double getAmount() {
        return amount;
    }

    public void setAmount(Double amount) {
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
}
