package com.billbull.backend.inventory.warehouse;

public class WarehouseResolutionResult {
    private Long warehouseId;
    private String warehouseName;
    private String reason;

    public WarehouseResolutionResult(Long warehouseId, String warehouseName, String reason) {
        this.warehouseId = warehouseId;
        this.warehouseName = warehouseName;
        this.reason = reason;
    }

    public Long getWarehouseId() {
        return warehouseId;
    }

    public String getWarehouseName() {
        return warehouseName;
    }

    public String getReason() {
        return reason;
    }
}
