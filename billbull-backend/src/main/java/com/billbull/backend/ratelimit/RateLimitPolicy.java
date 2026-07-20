package com.billbull.backend.ratelimit;

/**
 * Request classification for Layer-1 generic rate limiting (design §4 policy table). Each policy
 * has its own token-bucket limits and its own scope key (per-IP for unauthenticated traffic,
 * per-user for authenticated). {@link #NONE} means "not rate-limited by the generic filter" —
 * used for exempt roles, non-API paths, and auth endpoints (which Layer 2 owns).
 */
public enum RateLimitPolicy {

    /** Unauthenticated permitAll endpoints (/api/client-logs/**). Keyed on IP — abuse-prone. */
    PUBLIC("public", ScopeKind.IP),

    /** Authenticated GETs. Generous, burst-tolerant. Keyed on userId. */
    READ("read", ScopeKind.USER),

    /** Authenticated POST/PUT/PATCH/DELETE. Tolerates POS bursts. Keyed on userId. */
    WRITE("write", ScopeKind.USER),

    /** Heavy report/export endpoints (Playwright/POI). Cost-based; low rate. Keyed on userId. */
    REPORT("report", ScopeKind.USER),

    /** Not subject to the generic limiter (auth endpoints, exempt roles, static/non-API). */
    NONE("none", ScopeKind.IP);

    /** Whether the bucket key is derived from the client IP or the authenticated user id. */
    public enum ScopeKind {
        IP,
        USER
    }

    private final String label;
    private final ScopeKind scopeKind;

    RateLimitPolicy(String label, ScopeKind scopeKind) {
        this.label = label;
        this.scopeKind = scopeKind;
    }

    /** Stable, log/metric-safe label. */
    public String label() {
        return label;
    }

    public ScopeKind scopeKind() {
        return scopeKind;
    }

    public boolean isLimited() {
        return this != NONE;
    }
}
