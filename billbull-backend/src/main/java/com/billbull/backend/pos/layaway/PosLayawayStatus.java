package com.billbull.backend.pos.layaway;

/**
 * Lifecycle of a POS layaway (reserved sale).
 *
 * ACTIVE / PARTIALLY_PAID / READY_TO_CONVERT are derived from the deposit vs total
 * at save time; CONVERTED and CANCELLED are set explicitly when the layaway becomes
 * a real POS sale or is cancelled; EXPIRED is computed on read when an open layaway
 * is past its due date.
 */
public enum PosLayawayStatus {
    ACTIVE,
    PARTIALLY_PAID,
    READY_TO_CONVERT,
    CONVERTED,
    CANCELLED,
    EXPIRED
}
