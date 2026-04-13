package com.billbull.backend.inventory.warehouse;

public record ZoneRequest(
        String code,
        String name,
        String description,
        String zoneType,
        String status) {
}
