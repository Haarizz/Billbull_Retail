package com.billbull.backend.purchase.lpo;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class LpoDetailResponse {

    private Long id; // Numeric ID (used as dbId in frontend)
    private Long dbId; // For consistency with LpoListResponse
    private String lpoNumber;
    private LocalDate lpoDate;

    private String vendorName;
    private String vendorCode;

    private String status; // string for API
    private String warehouseName; // derived from entity
    private Long warehouseId;
    private Long zoneId;
    private Long locatorId;
    private Long binId;

    private BigDecimal subtotal;
    private BigDecimal tax;
    private BigDecimal discount;
    private BigDecimal grandTotal;
    private LocalDate expectedDeliveryDate;
    private String purchaseType;
    private String buyerAssigned;
    private String referenceDocument;
    private String createdFrom;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private Integer receivedPercentage;
    private String approvalStatus;
    private String approvedBy;
    private java.time.LocalDateTime approvedAt;
    private List<com.billbull.backend.purchase.lpo.workflow.ApprovalHistoryResponse> approvalHistory;

    private List<LpoItemResponse> items;

    public Integer getReceivedPercentage() {
        return receivedPercentage;
    }

    public void setReceivedPercentage(Integer receivedPercentage) {
        this.receivedPercentage = receivedPercentage;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getLpoNumber() {
        return lpoNumber;
    }

    public void setLpoNumber(String lpoNumber) {
        this.lpoNumber = lpoNumber;
    }

    public LocalDate getLpoDate() {
        return lpoDate;
    }

    public void setLpoDate(LocalDate lpoDate) {
        this.lpoDate = lpoDate;
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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getWarehouseName() {
        return warehouseName;
    }

    public void setWarehouseName(String warehouseName) {
        this.warehouseName = warehouseName;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }

    public void setSubtotal(BigDecimal subtotal) {
        this.subtotal = subtotal;
    }

    public BigDecimal getTax() {
        return tax;
    }

    public void setTax(BigDecimal tax) {
        this.tax = tax;
    }

    public BigDecimal getDiscount() {
        return discount;
    }

    public void setDiscount(BigDecimal discount) {
        this.discount = discount;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(BigDecimal grandTotal) {
        this.grandTotal = grandTotal;
    }

    public Long getDbId() {
        return dbId;
    }

    public void setDbId(Long dbId) {
        this.dbId = dbId;
    }

    public List<LpoItemResponse> getItems() {
        return items;
    }

    public void setItems(List<LpoItemResponse> items) {
        this.items = items;
    }

    public Long getWarehouseId() {
        return warehouseId;
    }

    public void setWarehouseId(Long warehouseId) {
        this.warehouseId = warehouseId;
    }

    public Long getZoneId() {
        return zoneId;
    }

    public void setZoneId(Long zoneId) {
        this.zoneId = zoneId;
    }

    public Long getLocatorId() {
        return locatorId;
    }

    public void setLocatorId(Long locatorId) {
        this.locatorId = locatorId;
    }

    public Long getBinId() {
        return binId;
    }

    public void setBinId(Long binId) {
        this.binId = binId;
    }

    public LocalDate getExpectedDeliveryDate() {
        return expectedDeliveryDate;
    }

    public void setExpectedDeliveryDate(LocalDate expectedDeliveryDate) {
        this.expectedDeliveryDate = expectedDeliveryDate;
    }

    public String getPurchaseType() {
        return purchaseType;
    }

    public void setPurchaseType(String purchaseType) {
        this.purchaseType = purchaseType;
    }

    public String getBuyerAssigned() {
        return buyerAssigned;
    }

    public void setBuyerAssigned(String buyerAssigned) {
        this.buyerAssigned = buyerAssigned;
    }

    public String getReferenceDocument() {
        return referenceDocument;
    }

    public void setReferenceDocument(String referenceDocument) {
        this.referenceDocument = referenceDocument;
    }

    public String getCreatedFrom() {
        return createdFrom;
    }

    public void setCreatedFrom(String createdFrom) {
        this.createdFrom = createdFrom;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public String getBranchName() {
        return branchName;
    }

    public void setBranchName(String branchName) {
        this.branchName = branchName;
    }

    public String getBranchCode() {
        return branchCode;
    }

    public void setBranchCode(String branchCode) {
        this.branchCode = branchCode;
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

    public java.time.LocalDateTime getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(java.time.LocalDateTime approvedAt) {
        this.approvedAt = approvedAt;
    }

    public List<com.billbull.backend.purchase.lpo.workflow.ApprovalHistoryResponse> getApprovalHistory() {
        return approvalHistory;
    }

    public void setApprovalHistory(
            List<com.billbull.backend.purchase.lpo.workflow.ApprovalHistoryResponse> approvalHistory) {
        this.approvalHistory = approvalHistory;
    }
}
