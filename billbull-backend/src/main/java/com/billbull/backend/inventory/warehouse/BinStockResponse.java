package com.billbull.backend.inventory.warehouse;

import java.time.LocalDate;

public class BinStockResponse {

    private Long id;
    private String productCode;
    private String productName;
    private String batchNumber;
    private Integer quantity;
    private Integer reservedQuantity;
    private LocalDate expiryDate;

    public BinStockResponse() {
    }

    public BinStockResponse(BinStock stock) {
        this.id = stock.getId();
        this.productCode = stock.getProductCode();
        this.productName = stock.getProductName();
        this.batchNumber = stock.getBatchNumber();
        this.quantity = stock.getQuantity();
        this.reservedQuantity = stock.getReservedQuantity();
        this.expiryDate = stock.getExpiryDate();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
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
}
