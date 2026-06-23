package com.billbull.backend.pos.audit;

public enum PosAuditAction {
    // Checkout
    CHECKOUT_COMPLETED,
    CHECKOUT_FAILED,

    // Cart / line items
    ITEM_VOIDED,

    // Session lifecycle
    SESSION_OPENED,
    SESSION_CLOSED,

    // Cash
    CASH_DROP_IN,
    CASH_DROP_OUT,

    // Held sales
    HELD_SALE_SAVED,
    HELD_SALE_RECALLED,
    HELD_SALE_DELETED,

    // Layaway
    LAYAWAY_CREATED,
    LAYAWAY_CANCELLED,
    LAYAWAY_CONVERTED,

    // Returns
    RETURN_INITIATED,
    RETURN_APPROVED,
    RETURN_CANCELLED,

    // Supervisor
    SUPERVISOR_OVERRIDE
}
