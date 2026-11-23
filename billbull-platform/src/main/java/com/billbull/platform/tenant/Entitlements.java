package com.billbull.platform.tenant;

import java.util.LinkedHashMap;
import java.util.Map;

import com.billbull.platform.plan.Plan;

/**
 * A tenant's effective entitlements: the plan, then the tenant's own overrides on top.
 *
 * <ul>
 *   <li>Module: tenant override if set, else whether the plan includes it. No plan = all modules.</li>
 *   <li>Limit: tenant override if set (0 = unlimited), else the plan's (null = unlimited).</li>
 * </ul>
 */
public record Entitlements(Map<String, Boolean> modules, Integer maxUsers, Integer maxBranches,
                           Integer maxTerminalsPerBranch) {

    public static Entitlements resolve(Plan plan, Tenant tenant) {
        Map<String, Boolean> modules = new LinkedHashMap<>();
        for (String m : Modules.OPTIONAL) {
            Boolean override = tenant.moduleOverrides.get(m);
            modules.put(m, override != null ? override : plan == null || plan.moduleSet().contains(m));
        }
        return new Entitlements(modules,
                limit(tenant.maxUsers, plan != null ? plan.maxUsers : null),
                limit(tenant.maxBranches, plan != null ? plan.maxBranches : null),
                limit(tenant.maxTerminalsPerBranch, plan != null ? plan.maxTerminalsPerBranch : null));
    }

    private static Integer limit(Integer override, Integer planValue) {
        Integer v = override != null ? override : planValue;
        return v == null || v <= 0 ? null : v;
    }

    /** {@code {maxUsers: 5, ...}} with unlimited entries left out, as the tenant agent expects. */
    public Map<String, Integer> limitsMap() {
        Map<String, Integer> m = new LinkedHashMap<>();
        if (maxUsers != null) m.put("maxUsers", maxUsers);
        if (maxBranches != null) m.put("maxBranches", maxBranches);
        if (maxTerminalsPerBranch != null) m.put("maxTerminalsPerBranch", maxTerminalsPerBranch);
        return m;
    }

    /** The body of {@code PUT /api/platform/state}. */
    public Map<String, Object> agentState(Tenant tenant, Plan plan) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", tenant.status.agentStatus());
        body.put("statusMessage", tenant.status.restrictive() ? tenant.statusMessage : null);
        body.put("planCode", plan != null ? plan.code : null);
        body.put("modules", modules);
        body.put("limits", limitsMap());
        body.put("configVersion", tenant.configVersion);
        return body;
    }
}
