package com.billbull.platform.tenant;

/**
 * Lifecycle of a client in the registry, and what the tenant backend is told to enforce.
 *
 * <ul>
 *   <li>{@code ONBOARDING} — being set up; the backend runs normally ({@code ACTIVE}).</li>
 *   <li>{@code ACTIVE} — live.</li>
 *   <li>{@code READ_ONLY} — users can sign in and read/export, not change anything.</li>
 *   <li>{@code SUSPENDED} — nobody can sign in; data is kept.</li>
 *   <li>{@code ARCHIVED} — offboarded; enforced as SUSPENDED and hidden from day-to-day lists.</li>
 * </ul>
 */
public enum TenantStatus {
    ONBOARDING,
    ACTIVE,
    READ_ONLY,
    SUSPENDED,
    ARCHIVED;

    /** The status value the tenant's platform agent understands. */
    public String agentStatus() {
        return switch (this) {
            case ONBOARDING, ACTIVE -> "ACTIVE";
            case READ_ONLY -> "READ_ONLY";
            case SUSPENDED, ARCHIVED -> "SUSPENDED";
        };
    }

    public boolean restrictive() {
        return this == READ_ONLY || this == SUSPENDED || this == ARCHIVED;
    }
}
