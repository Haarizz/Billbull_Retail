package com.billbull.backend.inventory.warehouse;

import java.time.LocalDate;

public class BinStockResponse {

    private Long id;
    private String stockIdentityKey;
    private String productCode;
    private String productName;
    private String batchNumber;
    private String serialNumber;
    private Integer quantity;
    private Integer reservedQuantity;
    private LocalDate expiryDate;
    private boolean negativeOverride;

    public BinStockResponse() {
    }

    public BinStockResponse(BinStock stock) {
        this.id = stock.getId();
        this.stockIdentityKey = String.valueOf(stock.getId());
        this.productCode = stock.getProductCode();
        this.productName = stock.getProductName();
        this.batchNumber = stock.getBatchNumber();
        this.serialNumber = null;
        this.quantity = stock.getQuantity() != null ? stock.getQuantity().intValue() : 0;
        this.reservedQuantity = stock.getReservedQuantity() != null ? stock.getReservedQuantity().intValue() : 0;
        this.expiryDate = stock.getExpiryDate();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getStockIdentityKey() {
        return stockIdentityKey;
    }

    public void setStockIdentityKey(String stockIdentityKey) {
        this.stockIdentityKey = stockIdentityKey;
    }

    public String getProductCode() {
        return productCode;
    }

    public void setProductCode(String productCode) {
        this.productCode = productCode;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public String getBatchNumber() {
        return batchNumber;
    }

    public void setBatchNumber(String batchNumber) {
        this.batchNumber = batchNumber;
    }

    public String getSerialNumber() {
        return serialNumber;
    }

    public void setSerialNumber(String serialNumber) {
        this.serialNumber = serialNumber;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public Integer getReservedQuantity() {
        return reservedQuantity;
    }

    public void setReservedQuantity(Integer reservedQuantity) {
        this.reservedQuantity = reservedQuantity;
    }

    public LocalDate getExpiryDate() {
        return expiryDate;
    }

    public void setExpiryDate(LocalDate expiryDate) {
        this.expiryDate = expiryDate;
    }

    public boolean isNegativeOverride() {
        return negativeOverride;
    }

    public void setNegativeOverride(boolean negativeOverride) {
        this.negativeOverride = negativeOverride;
    }
}
