package com.billbull.backend.inventory.warehouse;

public record LocatorRequest(
        String code,
        String name,
        String aisleNumber,
        String rackNumber,
        String status) {
}
