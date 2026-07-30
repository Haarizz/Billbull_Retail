package com.billbull.backend.pos.session;

import java.util.Optional;

/**
 * Session Roaming Phase 2 (backend plumbing only). Abstraction seam for how an active session is
 * looked up for a cashier at a branch. {@link #resolveByTerminal} is the ONLY strategy any
 * production code path uses today (see {@link PosSessionTerminalFirstResolutionStrategy}, which
 * simply wraps the same repository call {@code PosSessionService} already makes inline).
 *
 * <p>{@link #resolveByOwner} is a placeholder for the future user-first resolution ("find my
 * session regardless of which terminal I'm sitting at") introduced by a later roaming phase — it
 * intentionally throws until that phase implements it. No caller invokes it yet.
 */
public interface PosSessionResolutionStrategy {

    /** Terminal-first lookup: the active OPEN session currently bound to this branch+terminal, if any. */
    Optional<PosSession> resolveByTerminal(Long branchId, String terminalId);

    /** Reserved for a later phase's user-first lookup: the active OPEN session owned by this user,
     *  regardless of terminal. Not implemented in Phase 2 — no caller invokes this yet. */
    Optional<PosSession> resolveByOwner(Long ownerUserId);
}
