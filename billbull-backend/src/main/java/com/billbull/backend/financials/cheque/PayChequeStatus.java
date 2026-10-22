package com.billbull.backend.financials.cheque;

/**
 * Lifecycle of an outgoing cheque: DRAFT → APPROVED → PRINTED → ISSUED → PAID → RECONCILED.
 * CANCELLED is reachable from every state before PAID and releases the cheque's allocations.
 */
public enum PayChequeStatus {
    DRAFT,
    APPROVED,
    PRINTED,
    ISSUED,
    PAID,
    RECONCILED,
    CANCELLED
}
