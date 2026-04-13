package com.billbull.backend.inventory.warehouse;

public record LocatorResponse(
        Long id,
        String code,
        String name,
        String aisleNumber,
        String rackNumber,
        String status,
        Long zoneId,
        String zoneName,
        Long warehouseId) {
}
