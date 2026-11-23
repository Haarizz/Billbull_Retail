package com.billbull.platform.tenant;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The tenant backend's optional modules ({@code com.billbull.backend.platform.PlatformModules}).
 * Keep the two lists identical: a tenant refuses a state push naming a module it doesn't know.
 * Sales, inventory, dashboard and user management are core and always on.
 */
public final class Modules {

    public static final List<String> OPTIONAL = List.of("pos", "purchases", "finance", "hr", "customer");

    public static final Map<String, String> LABELS = labels();

    private Modules() {}

    private static Map<String, String> labels() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("pos", "POS till");
        m.put("purchases", "Purchasing (LPO, GRN, vendors)");
        m.put("finance", "Accounting (ledger, vouchers, reports)");
        m.put("hr", "HR & payroll");
        m.put("customer", "Customer Connect (inquiries, messaging)");
        return java.util.Collections.unmodifiableMap(m);
    }

    public static boolean isOptional(String key) {
        return key != null && OPTIONAL.contains(key);
    }
}
