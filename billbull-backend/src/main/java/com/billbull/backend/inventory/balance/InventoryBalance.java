package com.billbull.backend.inventory.balance;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Pre-aggregated on-hand inventory per (product, warehouse) (PDF §19 / F-19).
 *
 * Updated atomically by InventoryBalanceService whenever a StockMovement is saved.
 * Reports read from this table for performance instead of scanning stock_movements.
 * A nightly reconciliation verifies against SUM(stock_movements.quantity).
 */
@Entity
@Table(
    name = "inventory_balances",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_inv_bal_product_warehouse",
            columnNames = {"product_id", "warehouse_id"})
    },
    indexes = {
        @Index(name = "idx_inv_bal_product",   columnList = "product_id"),
        @Index(name = "idx_inv_bal_warehouse",  columnList = "warehouse_id"),
        @Index(name = "idx_inv_bal_updated_at", columnList = "updated_at")
    }
)
public class InventoryBalance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "warehouse_id", nullable = false)
    private Long warehouseId;

    @Column(name = "product_code", length = 50)
    private String productCode;

    @Column(name = "product_name", length = 255)
    private String productName;

    @Column(name = "warehouse_name", length = 100)
    private String warehouseName;

    /** Sum of all stock_movements.quantity for this (product, warehouse). */
    @Column(name = "on_hand_qty", nullable = false)
    private Integer onHandQty = 0;

    /** Weighted-average cost per unit (AED). */
    @Column(name = "avg_cost", precision = 15, scale = 4)
    private BigDecimal avgCost = BigDecimal.ZERO;

    /** on_hand_qty × avg_cost — total inventory value at WAC. */
    @Column(name = "total_value", precision = 18, scale = 2)
    private BigDecimal totalValue = BigDecimal.ZERO;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public InventoryBalance() {}

    public Long getId() { return id; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public Long getWarehouseId() { return warehouseId; }
    public void setWarehouseId(Long warehouseId) { this.warehouseId = warehouseId; }

    public String getProductCode() { return productCode; }
    public void setProductCode(String productCode) { this.productCode = productCode; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getWarehouseName() { return warehouseName; }
    public void setWarehouseName(String warehouseName) { this.warehouseName = warehouseName; }

    public Integer getOnHandQty() { return onHandQty; }
    public void setOnHandQty(Integer onHandQty) { this.onHandQty = onHandQty; }

    public BigDecimal getAvgCost() { return avgCost; }
    public void setAvgCost(BigDecimal avgCost) { this.avgCost = avgCost; }

    public BigDecimal getTotalValue() { return totalValue; }
    public void setTotalValue(BigDecimal totalValue) { this.totalValue = totalValue; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
