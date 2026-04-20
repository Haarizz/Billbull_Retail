package com.billbull.backend.purchase.lpo;

import java.time.LocalDate;
import java.util.List;

public class LpoRequest {

    private String vendorName;
    private String vendorCode;

    private LpoSource source;
    private PurchaseType purchaseType;

    private LocalDate expectedDeliveryDate;
    private Long warehouseId;
    private Long zoneId;
    private Long locatorId;
    private Long binId;
    private Long branchId;
    private String branchName;
    private String branchCode;

    private String buyerAssigned;
    private String referenceDocument;

    private List<LpoItemRequest> items;

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

    public LpoSource getSource() {
        return source;
    }

    public void setSource(LpoSource source) {
        this.source = source;
    }

    public PurchaseType getPurchaseType() {
        return purchaseType;
    }

    public void setPurchaseType(PurchaseType purchaseType) {
        this.purchaseType = purchaseType;
    }

    public LocalDate getExpectedDeliveryDate() {
        return expectedDeliveryDate;
    }

    public void setExpectedDeliveryDate(LocalDate expectedDeliveryDate) {
        this.expectedDeliveryDate = expectedDeliveryDate;
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

    public List<LpoItemRequest> getItems() {
        return items;
    }

    public void setItems(List<LpoItemRequest> items) {
        this.items = items;
    }
}
