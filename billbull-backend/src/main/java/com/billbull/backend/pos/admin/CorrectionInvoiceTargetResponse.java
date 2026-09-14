package com.billbull.backend.pos.admin;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One invoice-number typeahead hit for POS Administration &gt; Transaction Corrections.
 *
 * <p>Operators think in invoice numbers, not settlement-record ids, so the correction form asks
 * for an invoice and this DTO carries the resolved {@code RECEIPT_VOUCHER} target id behind it —
 * the receipt voucher is still the corrected record (it is the row that actually carries
 * {@code customerCode}/{@code paymentMode}/{@code amount} and has a GL posting to mirror).
 *
 * <p>{@code correctable == false} means the invoice exists but has nothing correctable behind it
 * yet (typically an unpaid/draft invoice with no settlement receipt); {@code blockReason} says why,
 * so the UI can grey the row out instead of letting the request fail at submit time.
 */
public class CorrectionInvoiceTargetResponse {

    private Long invoiceId;
    private String invoiceNumber;
    private LocalDate invoiceDate;
    private String invoiceStatus;
    private String customerCode;
    private String customerName;
    private BigDecimal invoiceTotal;
    private String branchName;

    private Long receiptVoucherId;
    private String receiptVoucherNumber;
    private String receiptCustomerCode;
    private String receiptPaymentMode;
    private BigDecimal receiptAmount;

    private boolean correctable;
    private String blockReason;

    public Long getInvoiceId() { return invoiceId; }
    public void setInvoiceId(Long invoiceId) { this.invoiceId = invoiceId; }
    public String getInvoiceNumber() { return invoiceNumber; }
    public void setInvoiceNumber(String invoiceNumber) { this.invoiceNumber = invoiceNumber; }
    public LocalDate getInvoiceDate() { return invoiceDate; }
    public void setInvoiceDate(LocalDate invoiceDate) { this.invoiceDate = invoiceDate; }
    public String getInvoiceStatus() { return invoiceStatus; }
    public void setInvoiceStatus(String invoiceStatus) { this.invoiceStatus = invoiceStatus; }
    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public BigDecimal getInvoiceTotal() { return invoiceTotal; }
    public void setInvoiceTotal(BigDecimal invoiceTotal) { this.invoiceTotal = invoiceTotal; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
    public Long getReceiptVoucherId() { return receiptVoucherId; }
    public void setReceiptVoucherId(Long receiptVoucherId) { this.receiptVoucherId = receiptVoucherId; }
    public String getReceiptVoucherNumber() { return receiptVoucherNumber; }
    public void setReceiptVoucherNumber(String receiptVoucherNumber) { this.receiptVoucherNumber = receiptVoucherNumber; }
    public String getReceiptCustomerCode() { return receiptCustomerCode; }
    public void setReceiptCustomerCode(String receiptCustomerCode) { this.receiptCustomerCode = receiptCustomerCode; }
    public String getReceiptPaymentMode() { return receiptPaymentMode; }
    public void setReceiptPaymentMode(String receiptPaymentMode) { this.receiptPaymentMode = receiptPaymentMode; }
    public BigDecimal getReceiptAmount() { return receiptAmount; }
    public void setReceiptAmount(BigDecimal receiptAmount) { this.receiptAmount = receiptAmount; }
    public boolean isCorrectable() { return correctable; }
    public void setCorrectable(boolean correctable) { this.correctable = correctable; }
    public String getBlockReason() { return blockReason; }
    public void setBlockReason(String blockReason) { this.blockReason = blockReason; }
}
