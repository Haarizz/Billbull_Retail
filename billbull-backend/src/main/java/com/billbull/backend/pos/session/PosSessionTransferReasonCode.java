package com.billbull.backend.pos.session;

/**
 * Session Roaming Phase 9 — machine-readable reason attached to every
 * {@link PosSessionTransferDecision}, so the frontend can branch/localize without parsing
 * {@code message} text.
 *
 * <p>Only reasons backed by a rule that {@link PosSessionTransferPolicy} actually evaluates today
 * are listed. Rules named in the Phase 9 brief that have no queryable domain state yet
 * (session-level active cash drawer, unpaid transactions, pending settlements) are intentionally
 * NOT modeled here — inventing a reason code for a check that never fires would be misleading.
 * When one of those becomes queryable, add its reason code alongside the rule that uses it.
 */
public enum PosSessionTransferReasonCode {
    /** Destination is on the same branch as the session being transferred. */
    SAME_BRANCH_TRANSFER,
    /** Destination is on a different branch — gated by
     *  {@code PosSettings#getRequireSupervisorForCrossBranchTransfer()}. */
    CROSS_BRANCH_TRANSFER,
    /** Destination terminal already hosts an open session; transfer cannot proceed regardless
     *  of supervisor authorization. */
    DESTINATION_TERMINAL_OCCUPIED,
    /** Destination resolves to the terminal the session is already hosted on. */
    SAME_TERMINAL_NOT_APPLICABLE,
    /** Destination terminal id does not resolve to a known terminal. */
    DESTINATION_TERMINAL_NOT_FOUND
}
