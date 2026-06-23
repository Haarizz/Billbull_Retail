package com.billbull.backend.sales.payment;

public enum PaymentStatus {
    PENDING,
    COMPLETED,
    PARTIAL,
    CANCELLED,
    /** Card terminal declined or network error — payment not collected. Invoice remains unpaid. */
    FAILED
}
