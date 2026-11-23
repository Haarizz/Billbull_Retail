package com.billbull.backend.platform;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Applies plan entitlements to the merged permission map that {@code GET /api/role-permissions/me}
 * returns, so the frontend's sidebar and buttons hide what the plan excludes — the same answer
 * {@code ModulePermissionService} and {@link PlatformPolicyFilter} give the API.
 */
public final class PlatformEntitlementOverlay {

    private PlatformEntitlementOverlay() {}

    /**
     * Every permission key owned by a disabled optional module becomes all-false, and the module's
     * top-level key is added as an explicit all-false row (an explicit row is authoritative in the
     * frontend's {@code canAction}, so sub-keys can't fall back to a broader grant).
     */
    public static Map<String, Object> apply(Map<String, Object> merged, PlatformState state) {
        if (state == null || !state.managed()) return merged;
        for (String module : PlatformModules.OPTIONAL.keySet()) {
            if (state.isModuleEnabled(module)) continue;
            merged.put(module, denyAll());
            for (Map.Entry<String, Object> e : merged.entrySet()) {
                if (e.getKey().startsWith("_")) continue;
                PlatformModules.owningOptionalModule(e.getKey())
                        .filter(module::equals)
                        .ifPresent(m -> e.setValue(denyAll()));
            }
            if (module.equals("pos")) merged.put("sales.pos", denyAll());
        }
        Map<String, Object> ent = new LinkedHashMap<>();
        ent.put("status", state.status().name());
        ent.put("planCode", state.planCode());
        Map<String, Boolean> modules = new LinkedHashMap<>();
        PlatformModules.OPTIONAL.keySet().forEach(k -> modules.put(k, state.isModuleEnabled(k)));
        ent.put("modules", modules);
        merged.put("_entitlements", ent);
        return merged;
    }

    private static Map<String, Object> denyAll() {
        Map<String, Object> p = new LinkedHashMap<>();
        for (String a : new String[] {"view", "create", "edit", "delete", "approve", "export"}) p.put(a, false);
        return p;
    }
}
