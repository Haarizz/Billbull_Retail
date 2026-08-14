package com.billbull.backend.sales.returns;

/**
 * Which surface the return was raised from (§6). Both entry points run the same
 * business logic through {@link SalesReturnService}; this records provenance for audit
 * and reporting, and lets the service require POS context only where it genuinely applies.
 */
public enum SalesReturnEntryPoint {

    /** Raised from POS → Actions → Return, inside a live session on a terminal. */
    POS,

    /** Raised from Customer &amp; Sales → Sales Return, back-office context. */
    SALES_RETURN
}
