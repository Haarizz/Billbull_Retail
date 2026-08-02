package com.billbull.backend.pos.session;

import java.util.Optional;

/**
 * Session Roaming Phase 6 — immutable result of {@link PosSessionDiscoveryService#discover}.
 *
 * <p>Reports what was found; makes no decision about what to do with it. {@code terminalSession}
 * and {@code ownerSession} are independent lookups — both may be empty, both may be present (same
 * session or different sessions), or only one may be present. {@code ownerSessionCount} exists so
 * a {@link PosSessionDiscoveryStatus#MULTIPLE_OWNER_SESSIONS} result still tells the caller how
 * many owner sessions were found, even though {@code ownerSession} itself is empty in that case
 * (ambiguous — this service does not guess which one the caller meant).
 */
public record PosSessionDiscoveryResult(
        PosSessionDiscoveryStatus status,
        Optional<PosSession> terminalSession,
        Optional<PosSession> ownerSession,
        int ownerSessionCount) {

    public static PosSessionDiscoveryResult noSession() {
        return new PosSessionDiscoveryResult(
                PosSessionDiscoveryStatus.NO_SESSION, Optional.empty(), Optional.empty(), 0);
    }

    public static PosSessionDiscoveryResult terminalOnly(PosSession terminalSession) {
        return new PosSessionDiscoveryResult(
                PosSessionDiscoveryStatus.TERMINAL_SESSION, Optional.of(terminalSession), Optional.empty(), 0);
    }

    public static PosSessionDiscoveryResult ownerOnly(PosSession ownerSession) {
        return new PosSessionDiscoveryResult(
                PosSessionDiscoveryStatus.OWNER_SESSION, Optional.empty(), Optional.of(ownerSession), 1);
    }

    public static PosSessionDiscoveryResult sameSession(PosSession session) {
        return new PosSessionDiscoveryResult(
                PosSessionDiscoveryStatus.SAME_SESSION, Optional.of(session), Optional.of(session), 1);
    }

    public static PosSessionDiscoveryResult conflict(PosSession terminalSession, PosSession ownerSession) {
        return new PosSessionDiscoveryResult(
                PosSessionDiscoveryStatus.CONFLICT, Optional.of(terminalSession), Optional.of(ownerSession), 1);
    }

    public static PosSessionDiscoveryResult multipleOwnerSessions(
            Optional<PosSession> terminalSession, int ownerSessionCount) {
        return new PosSessionDiscoveryResult(
                PosSessionDiscoveryStatus.MULTIPLE_OWNER_SESSIONS, terminalSession, Optional.empty(), ownerSessionCount);
    }
}
