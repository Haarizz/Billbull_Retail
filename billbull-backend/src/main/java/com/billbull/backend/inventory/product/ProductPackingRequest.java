package com.billbull.backend.inventory.product;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

// The flags travel as isSale / isPurchase / isLPO, the names the product form sends and reads.
// Without the annotations Jackson names them sale / purchase / lpo (from setSale and isSale()), so
// the form's ticks were dropped on save and every non-base packing was stored as not for sale.
// The old names are still accepted.
public class ProductPackingRequest {
    private Long id;
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
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    public Long getUnit() { return unit; }
    public void setUnit(Long unit) { this.unit = unit; }
    public BigDecimal getConversion() { return conversion; }
    public void setConversion(BigDecimal conversion) { this.conversion = conversion; }
    public BigDecimal getBaseQty() { return baseQty; }
    public void setBaseQty(BigDecimal baseQty) { this.baseQty = baseQty; }
    @JsonProperty("isSale")
    public boolean isSale() { return isSale; }
    @JsonProperty("isSale") @JsonAlias("sale")
    public void setSale(boolean sale) { isSale = sale; }
    @JsonProperty("isPurchase")
    public boolean isPurchase() { return isPurchase; }
    @JsonProperty("isPurchase") @JsonAlias("purchase")
    public void setPurchase(boolean purchase) { isPurchase = purchase; }
    @JsonProperty("isLPO")
    public boolean isLPO() { return isLPO; }
    @JsonProperty("isLPO") @JsonAlias({"lpo", "LPO"})
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
