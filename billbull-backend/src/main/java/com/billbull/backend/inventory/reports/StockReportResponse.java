package com.billbull.backend.inventory.reports;

import java.math.BigDecimal;

public class StockReportResponse {

    private Long productId;
    private String sku;
    private String item;
    private String category;
    private String department;
    private String brand;
    private String warehouse;
    
    private BigDecimal onHand = BigDecimal.ZERO;
    private String uom;
    private BigDecimal unitCost = BigDecimal.ZERO;
    private BigDecimal value = BigDecimal.ZERO;
    
    // Low Stock Extra
    private BigDecimal minStock = BigDecimal.ZERO;
    private BigDecimal suggestedPoQty = BigDecimal.ZERO;
    private String defaultVendor;
    
    // Out of Stock Extra
    private String lastSold;
    private String lastReceived;
    
    // Valuation Extra
    private BigDecimal retailPrice = BigDecimal.ZERO;
    private BigDecimal retailValue = BigDecimal.ZERO;
    private BigDecimal potentialMargin = BigDecimal.ZERO;

    // Cost-method fields (populated by /stock-valuation only)
    private String costMethod;
    private BigDecimal fifoUnitCost;
    private BigDecimal lifoUnitCost;

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getItem() { return item; }
    public void setItem(String item) { this.item = item; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }

    public String getWarehouse() { return warehouse; }
    public void setWarehouse(String warehouse) { this.warehouse = warehouse; }

    public BigDecimal getOnHand() { return onHand; }
    public void setOnHand(BigDecimal onHand) { this.onHand = onHand; }

    public String getUom() { return uom; }
    public void setUom(String uom) { this.uom = uom; }

    public BigDecimal getUnitCost() { return unitCost; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }

    public BigDecimal getValue() { return value; }
    public void setValue(BigDecimal value) { this.value = value; }

    public BigDecimal getMinStock() { return minStock; }
    public void setMinStock(BigDecimal minStock) { this.minStock = minStock; }

    public BigDecimal getSuggestedPoQty() { return suggestedPoQty; }
    public void setSuggestedPoQty(BigDecimal suggestedPoQty) { this.suggestedPoQty = suggestedPoQty; }

    public String getDefaultVendor() { return defaultVendor; }
    public void setDefaultVendor(String defaultVendor) { this.defaultVendor = defaultVendor; }

    public String getLastSold() { return lastSold; }
    public void setLastSold(String lastSold) { this.lastSold = lastSold; }

    public String getLastReceived() { return lastReceived; }
    public void setLastReceived(String lastReceived) { this.lastReceived = lastReceived; }

    public BigDecimal getRetailPrice() { return retailPrice; }
    public void setRetailPrice(BigDecimal retailPrice) { this.retailPrice = retailPrice; }

    public BigDecimal getRetailValue() { return retailValue; }
    public void setRetailValue(BigDecimal retailValue) { this.retailValue = retailValue; }

    public BigDecimal getPotentialMargin() { return potentialMargin; }
    public void setPotentialMargin(BigDecimal potentialMargin) { this.potentialMargin = potentialMargin; }

    public String getCostMethod() { return costMethod; }
    public void setCostMethod(String costMethod) { this.costMethod = costMethod; }

    public BigDecimal getFifoUnitCost() { return fifoUnitCost; }
    public void setFifoUnitCost(BigDecimal fifoUnitCost) { this.fifoUnitCost = fifoUnitCost; }

    public BigDecimal getLifoUnitCost() { return lifoUnitCost; }
    public void setLifoUnitCost(BigDecimal lifoUnitCost) { this.lifoUnitCost = lifoUnitCost; }
}
