package com.billbull.backend.pos.session;

/**
 * Session Roaming Phase 7 — thrown by {@code PosSessionService#openSession} instead of proceeding
 * when discovery finds an ambiguous or conflicting session landscape (OWNER_SESSION, CONFLICT,
 * MULTIPLE_OWNER_SESSIONS). Carries the structured {@link PosSessionDiscoveryResponse} so the
 * controller can return it as-is rather than a generic error string; no session, hosting, or
 * transfer state is touched before this is thrown.
 */
public class PosSessionDiscoveryBlockedException extends RuntimeException {

    private final PosSessionDiscoveryResponse response;

    public PosSessionDiscoveryBlockedException(PosSessionDiscoveryResponse response) {
        super(response.getMessage());
        this.response = response;
    }

    public PosSessionDiscoveryResponse getResponse() {
        return response;
    }
}
