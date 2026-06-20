package com.billbull.backend.pos.search;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class PosBatchCheckResponse {

    public static class BatchSoldItem {
        private String itemCode;
        private String itemName;
        private String barcode;
        private String batchNumber;
        private String productImage;
        private Integer soldQty;
        private String status;

        // Invoice details
        private String invoiceNumber;
        private LocalDate invoiceDate;
        private LocalDateTime invoiceCreatedAt;
        private String customerCode;
        private String customerName;
        private String customerMobile;
        private String cashierName;
        private String branchName;
        private String paymentMode;
        private Double invoiceTotal;
        private Double itemPrice;
        private Double itemTaxAmount;
        private Double itemNetAmount;

        // Batch expiry
        private LocalDate expiryDate;

        public String getItemCode() { return itemCode; }
        public void setItemCode(String itemCode) { this.itemCode = itemCode; }
        public String getItemName() { return itemName; }
        public void setItemName(String itemName) { this.itemName = itemName; }
        public String getBarcode() { return barcode; }
        public void setBarcode(String barcode) { this.barcode = barcode; }
        public String getBatchNumber() { return batchNumber; }
        public void setBatchNumber(String batchNumber) { this.batchNumber = batchNumber; }
        public String getProductImage() { return productImage; }
        public void setProductImage(String productImage) { this.productImage = productImage; }
        public Integer getSoldQty() { return soldQty; }
        public void setSoldQty(Integer soldQty) { this.soldQty = soldQty; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getInvoiceNumber() { return invoiceNumber; }
        public void setInvoiceNumber(String invoiceNumber) { this.invoiceNumber = invoiceNumber; }
        public LocalDate getInvoiceDate() { return invoiceDate; }
        public void setInvoiceDate(LocalDate invoiceDate) { this.invoiceDate = invoiceDate; }
        public LocalDateTime getInvoiceCreatedAt() { return invoiceCreatedAt; }
        public void setInvoiceCreatedAt(LocalDateTime invoiceCreatedAt) { this.invoiceCreatedAt = invoiceCreatedAt; }
        public String getCustomerCode() { return customerCode; }
        public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }
        public String getCustomerName() { return customerName; }
        public void setCustomerName(String customerName) { this.customerName = customerName; }
        public String getCustomerMobile() { return customerMobile; }
        public void setCustomerMobile(String customerMobile) { this.customerMobile = customerMobile; }
        public String getCashierName() { return cashierName; }
        public void setCashierName(String cashierName) { this.cashierName = cashierName; }
        public String getBranchName() { return branchName; }
        public void setBranchName(String branchName) { this.branchName = branchName; }
        public String getPaymentMode() { return paymentMode; }
        public void setPaymentMode(String paymentMode) { this.paymentMode = paymentMode; }
        public Double getInvoiceTotal() { return invoiceTotal; }
        public void setInvoiceTotal(Double invoiceTotal) { this.invoiceTotal = invoiceTotal; }
        public Double getItemPrice() { return itemPrice; }
        public void setItemPrice(Double itemPrice) { this.itemPrice = itemPrice; }
        public Double getItemTaxAmount() { return itemTaxAmount; }
        public void setItemTaxAmount(Double itemTaxAmount) { this.itemTaxAmount = itemTaxAmount; }
        public Double getItemNetAmount() { return itemNetAmount; }
        public void setItemNetAmount(Double itemNetAmount) { this.itemNetAmount = itemNetAmount; }
        public LocalDate getExpiryDate() { return expiryDate; }
        public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }
    }

    private List<BatchSoldItem> results;
    private int total;

    public List<BatchSoldItem> getResults() { return results; }
    public void setResults(List<BatchSoldItem> results) { this.results = results; }
    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }
}
