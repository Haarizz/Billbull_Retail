package com.billbull.backend.purchase.lpo;

import java.math.BigDecimal;
import java.time.LocalDate;

public class LpoListResponse {

    private Long dbId;

    // LPO number
    private String id;

    private String vendorName;
    private String vendorCode;

    // Source (MANUAL / DIRECT / etc.)
    private String createdFrom;

    private LocalDate date;

    private int itemCount;
    private BigDecimal totalValue;

    // Status as STRING for frontend safety
    private String status;
    private String approvalStatus;

    private String approvedBy;
    private LocalDate expectedDeliveryDate;

    // For future GRN progress
    private Integer receivedPercentage;

    private boolean stockPosted;
    private Long warehouseId;

    public Long getWarehouseId() {
        return warehouseId;
    }

    public void setWarehouseId(Long warehouseId) {
        this.warehouseId = warehouseId;
    }

    /* ================= CONSTRUCTOR USED BY SERVICE ================= */

    public LpoListResponse(
            String lpoNumber,
            String vendorName,
            String vendorCode,
            String source,
            LocalDate lpoDate,
            int itemCount,
            BigDecimal grandTotal,
            LpoStatus status,
            String approvedBy,
            LocalDate expectedDeliveryDate,
            int receivedPercentage,
            boolean stockPosted,
            String approvalStatus) {
        this.id = lpoNumber;
        this.vendorName = vendorName;
        this.vendorCode = vendorCode;
        this.createdFrom = source;
        this.date = lpoDate;
        this.itemCount = itemCount;
        this.totalValue = grandTotal;
        this.status = status != null ? status.name() : null;
        this.approvedBy = approvedBy;
        this.expectedDeliveryDate = expectedDeliveryDate;
        this.receivedPercentage = receivedPercentage;
        this.stockPosted = stockPosted;
        this.approvalStatus = approvalStatus;
    }

    /* ================= GETTERS / SETTERS ================= */

    public Long getDbId() {
        return dbId;
    }

    public void setDbId(Long dbId) {
        this.dbId = dbId;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getVendorName() {
        return vendorName;
    }

    public void setVendorName(String vendorName) {
        this.vendorName = vendorName;
    }

    public String getVendorCode() {
        return vendorCode;
    }

    public void setVendorCode(String vendorCode) {
        this.vendorCode = vendorCode;
    }

    public String getCreatedFrom() {
        return createdFrom;
    }

    public void setCreatedFrom(String createdFrom) {
        this.createdFrom = createdFrom;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public int getItemCount() {
        return itemCount;
    }

    public void setItemCount(int itemCount) {
        this.itemCount = itemCount;
    }

    public BigDecimal getTotalValue() {
        return totalValue;
    }

    public void setTotalValue(BigDecimal totalValue) {
        this.totalValue = totalValue;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getApprovalStatus() {
        return approvalStatus;
    }

    public void setApprovalStatus(String approvalStatus) {
        this.approvalStatus = approvalStatus;
    }

    public String getApprovedBy() {
        return approvedBy;
    }

    public void setApprovedBy(String approvedBy) {
        this.approvedBy = approvedBy;
    }

    public LocalDate getExpectedDeliveryDate() {
        return expectedDeliveryDate;
    }

    public void setExpectedDeliveryDate(LocalDate expectedDeliveryDate) {
        this.expectedDeliveryDate = expectedDeliveryDate;
    }

    public Integer getReceivedPercentage() {
        return receivedPercentage;
    }

    public void setReceivedPercentage(Integer receivedPercentage) {
        this.receivedPercentage = receivedPercentage;
    }

    public boolean isStockPosted() {
        return stockPosted;
    }

    public void setStockPosted(boolean stockPosted) {
        this.stockPosted = stockPosted;
    }
}
