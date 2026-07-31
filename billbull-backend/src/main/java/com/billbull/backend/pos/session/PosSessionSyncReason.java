package com.billbull.backend.pos.session;

/**
 * Indicates why a POS session is no longer valid for a specific terminal.
 * Designed for future extensibility in session synchronization.
 */
public enum PosSessionSyncReason {
    TRANSFERRED,
    CLOSED,
    INVALID,
    DAY_CLOSED,
    TERMINAL_CHANGED,
    UNKNOWN
}
