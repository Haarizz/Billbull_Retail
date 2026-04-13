package com.billbull.backend.inventory.warehouse;

public record ZoneResponse(
        Long id,
        String code,
        String name,
        String description,
        String zoneType,
        String status,
        Long warehouseId,
        String warehouseName) {
}
