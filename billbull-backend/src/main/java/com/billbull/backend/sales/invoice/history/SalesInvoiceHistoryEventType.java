package com.billbull.backend.sales.invoice.history;

/**
 * Event types for the per-invoice activity trail.
 *
 * Persisted as VARCHAR (@Enumerated(EnumType.STRING)) — deliberately NOT a DB enum
 * or CHECK constraint. Existing tenant DBs run with ddl-auto=update, which will not
 * widen a CHECK constraint, so a new constant here would break their upgrade.
 */
public enum SalesInvoiceHistoryEventType {
    CREATED,
    UPDATED,
    STATUS_CHANGED,
    CONFIRMED,
    CANCELLED,
    PAYMENT_RECEIVED,
    PRINTED,
    LINKED_DOCUMENT
}
