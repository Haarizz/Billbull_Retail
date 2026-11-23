package com.billbull.backend.platform;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Modules the control plane can switch off per tenant (plan entitlements), and the API paths each
 * one owns.
 *
 * <p>Keys are the top-level {@code ModuleCatalog} keys, so a disabled module also turns off every
 * {@code ModulePermissionService} check under it and the matching sidebar entries. The path list is
 * the backstop for endpoints that only check {@code hasRole('ADMIN')}.
 *
 * <p>Core modules (dashboard, sales, inventory, userManagement, notification) are not listed: every
 * other screen depends on them, so they can't be disabled. Disabling a module only blocks HTTP
 * calls into it — internal postings (for example a sale's GL entries when {@code finance} is off)
 * still happen, so the books stay complete and turning the module back on loses nothing.
 */
public final class PlatformModules {

    /** module key → API path prefixes (matched on a path-segment boundary). */
    public static final Map<String, List<String>> OPTIONAL = buildOptional();

    private PlatformModules() {}

    private static Map<String, List<String>> buildOptional() {
        Map<String, List<String>> m = new LinkedHashMap<>();
        m.put("pos", List.of("/api/pos", "/api/auth/pos"));
        m.put("purchases", List.of("/api/lpos", "/api/grns", "/api/purchase-invoices", "/api/purchase-rfqs",
                "/api/purchase", "/api/vendors", "/api/vendor-portal", "/api/approval-workflows"));
        m.put("finance", List.of("/api/financials", "/api/ledger", "/api/generalledger", "/api/expense-vouchers",
                "/api/expenses", "/api/pdcs", "/api/settlements", "/api/reconciliation", "/api/admin/gl-balance",
                "/api/pay-cheques"));
        m.put("hr", List.of("/api/payroll", "/api/salary-advances", "/api/hr"));
        m.put("customer", List.of("/api/inquiries", "/api/messaging"));
        return java.util.Collections.unmodifiableMap(m);
    }

    public static boolean isOptional(String module) {
        return module != null && OPTIONAL.containsKey(module);
    }

    /** The top-level module of a permission key: {@code "sales.pos" → "sales"}. */
    public static String topLevel(String moduleKey) {
        if (moduleKey == null) return null;
        String k = moduleKey.toLowerCase(Locale.ROOT);
        int dot = k.indexOf('.');
        return dot < 0 ? k : k.substring(0, dot);
    }

    /**
     * Permission keys that belong to an optional module without sharing its prefix: the till's
     * cashiering key lives under {@code sales} but is the POS module.
     */
    public static Optional<String> owningOptionalModule(String moduleKey) {
        if (moduleKey == null) return Optional.empty();
        String k = moduleKey.toLowerCase(Locale.ROOT);
        if (k.equals("sales.pos") || k.startsWith("permissions.pos.")) return Optional.of("pos");
        String top = topLevel(k);
        return isOptional(top) ? Optional.of(top) : Optional.empty();
    }

    /** The optional module whose API owns {@code path}, if any. */
    public static Optional<String> moduleForPath(String path) {
        if (path == null) return Optional.empty();
        for (Map.Entry<String, List<String>> e : OPTIONAL.entrySet()) {
            for (String prefix : e.getValue()) {
                if (path.equals(prefix) || path.startsWith(prefix + "/")) {
                    return Optional.of(e.getKey());
                }
            }
        }
        return Optional.empty();
    }
}
