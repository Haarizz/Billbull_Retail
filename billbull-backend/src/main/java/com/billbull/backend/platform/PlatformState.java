package com.billbull.backend.platform;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * What the control plane last pushed to this tenant. {@link #unmanaged()} — no row in
 * {@code platform_tenant_state} — means every module on and no limits, i.e. the behaviour every
 * tenant had before the control plane existed.
 *
 * @param modules optional-module key → enabled; a module absent from the map is enabled
 * @param limits  {@code maxUsers}, {@code maxBranches}, {@code maxTerminalsPerBranch}; absent or
 *                null means unlimited
 */
public record PlatformState(
        boolean managed,
        TenantLifecycleStatus status,
        String statusMessage,
        String planCode,
        Map<String, Boolean> modules,
        Map<String, Integer> limits,
        long configVersion,
        OffsetDateTime updatedAt,
        String updatedBy) {

    public PlatformState {
        status = status == null ? TenantLifecycleStatus.ACTIVE : status;
        modules = modules == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(modules));
        limits = limits == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(limits));
    }

    public static PlatformState unmanaged() {
        return new PlatformState(false, TenantLifecycleStatus.ACTIVE, null, null, Map.of(), Map.of(), 0L, null, null);
    }

    public boolean isModuleEnabled(String module) {
        if (module == null || !PlatformModules.isOptional(module)) return true;
        Boolean v = modules.get(module);
        return v == null || v;
    }

    /** @return the limit, or {@code null} for unlimited. */
    public Integer limit(String key) {
        Integer v = limits.get(key);
        return v == null || v <= 0 ? null : v;
    }

    public static final String LIMIT_USERS = "maxUsers";
    public static final String LIMIT_BRANCHES = "maxBranches";
    public static final String LIMIT_TERMINALS_PER_BRANCH = "maxTerminalsPerBranch";
}
