package com.billbull.backend.inventory.product;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.units.Unit;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.Locator;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.Zone;
import com.billbull.backend.purchase.vendor.Vendor;
import jakarta.persistence.*;
import java.util.List;

@Entity
@Table(name = "product_inventory_policy")
public class ProductInventoryPolicy extends BaseEntity {

    @OneToOne(optional = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Product product;

    @ManyToOne
    private Unit defaultUnit;

    private Integer reorderLevel;

    @ManyToOne
    private Unit reorderUnit;

    private Integer reorderQty;
    private Integer safetyStock;
    private Integer minStock;
    private Integer maxStock;
    private boolean allowNegative;

    @ManyToOne
    private Vendor defaultVendor;

    private String procurementType;

    @ManyToOne
    private Warehouse warehouse;

    @ManyToOne
    private Zone zone;

    @ManyToOne
    private Locator locator;

    @ManyToOne
    private Bin bin;

    // Transient field to handle incoming JSON packings
    @Transient
    private List<ProductPackingRequest> packings;

    // Getters and Setters
    public List<ProductPackingRequest> getPackings() {
        return packings;
    }

    public void setPackings(List<ProductPackingRequest> packings) {
        this.packings = packings;
    }

    public Product getProduct() {
        return product;
    }

    public void setProduct(Product product) {
        this.product = product;
    }

    public Unit getDefaultUnit() {
        return defaultUnit;
    }

    public void setDefaultUnit(Unit defaultUnit) {
        this.defaultUnit = defaultUnit;
    }

    public Integer getReorderLevel() {
        return reorderLevel;
    }

    public void setReorderLevel(Integer reorderLevel) {
        this.reorderLevel = reorderLevel;
    }

    public Unit getReorderUnit() {
        return reorderUnit;
    }

    public void setReorderUnit(Unit reorderUnit) {
        this.reorderUnit = reorderUnit;
    }

    public Integer getReorderQty() {
        return reorderQty;
    }

    public void setReorderQty(Integer reorderQty) {
        this.reorderQty = reorderQty;
    }

    public Integer getSafetyStock() {
        return safetyStock;
    }

    public void setSafetyStock(Integer safetyStock) {
        this.safetyStock = safetyStock;
    }

    public Integer getMinStock() {
        return minStock;
    }

    public void setMinStock(Integer minStock) {
        this.minStock = minStock;
    }

    public Integer getMaxStock() {
        return maxStock;
    }

    public void setMaxStock(Integer maxStock) {
        this.maxStock = maxStock;
    }

    public boolean isAllowNegative() {
        return allowNegative;
    }

    public void setAllowNegative(boolean allowNegative) {
        this.allowNegative = allowNegative;
    }

    public Vendor getDefaultVendor() {
        return defaultVendor;
    }

    public void setDefaultVendor(Vendor defaultVendor) {
        this.defaultVendor = defaultVendor;
    }

    public String getProcurementType() {
        return procurementType;
    }

    public void setProcurementType(String procurementType) {
        this.procurementType = procurementType;
    }

    public Warehouse getWarehouse() {
        return warehouse;
    }

    public void setWarehouse(Warehouse warehouse) {
        this.warehouse = warehouse;
    }

    public Zone getZone() {
        return zone;
    }

    public void setZone(Zone zone) {
        this.zone = zone;
    }

    public Locator getLocator() {
        return locator;
    }

    public void setLocator(Locator locator) {
        this.locator = locator;
    }

    public Bin getBin() {
        return bin;
    }

    public void setBin(Bin bin) {
        this.bin = bin;
    }
}