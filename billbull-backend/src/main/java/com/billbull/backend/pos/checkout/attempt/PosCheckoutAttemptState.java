package com.billbull.backend.pos.checkout.attempt;

/**
 * Lifecycle of a checkout attempt (Phase 0 / M2, amended by M2.2.3). See {@link PosCheckoutAttemptService}.
 *
 * <pre>
 *            claim                        last step + complete
 *   (none) ───────▶ ACTIVE ─────────────────────────────────────▶ COMPLETED
 *     │              │  │ failure, no invoice left         ▲
 *     │              │  └──────────────▶ FAILED ──┐        │ recovery: every step's evidence present
 *     │              │                     ▲      │ reclaim (same key, same hash, fence + 1)
 *     │              ├─ lease expired, ────┘      ▼
 *     │              │  nothing survives        ACTIVE
 *     │              └──── partial evidence ──▶ STALLED ──▶ RELEASED (admin, with reason, fence + 1)
 *     │                                            │            └─ reclaim, like FAILED
 *     │                                            └──▶ ACTIVE (the original owner's next fenced step re-adopts it)
 *     │
 *     │ explicit abandonment of a key that was never claimed: a tombstone row
 *     ▼
 *   ABANDONED ◀── explicit abandonment of FAILED / RELEASED with no surviving invoice (fence + 1)
 *   terminal: the key is reserved for good; every later checkout under it is refused before any write
 * </pre>
 */
public enum PosCheckoutAttemptState {
    /** A worker owns the attempt. Blocks session close, begin-closure and suspend. */
    ACTIVE,
    /** Every step's evidence is recorded. Same key + same hash replays the invoice. */
    COMPLETED,
    /** The checkout failed, or its lease expired, and no invoice under this key survived. Reclaimable. */
    FAILED,
    /**
     * Explicitly and confirmedly abandoned (M2.2.3, {@code POST /api/pos/checkout/attempts/abandon}).
     * Terminal: never reclaimed or recovered, and it reserves its checkout key permanently, so a
     * request under the key that arrives later (a delayed retry, a duplicate from another tab) is
     * refused before any business write. Recovery never produces this state.
     */
    ABANDONED,
    /** The lease expired, or the checkout failed, after some writes were committed. Blocks the
     *  session's close/suspend until the owner re-adopts it or an administrator releases it. */
    STALLED,
    /** An administrator released a STALLED attempt (or an expired ACTIVE one) with a reason. The
     *  fence was bumped, so the previous owner cannot write again. */
    RELEASED;

    /** States that hold a session open: close, begin-closure and suspend are refused. */
    public boolean blocksSession() {
        return this == ACTIVE || this == STALLED;
    }

    /** States a new claim under the same key and hash may take over. ABANDONED is not one. */
    public boolean reclaimable() {
        return this == FAILED || this == RELEASED;
    }

    /** States an explicit abandonment may turn into ABANDONED, once no invoice survives under the key. */
    public boolean abandonable() {
        return this == FAILED || this == RELEASED;
    }
}
