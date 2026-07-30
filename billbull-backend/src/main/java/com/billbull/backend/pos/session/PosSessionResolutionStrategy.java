package com.billbull.backend.pos.session;

import java.util.Optional;

/**
 * Session Roaming Phase 2 (backend plumbing) / Phase 5 (user-first discovery). Abstraction seam
 * for how an active session is looked up for a cashier at a branch. {@link #resolveByTerminal} is
 * the ONLY strategy any production code path uses today (see
 * {@link PosSessionTerminalFirstResolutionStrategy}, which simply wraps the same repository call
 * {@code PosSessionService} already makes inline).
 *
 * <p>{@link #resolveByOwner} and {@link #resolveSession} implement Phase 5's user-first discovery
 * capability. They exist so a later phase can compose terminal-first and user-first lookups, but
 * neither is invoked by {@code PosSessionService} or any other production flow yet — this phase
 * only makes the capability available, it does not change existing Open Session behaviour.
 */
public interface PosSessionResolutionStrategy {

    /** Terminal-first lookup: the active OPEN session currently bound to this branch+terminal, if any. */
    Optional<PosSession> resolveByTerminal(Long branchId, String terminalId);

    /**
     * User-first lookup: the active OPEN session owned by this user, regardless of terminal.
     *
     * <p>If more than one OPEN session is owned by the same user (should not normally happen —
     * see {@code PosSessionTerminalFirstResolutionStrategy} for how this is guarded), the
     * ambiguity is not silently resolved: the implementation logs a warning and returns empty
     * rather than guessing which session the caller meant.
     */
    Optional<PosSession> resolveByOwner(Long ownerUserId);

    /**
     * Composite resolution: try {@link #resolveByTerminal} first; only if no OPEN session exists
     * on this branch+terminal does it fall back to {@link #resolveByOwner} (scoped to the same
     * branch — see {@code PosSessionTerminalFirstResolutionStrategy} for the branch-scoping
     * rationale). Returns empty if neither lookup finds a session.
     *
     * <p>This method only discovers a session — it never moves, hosts, or transfers ownership of
     * one. Not invoked by any production flow in Phase 5; reserved for an explicitly controlled
     * code path in a later phase.
     */
    Optional<PosSession> resolveSession(Long branchId, String terminalId, Long ownerUserId);
}
