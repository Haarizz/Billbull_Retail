package com.billbull.backend.pos.session;

/**
 * Session Roaming Phase 6 — classification of what {@link PosSessionDiscoveryService} found when
 * looking for a terminal session and an owner session independently. Purely descriptive: nothing
 * in this enum implies what (if anything) a caller should do about it.
 */
public enum PosSessionDiscoveryStatus {

    /** No OPEN session on this terminal, and no OPEN session owned by this user. */
    NO_SESSION,

    /** An OPEN session exists on this terminal, but it is not owned by this user (or ownership is unset). */
    TERMINAL_SESSION,

    /** No OPEN session on this terminal, but the user owns an OPEN session elsewhere. */
    OWNER_SESSION,

    /** The OPEN session on this terminal is the same session the user owns. */
    SAME_SESSION,

    /**
     * The user owns an OPEN session at another terminal, and this terminal separately has its own
     * OPEN session owned by someone else (or unowned) — two distinct sessions in play.
     */
    CONFLICT,

    /** The user owns more than one OPEN session; resolution refused to guess which one applies. */
    MULTIPLE_OWNER_SESSIONS
}
