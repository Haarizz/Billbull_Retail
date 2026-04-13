package com.billbull.backend.inventory.warehouse;

public record BinResponse(
        Long id,
        String code,
        String name,
        Integer capacity,
        String binType,
        String status,
        Long locatorId,
        String locatorName,
        Long zoneId,
        Long warehouseId) {
}
