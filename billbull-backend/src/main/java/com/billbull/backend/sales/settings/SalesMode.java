package com.billbull.backend.sales.settings;

/**
 * Global sales execution mode.
 *
 * WORKFLOW_DRIVEN:
 *   Full pipeline — Invoice → Delivery Note (DRAFT) → Dispatch → Deliver.
 *   Stock is deducted and revenue is recognised only when the Delivery Note
 *   is manually marked DELIVERED.
 *
 * FAST_SALE (default):
 *   Instant pipeline — Invoice creation automatically creates, dispatches,
 *   and delivers the Delivery Note in one atomic step.
 *   Stock is deducted and revenue is recognised immediately on invoice save.
 *   Invoices cannot remain in DRAFT; they are force-promoted to POSTED.
 */
public enum SalesMode {
    WORKFLOW_DRIVEN,
    FAST_SALE
}
