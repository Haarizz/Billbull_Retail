package com.billbull.backend.pos.layaway;

import java.time.LocalDate;
import java.util.List;

/**
 * Request to create a layaway from the current POS cart. Item shape mirrors
 * PosCheckoutRequest.PosCheckoutItem so the same frontend mapping is reused.
 */
public class PosLayawayCreateRequest {

    private String customerCode;
    private String customerName;
    private String customerPhone;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private Long sessionId;
    private String terminalId;
    private String counterName;
    private String cashierName;

    private Double depositAmount;
    private String depositPaymentMode;
    private Boolean depositRequired;
    private LocalDate dueDate;
    private String remarks;
    private Boolean reserveStockRequested;
    private Double billDiscountAmount;
    /** When true this is a POS "Hold": deposit is forced to zero and a real customer
     *  is not required (Walk-in holds allowed). Otherwise a normal layaway. */
    private Boolean hold;
    private Boolean taxInclusive;

    private List<PosLayawayItemRequest> items;

    public static class PosLayawayItemRequest {
        private String itemCode;
        private String itemName;
        private Integer quantity;
        private String unit;
        private Double price;
        private Double discount;
        private Double taxRate;
        /** Scanned batch number to reserve for this line (batch-controlled items). */
        private String batchNumber;
        /** True when this line was voided in the cart before saving the layaway. */
        private Boolean voided;

        public String getItemCode() { return itemCode; }
        public void setItemCode(String itemCode) { this.itemCode = itemCode; }
        public String getItemName() { return itemName; }
        public void setItemName(String itemName) { this.itemName = itemName; }
        public Integer getQuantity() { return quantity; }
        public void setQuantity(Integer quantity) { this.quantity = quantity; }
        public String getUnit() { return unit; }
        public void setUnit(String unit) { this.unit = unit; }
        public Double getPrice() { return price; }
        public void setPrice(Double price) { this.price = price; }
        public Double getDiscount() { return discount; }
        public void setDiscount(Double discount) { this.discount = discount; }
        public Double getTaxRate() { return taxRate; }
        public void setTaxRate(Double taxRate) { this.taxRate = taxRate; }
        public String getBatchNumber() { return batchNumber; }
        public void setBatchNumber(String batchNumber) { this.batchNumber = batchNumber; }
        public Boolean getVoided() { return voided; }
        public void setVoided(Boolean voided) { this.voided = voided; }
    }

    // Getters & Setters

    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String customerPhone) { this.customerPhone = customerPhone; }
    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
    public String getBranchCode() { return branchCode; }
    public void setBranchCode(String branchCode) { this.branchCode = branchCode; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }
    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }
    public String getCashierName() { return cashierName; }
    public void setCashierName(String cashierName) { this.cashierName = cashierName; }
    public Double getDepositAmount() { return depositAmount; }
    public void setDepositAmount(Double depositAmount) { this.depositAmount = depositAmount; }
    public String getDepositPaymentMode() { return depositPaymentMode; }
    public void setDepositPaymentMode(String depositPaymentMode) { this.depositPaymentMode = depositPaymentMode; }
    public Boolean getDepositRequired() { return depositRequired; }
    public void setDepositRequired(Boolean depositRequired) { this.depositRequired = depositRequired; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
    public Boolean getReserveStockRequested() { return reserveStockRequested; }
    public void setReserveStockRequested(Boolean reserveStockRequested) { this.reserveStockRequested = reserveStockRequested; }
    public Double getBillDiscountAmount() { return billDiscountAmount; }
    public void setBillDiscountAmount(Double billDiscountAmount) { this.billDiscountAmount = billDiscountAmount; }
    public Boolean getHold() { return hold; }
    public void setHold(Boolean hold) { this.hold = hold; }
    public Boolean getTaxInclusive() { return taxInclusive; }
    public void setTaxInclusive(Boolean taxInclusive) { this.taxInclusive = taxInclusive; }
    public List<PosLayawayItemRequest> getItems() { return items; }
    public void setItems(List<PosLayawayItemRequest> items) { this.items = items; }
}
