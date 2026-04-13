package com.billbull.backend.inventory.product;

import java.math.BigDecimal;

public class ProductPackingRequest {
    private String level;
    private Long unit; // Unit ID
    private BigDecimal conversion;
    private BigDecimal baseQty;
    private boolean isSale;
    private boolean isPurchase;
    private boolean isLPO;
    private BigDecimal cost;
    private BigDecimal price;
    private String barcode;
    private String unitName; // Unit display name for UI

    // Getters Setters
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    public Long getUnit() { return unit; }
    public void setUnit(Long unit) { this.unit = unit; }
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
    public String getBarcode() { return barcode; }
    public void setBarcode(String barcode) { this.barcode = barcode; }
    public String getUnitName() { return unitName; }
    public void setUnitName(String unitName) { this.unitName = unitName; }
}
