package com.billbull.backend.inventory.warehouse;

public record BinRequest(
        String code,
        String name,
        Integer capacity,
        String binType,
        String status) {
}
