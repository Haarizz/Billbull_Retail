package com.billbull.backend.platform;

/**
 * Lifecycle status the control plane enforces on a tenant.
 *
 * <ul>
 *   <li>{@code ACTIVE} — normal.</li>
 *   <li>{@code READ_ONLY} — sign-in and every GET work; every write is refused with 423. Meant for
 *       overdue accounts: users can still look up and export their data.</li>
 *   <li>{@code SUSPENDED} — every tenant API call, sign-in included, is refused with 423. Nothing is
 *       deleted; setting the status back to ACTIVE restores the tenant at once.</li>
 * </ul>
 */
public enum TenantLifecycleStatus {
    ACTIVE,
    READ_ONLY,
    SUSPENDED;

    public static TenantLifecycleStatus parse(String value) {
        if (value == null || value.isBlank()) return ACTIVE;
        return valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
    }
}
