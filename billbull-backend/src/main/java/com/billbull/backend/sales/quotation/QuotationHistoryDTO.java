package com.billbull.backend.sales.quotation;

import java.math.BigDecimal;
import java.time.LocalDate;

public class QuotationHistoryDTO {
    private String qtnNo;
    private LocalDate qtnDate;
    private BigDecimal quantity;
    private BigDecimal price;

    public QuotationHistoryDTO() {
    }

    public QuotationHistoryDTO(String qtnNo, LocalDate qtnDate, BigDecimal quantity, BigDecimal price) {
        this.qtnNo = qtnNo;
        this.qtnDate = qtnDate;
        this.quantity = quantity;
        this.price = price;
    }

    public String getQtnNo() {
        return qtnNo;
    }

    public void setQtnNo(String qtnNo) {
        this.qtnNo = qtnNo;
    }

    public LocalDate getQtnDate() {
        return qtnDate;
    }

    public void setQtnDate(LocalDate qtnDate) {
        this.qtnDate = qtnDate;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public void setQuantity(BigDecimal quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }
}