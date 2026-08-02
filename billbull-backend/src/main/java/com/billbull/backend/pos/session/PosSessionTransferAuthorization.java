package com.billbull.backend.pos.session;

/**
 * Session Roaming Phase 9 — outcome of {@link PosSessionTransferPolicy#evaluate}. Deliberately not
 * a boolean: {@code SUPERVISOR_REQUIRED} is a distinct state from both an outright {@code DENIED}
 * and an unconditional {@code ALLOWED}, and collapsing it into a flag loses that distinction at
 * every call site.
 */
public enum PosSessionTransferAuthorization {
    ALLOWED,
    SUPERVISOR_REQUIRED,
    DENIED
}
