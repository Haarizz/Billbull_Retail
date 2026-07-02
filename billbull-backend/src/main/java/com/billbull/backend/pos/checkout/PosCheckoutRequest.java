package com.billbull.backend.pos.checkout;

import java.util.List;

public class PosCheckoutRequest {

    private String checkoutKey;
    private String customerCode;
    private String customerName;
    private String paymentMode;
    private String combinedPaymentMode;
    private Double amountTendered;
    private Double cashAmount;
    private Double cardAmount;
    /** Third settlement leg — Online/Bank Transfer amount (e.g. partial receipt against a Credit sale). */
    private Double onlineAmount;
    private String cardReference;
    private String cardType;
    /** Selected bank account for Online-mode payments, formatted "{code} - {name}"
     *  so PostingEngineService.resolveSelectedPaymentAccount() can resolve it back
     *  to the exact Chart-of-Accounts row for GL posting + reconciliation. */
    private String bankAccountName;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private Long sessionId;
    private String terminalId;
    private String counterName;
    private Double billDiscountAmount;
    private String notes;
    private String shippingAddress;
    private String driverName;
    private Long deliveryPersonEmployeeId;
    private String deliveryPersonEmployeeCode;
    private String deliveryDate;
    private String deliveryTimeSlot;
    private String deliveryNotes;
    private Double deliveryCharge;
    private Double shippingCharge;
    private Boolean taxInclusive;
    private List<PosCheckoutItem> items;

    public static class PosCheckoutItem {
        private String itemCode;
        private String itemName;
        private Integer quantity;
        private String unit;
        private Double price;
        private Double discount;
        private Double taxRate;
        /** Scanned batch number to pin to this line (overrides FEFO). Null = auto FEFO. */
        private String batchNumber;
        /** Cashier voided this line — retained for receipt/audit/reports, excluded from totals & stock. */
        private Boolean voided;
        /** Optional reason the cashier entered for voiding this line (displayed on receipt + audit log). */
        private String voidReason;
        /** Serial number scanned for a serialized product (Product.isSerial). */
        private String serialNumber;

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
        public String getVoidReason() { return voidReason; }
        public void setVoidReason(String voidReason) { this.voidReason = voidReason; }
        public String getSerialNumber() { return serialNumber; }
        public void setSerialNumber(String serialNumber) { this.serialNumber = serialNumber; }
    }

    // Getters & Setters

    public String getCheckoutKey() { return checkoutKey; }
    public void setCheckoutKey(String checkoutKey) { this.checkoutKey = checkoutKey; }
    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getPaymentMode() { return paymentMode; }
    public void setPaymentMode(String paymentMode) { this.paymentMode = paymentMode; }
    public String getCombinedPaymentMode() { return combinedPaymentMode; }
    public void setCombinedPaymentMode(String combinedPaymentMode) { this.combinedPaymentMode = combinedPaymentMode; }
    public Double getAmountTendered() { return amountTendered; }
    public void setAmountTendered(Double amountTendered) { this.amountTendered = amountTendered; }
    public Double getCashAmount() { return cashAmount; }
    public void setCashAmount(Double cashAmount) { this.cashAmount = cashAmount; }
    public Double getCardAmount() { return cardAmount; }
    public void setCardAmount(Double cardAmount) { this.cardAmount = cardAmount; }
    public Double getOnlineAmount() { return onlineAmount; }
    public void setOnlineAmount(Double onlineAmount) { this.onlineAmount = onlineAmount; }
    public String getCardReference() { return cardReference; }
    public void setCardReference(String cardReference) { this.cardReference = cardReference; }
    public String getCardType() { return cardType; }
    public void setCardType(String cardType) { this.cardType = cardType; }
    public String getBankAccountName() { return bankAccountName; }
    public void setBankAccountName(String bankAccountName) { this.bankAccountName = bankAccountName; }
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
    public Double getBillDiscountAmount() { return billDiscountAmount; }
    public void setBillDiscountAmount(Double billDiscountAmount) { this.billDiscountAmount = billDiscountAmount; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getShippingAddress() { return shippingAddress; }
    public void setShippingAddress(String shippingAddress) { this.shippingAddress = shippingAddress; }
    public String getDriverName() { return driverName; }
    public void setDriverName(String driverName) { this.driverName = driverName; }
    public Long getDeliveryPersonEmployeeId() { return deliveryPersonEmployeeId; }
    public void setDeliveryPersonEmployeeId(Long deliveryPersonEmployeeId) { this.deliveryPersonEmployeeId = deliveryPersonEmployeeId; }
    public String getDeliveryPersonEmployeeCode() { return deliveryPersonEmployeeCode; }
    public void setDeliveryPersonEmployeeCode(String deliveryPersonEmployeeCode) { this.deliveryPersonEmployeeCode = deliveryPersonEmployeeCode; }
    public String getDeliveryDate() { return deliveryDate; }
    public void setDeliveryDate(String deliveryDate) { this.deliveryDate = deliveryDate; }
    public String getDeliveryTimeSlot() { return deliveryTimeSlot; }
    public void setDeliveryTimeSlot(String deliveryTimeSlot) { this.deliveryTimeSlot = deliveryTimeSlot; }
    public String getDeliveryNotes() { return deliveryNotes; }
    public void setDeliveryNotes(String deliveryNotes) { this.deliveryNotes = deliveryNotes; }
    public Double getDeliveryCharge() { return deliveryCharge; }
    public void setDeliveryCharge(Double deliveryCharge) { this.deliveryCharge = deliveryCharge; }
    public Double getShippingCharge() { return shippingCharge; }
    public void setShippingCharge(Double shippingCharge) { this.shippingCharge = shippingCharge; }
    public Boolean getTaxInclusive() { return taxInclusive; }
    public void setTaxInclusive(Boolean taxInclusive) { this.taxInclusive = taxInclusive; }
    public List<PosCheckoutItem> getItems() { return items; }
    public void setItems(List<PosCheckoutItem> items) { this.items = items; }
}
