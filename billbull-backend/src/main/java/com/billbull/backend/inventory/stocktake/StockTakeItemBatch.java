package com.billbull.backend.inventory.stocktake;

import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
    name = "stock_take_item_batches",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_stock_take_item_batch",
        columnNames = { "stock_take_item_id", "batch_number" }
    ),
    indexes = {
        @Index(name = "idx_stib_item", columnList = "stock_take_item_id"),
        @Index(name = "idx_stib_expiry", columnList = "expiry_date")
    }
)
public class StockTakeItemBatch extends BaseEntity {

    @ManyToOne(optional = false)
    @JoinColumn(name = "stock_take_item_id", nullable = false)
    @JsonIgnore
    private StockTakeItem item;

    @jakarta.persistence.Column(name = "batch_number", nullable = false, length = 100)
    private String batchNumber;

    @jakarta.persistence.Column(name = "expiry_date")
    private LocalDate expiryDate;

    @jakarta.persistence.Column(nullable = false)
    private Integer quantity;

    public StockTakeItem getItem() { return item; }
    public void setItem(StockTakeItem item) { this.item = item; }

    public String getBatchNumber() { return batchNumber; }
    public void setBatchNumber(String batchNumber) { this.batchNumber = batchNumber; }

    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
}
