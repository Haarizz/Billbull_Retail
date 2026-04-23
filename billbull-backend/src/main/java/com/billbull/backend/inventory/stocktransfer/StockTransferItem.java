package com.billbull.backend.inventory.stocktransfer;

import com.billbull.backend.inventory.product.Product;
import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "stock_transfer_items")
public class StockTransferItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stock_transfer_id", nullable = false)
    private StockTransfer stockTransfer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    private String batchNumber;
    private Integer quantity;
    private Integer receivedQty;
    private String uom;

    @Column(precision = 15, scale = 4)
    private BigDecimal unitCostAtSend;

    @Column(precision = 15, scale = 2)
    private BigDecimal lineValue;

    @Column(precision = 15, scale = 2)
    private BigDecimal allocatedCharge = BigDecimal.ZERO;

    // Getters & Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public StockTransfer getStockTransfer() {
        return stockTransfer;
    }

    public void setStockTransfer(StockTransfer stockTransfer) {
        this.stockTransfer = stockTransfer;
    }

    public Product getProduct() {
        return product;
    }

    public void setProduct(Product product) {
        this.product = product;
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

    public Integer getReceivedQty() {
        return receivedQty;
    }

    public void setReceivedQty(Integer receivedQty) {
        this.receivedQty = receivedQty;
    }

    public String getUom() {
        return uom;
    }

    public void setUom(String uom) {
        this.uom = uom;
    }

    public BigDecimal getUnitCostAtSend() {
        return unitCostAtSend;
    }

    public void setUnitCostAtSend(BigDecimal unitCostAtSend) {
        this.unitCostAtSend = unitCostAtSend;
    }

    public BigDecimal getLineValue() {
        return lineValue;
    }

    public void setLineValue(BigDecimal lineValue) {
        this.lineValue = lineValue;
    }

    public BigDecimal getAllocatedCharge() {
        return allocatedCharge;
    }

    public void setAllocatedCharge(BigDecimal allocatedCharge) {
        this.allocatedCharge = allocatedCharge;
    }
}
