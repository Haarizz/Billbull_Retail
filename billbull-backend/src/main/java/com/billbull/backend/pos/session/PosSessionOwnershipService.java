package com.billbull.backend.pos.session;

import com.billbull.backend.common.ownership.OwnershipContextHolder;
import org.springframework.stereotype.Service;

/**
 * Session Roaming Phase 2 (backend plumbing only — not called by any production flow yet).
 * Central resolution point for the stable-user-id side of session/cash-movement ownership,
 * mirroring how {@code OwnershipAccessService} centralizes ownership resolution for the
 * general data-visibility feature. Reuses the same {@link OwnershipContextHolder} the
 * {@code JwtFilter} already populates on every authenticated request from the JWT
 * {@code userId} claim — no new token/claim parsing.
 *
 * <p>Future phases wire this in at two points: {@code PosSessionService#openSession} (stamp
 * {@code PosSession#ownerUserId}) and {@code PosSessionService#addCashMovement} (stamp
 * {@code PosCashMovement#performedByUserId}). Until then, production code keeps writing only the
 * legacy username columns ({@code openedBy}, {@code performedBy}) and this service is exercised
 * only by its own unit tests.
 */
@Service
public class PosSessionOwnershipService {

    /**
     * The current request principal's stable user id, or {@code null} for an unauthenticated/
     * system caller (schedulers, seeders). Never guessed or derived from a username — sourced
     * solely from the validated JWT claim via {@link OwnershipContextHolder}.
     */
    public Long currentPrincipalUserId() {
        return OwnershipContextHolder.currentUserId();
    }

    /**
     * The session's stable owner id. Returns {@code session.getOwnerUserId()} when set; falls
     * back safely to {@code null} otherwise (legacy sessions predating this column, or sessions
     * opened before a later phase starts stamping it) rather than guessing from {@code openedBy}.
     * Callers must treat {@code null} as "unknown owner", not "system-owned".
     */
    public Long resolveOwnerUserId(PosSession session) {
        return session != null ? session.getOwnerUserId() : null;
    }

    /** True when {@code session.ownerUserId} is set and matches {@code userId}. Null-safe on both sides. */
    public boolean isOwnedBy(PosSession session, Long userId) {
        Long ownerId = resolveOwnerUserId(session);
        return ownerId != null && userId != null && ownerId.equals(userId);
    }

    /**
     * The cash movement's stable performer id. Returns {@code movement.getPerformedByUserId()}
     * when set; falls back safely to {@code null} otherwise (legacy rows, or rows created before
     * a later phase starts stamping it) rather than guessing from {@code performedBy}.
     */
    public Long resolvePerformedByUserId(PosCashMovement movement) {
        return movement != null ? movement.getPerformedByUserId() : null;
    }
}
