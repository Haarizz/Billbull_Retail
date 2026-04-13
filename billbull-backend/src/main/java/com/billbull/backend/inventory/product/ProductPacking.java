package com.billbull.backend.inventory.product;

import java.math.BigDecimal;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.units.Unit;

import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "product_packings")
public class ProductPacking extends BaseEntity {

    @ManyToOne(optional = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Product product;

    private String level; // L1, L2 etc

    @ManyToOne(optional = false)
    @JoinColumn(name = "unit_id", nullable = false)
    private Unit unit;


    private BigDecimal conversion;
    private BigDecimal baseQty;
    private boolean isSale;
    private boolean isPurchase;
    private boolean isLPO;
    private BigDecimal cost;
    private BigDecimal price;

    public Product getProduct() { return product; }
    public void setProduct(Product product) { this.product = product; }
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    public Unit getUnit() { return unit; }
    public void setUnit(Unit unit) { this.unit = unit; }
    public BigDecimal getConversion() { return conversion; }
    public void setConversion(BigDecimal conversion) { this.conversion = conversion; }
    public BigDecimal getBaseQty() { return baseQty; }
    public void setBaseQty(BigDecimal baseQty) { this.baseQty = baseQty; }
    public boolean isSale() { return isSale; }
    public void setSale(boolean sale) { isSale = sale; }
    public boolean isPurchase() { return isPurchase; }
    public void setPurchase(boolean purchase) { isPurchase = purchase; }
    public boolean isLPO() { return isLPO; }
    public void setLPO(boolean LPO) { isLPO = LPO; }
    public BigDecimal getCost() { return cost; }
    public void setCost(BigDecimal cost) { this.cost = cost; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
}