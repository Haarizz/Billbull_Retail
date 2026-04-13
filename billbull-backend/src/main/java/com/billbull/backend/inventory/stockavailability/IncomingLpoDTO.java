package com.billbull.backend.inventory.stockavailability;

import java.time.LocalDate;

public class IncomingLpoDTO {
    private String lpoNumber;
    private LocalDate expectedDate;
    private Integer quantity;
    private String supplierName;

    public IncomingLpoDTO() {
    }

    public IncomingLpoDTO(String lpoNumber, LocalDate expectedDate, Integer quantity, String supplierName) {
        this.lpoNumber = lpoNumber;
        this.expectedDate = expectedDate;
        this.quantity = quantity;
        this.supplierName = supplierName;
    }

    public String getLpoNumber() {
        return lpoNumber;
    }

    public void setLpoNumber(String lpoNumber) {
        this.lpoNumber = lpoNumber;
    }

    public LocalDate getExpectedDate() {
        return expectedDate;
    }

    public void setExpectedDate(LocalDate expectedDate) {
        this.expectedDate = expectedDate;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public String getSupplierName() {
        return supplierName;
    }

    public void setSupplierName(String supplierName) {
        this.supplierName = supplierName;
    }
}
