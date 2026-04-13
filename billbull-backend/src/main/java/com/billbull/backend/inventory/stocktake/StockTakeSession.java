package com.billbull.backend.inventory.stocktake;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(name = "stock_take_sessions")
public class StockTakeSession extends BaseEntity {

    private static final DateTimeFormatter ISO_OFFSET_DATE_TIME = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

    private String sessionId; // STK-XXXXX
    private Long warehouseId;
    private String warehouseName;

    @Enumerated(EnumType.STRING)
    private StockTakeType type; // OPENING, REGULAR

    private String countType; // Full, Partial, etc.
    private Long categoryId;  // department filter for Selected Categories count type
    private Long brandId;     // brand filter for Selected Brands count type
    
    @Enumerated(EnumType.STRING)
    private StockTakeStatus status; // IN_PROGRESS, PENDING_APPROVAL, COMPLETED

    private String notes;
    private String createdBy;
    private String reconciledBy;
    private java.time.LocalDateTime reconciledAt;

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true, fetch = jakarta.persistence.FetchType.EAGER)
    private List<StockTakeItem> items = new ArrayList<>();

    // Enum definitions
    public enum StockTakeType {
        OPENING_INVENTORY, INVENTORY_COUNTING
    }

    public enum StockTakeStatus {
        IN_PROGRESS, PENDING_APPROVAL, COMPLETED
    }

    // Getters and Setters
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public Long getWarehouseId() { return warehouseId; }
    public void setWarehouseId(Long warehouseId) { this.warehouseId = warehouseId; }

    public String getWarehouseName() { return warehouseName; }
    public void setWarehouseName(String warehouseName) { this.warehouseName = warehouseName; }

    public StockTakeType getType() { return type; }
    public void setType(StockTakeType type) { this.type = type; }

    public String getCountType() { return countType; }
    public void setCountType(String countType) { this.countType = countType; }

    public Long getCategoryId() { return categoryId; }
    public void setCategoryId(Long categoryId) { this.categoryId = categoryId; }

    public Long getBrandId() { return brandId; }
    public void setBrandId(Long brandId) { this.brandId = brandId; }

    public StockTakeStatus getStatus() { return status; }
    public void setStatus(StockTakeStatus status) { this.status = status; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getReconciledBy() { return reconciledBy; }
    public void setReconciledBy(String reconciledBy) { this.reconciledBy = reconciledBy; }

    public java.time.LocalDateTime getReconciledAt() { return reconciledAt; }
    public void setReconciledAt(java.time.LocalDateTime reconciledAt) { this.reconciledAt = reconciledAt; }

    public List<StockTakeItem> getItems() { return items; }
    public void setItems(List<StockTakeItem> items) { this.items = items; }

    @JsonProperty("createdAtIso")
    public String getCreatedAtIso() {
        return toOffsetDateTimeString(getCreatedAt());
    }

    @JsonProperty("reconciledAtIso")
    public String getReconciledAtIso() {
        return toOffsetDateTimeString(reconciledAt);
    }

    private String toOffsetDateTimeString(LocalDateTime value) {
        if (value == null) return null;
        return value.atZone(ZoneId.systemDefault()).format(ISO_OFFSET_DATE_TIME);
    }
}
