package com.billbull.backend.inventory.stocktake;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

@Entity
@Table(name = "stock_take_items")
public class StockTakeItem extends BaseEntity {

    @ManyToOne
    @JoinColumn(name = "session_id")
    @JsonIgnore
    private StockTakeSession session;

    private Long productId;
    private String productName;
    private String sku;
    private String barcode;
    private String brand;
    private String category;
    private String image;
    private BigDecimal price;
    private String description;

    private Integer systemQty;
    private Integer countedQty;
    private Integer variance;
    private BigDecimal varianceValue;

    // Bin assignment (Option B: bin-aware stock taking)
    private Long binId;
    private String binCode;
    private Long zoneId;
    private Long locatorId;

    @Enumerated(EnumType.STRING)
    private ItemStatus status; // PENDING, MATCHED, VARIANCE

    private boolean batchEnabled;
    private boolean expiryEnabled;

    // ARCHFIX §1.6/§1.9: LAZY (was EAGER) + @BatchSize. The per-unit model means a counted lot is
    // N rows here, so an EAGER session.items × item.batches chain could hydrate tens of thousands of
    // rows at once. Read paths that serialize the session init batches in-session (note getLotGroups()
    // below is @Transient and serialized — it iterates batches, so batches MUST be initialised first).
    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @org.hibernate.annotations.BatchSize(size = 100)
    private List<StockTakeItemBatch> batches = new ArrayList<>();

    public enum ItemStatus {
        PENDING, MATCHED, VARIANCE
    }

    // Getters and Setters
    public StockTakeSession getSession() { return session; }
    public void setSession(StockTakeSession session) { this.session = session; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getBarcode() { return barcode; }
    public void setBarcode(String barcode) { this.barcode = barcode; }

    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getImage() { return image; }
    public void setImage(String image) { this.image = image; }

    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Integer getSystemQty() { return systemQty; }
    public void setSystemQty(Integer systemQty) { this.systemQty = systemQty; }

    public Integer getCountedQty() { return countedQty; }
    public void setCountedQty(Integer countedQty) { this.countedQty = countedQty; }

    public Integer getVariance() { return variance; }
    public void setVariance(Integer variance) { this.variance = variance; }

    public BigDecimal getVarianceValue() { return varianceValue; }
    public void setVarianceValue(BigDecimal varianceValue) { this.varianceValue = varianceValue; }

    public ItemStatus getStatus() { return status; }
    public void setStatus(ItemStatus status) { this.status = status; }

    public Long getBinId() { return binId; }
    public void setBinId(Long binId) { this.binId = binId; }

    public String getBinCode() { return binCode; }
    public void setBinCode(String binCode) { this.binCode = binCode; }

    public Long getZoneId() { return zoneId; }
    public void setZoneId(Long zoneId) { this.zoneId = zoneId; }

    public Long getLocatorId() { return locatorId; }
    public void setLocatorId(Long locatorId) { this.locatorId = locatorId; }

    public boolean isBatchEnabled() { return batchEnabled; }
    public void setBatchEnabled(boolean batchEnabled) { this.batchEnabled = batchEnabled; }

    public boolean isExpiryEnabled() { return expiryEnabled; }
    public void setExpiryEnabled(boolean expiryEnabled) { this.expiryEnabled = expiryEnabled; }

    public List<StockTakeItemBatch> getBatches() { return batches; }
    public void setBatches(List<StockTakeItemBatch> batches) { this.batches = batches; }

    /** Lot-grouped projection of {@link #batches} for the BatchEditor UI. Computed on
     *  read; not persisted. Each lot collapses its N per-unit rows into a single entry. */
    @Transient
    public List<StockTakeLotGroup> getLotGroups() {
        return StockTakeLotGroup.from(batches);
    }
}
