package com.billbull.backend.purchase.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;

public class InvoiceItemBatchDraft {

    private Long id;
    private String batchNumber;
    private String batchBarcode;
    private LocalDate expiryDate;
    private Integer unitIndex;
    private Integer quantity;
    private BigDecimal unitCost;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getBatchNumber() {
        return batchNumber;
    }

    public void setBatchNumber(String batchNumber) {
        this.batchNumber = batchNumber;
    }

    public String getBatchBarcode() {
        return batchBarcode;
    }

    public void setBatchBarcode(String batchBarcode) {
        this.batchBarcode = batchBarcode;
    }

    public LocalDate getExpiryDate() {
        return expiryDate;
    }

    public void setExpiryDate(LocalDate expiryDate) {
        this.expiryDate = expiryDate;
    }

    public Integer getUnitIndex() {
        return unitIndex;
    }

    public void setUnitIndex(Integer unitIndex) {
        this.unitIndex = unitIndex;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }
}
