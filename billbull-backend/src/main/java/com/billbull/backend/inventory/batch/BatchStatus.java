package com.billbull.backend.inventory.batch;

public enum BatchStatus {
    AVAILABLE,
    RESERVED,
    CONSUMED,
    // Legacy value kept so existing rows can still be read after the lifecycle
    // vocabulary moves to CONSUMED.
    SOLD
}
