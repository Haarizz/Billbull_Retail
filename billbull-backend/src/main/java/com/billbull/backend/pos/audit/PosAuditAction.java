package com.billbull.backend.pos.audit;

public enum PosAuditAction {
    // Checkout
    CHECKOUT_COMPLETED,
    CHECKOUT_FAILED,

    // Cart / line items
    ITEM_VOIDED,

    // Session lifecycle
    SESSION_OPENED,
    /** An operator explicitly started the session's closure workflow ("Close Session").
     *  The session stays OPEN; normal selling is locked until it is closed or a
     *  supervisor cancels the closure. Distinct from SESSION_CLOSED, which is the
     *  final act. */
    SESSION_CLOSURE_STARTED,
    /** A supervisor aborted a started closure workflow, returning the session to normal
     *  operation. Never available to the cashier who started it. */
    SESSION_CLOSURE_CANCELLED,
    SESSION_CLOSED,

    // Cash
    CASH_DROP_IN,
    CASH_DROP_OUT,
    CASH_MOVEMENT_EDITED,
    CASH_MOVEMENT_VOIDED,

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
    SUPERVISOR_OVERRIDE,
    DELIVERY_SETTLEMENT_AUTHORIZED,

    /** One pending checkout released by a supervisor after the Business Day closed.
     *  This authorizes a single sale; it never reopens or extends the Business Day. */
    BUSINESS_DAY_CLOSED_CHECKOUT_AUTHORIZED,

    // Receipt
    RECEIPT_REPRINTED,

    // Terminal Auto-Archive lifecycle
    TERMINAL_STALE,
    TERMINAL_STALE_WARNING_SENT,
    TERMINAL_RECOVERED_FROM_STALE,
    TERMINAL_AUTO_ARCHIVED,
    TERMINAL_MANUAL_ARCHIVED,
    TERMINAL_RESTORED,
    TERMINAL_KEPT_ACTIVE,
    TERMINAL_EXEMPT_CHANGED,

    // ── Cash variance and its accounting ─────────────────────────────────────────────
    // A discrepancy is an exception about money, so each step of its life is its own event
    // rather than a sentence inside a close log: detected, authorized (or not), and posted.
    /** A drawer closed with a real discrepancy, within threshold or not. */
    VARIANCE_DETECTED,
    /** The discrepancy exceeded the branch threshold and a close was refused without a grant. */
    VARIANCE_APPROVAL_REQUIRED,
    /** A supervisor authorized this exact expected/counted pair. */
    VARIANCE_APPROVED,
    /** A shortage was recognised in the ledger. */
    CASH_SHORT_POSTED,
    /** An overage was recognised in the ledger. */
    CASH_OVER_POSTED,
    /** The session-close journal did not post. The close stands; the accounting does not. */
    GL_POSTING_FAILED,
    TERMINAL_DECOMMISSIONED
}
