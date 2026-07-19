package com.billbull.backend.security;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Single source of truth for every permission module key the RBAC system accepts.
 *
 * Keys are matched case-insensitively but stored in their canonical form so
 * repository lookups (which are exact-match) never create duplicate rows that
 * differ only by case. Keep this list in sync with the frontend module catalog
 * in {@code UserRoleConfig.jsx} and the seeds in {@link RolePermissionInitializer}.
 */
public final class ModuleCatalog {

    private static final List<String> CANONICAL_MODULES = Arrays.asList(
            // Top-level modules (horizontal visibility)
            "dashboard", "sales", "inventory", "purchases", "finance",
            "hr", "customer", "userManagement", "notification", "batch_manual_select",
            // Dashboard resources
            "dashboard.kpis", "dashboard.charts",
            // Sales resources (one key per sidebar page)
            "sales.customer", "sales.quotation", "sales.order", "sales.proforma",
            "sales.invoice", "sales.delivery", "sales.return", "sales.pos",
            "sales.payment", "sales.templates", "sales.reports", "sales.settings",
            // Inventory resources
            "inventory.category", "inventory.units", "inventory.product", "inventory.warehouse",
            "inventory.stock", "inventory.barcode", "inventory.reports",
            // Purchases resources
            "purchases.vendor", "purchases.lpo", "purchases.grn", "purchases.invoice",
            "purchases.payment", "purchases.templates", "purchases.reports",
            // Finance resources
            "finance.ledger", "finance.voucher", "finance.expense", "finance.reconcile",
            "finance.tax", "finance.reports", "finance.config", "finance.templates",
            // HR resources
            "hr.employee", "hr.payroll", "hr.attendance",
            // Customer Connect resources
            "customer.inquiry", "customer.followup", "customer.message",
            // User Management resources
            "userManagement.user", "userManagement.role", "userManagement.setup",
            // Workflow override permissions (financial flow §21A maker-checker controls)
            "permissions.journal.create",
            "permissions.journal.approve",
            "permissions.journal.approve-high-value",
            "permissions.posting.backdate-into-locked",
            "permissions.sales.override-credit-limit",
            "permissions.vendor.advance",
            "permissions.customer.advance.refund");

    /** lowercase key → canonical key */
    private static final Map<String, String> CANONICAL_BY_LOWERCASE = CANONICAL_MODULES.stream()
            .collect(Collectors.toMap(m -> m.toLowerCase(), Function.identity()));

    private ModuleCatalog() {
    }

    public static boolean isValid(String module) {
        return module != null && CANONICAL_BY_LOWERCASE.containsKey(module.toLowerCase());
    }

    /**
     * Returns the canonical spelling for a module key, or throws when the key
     * is not part of the catalog.
     */
    public static String canonicalize(String module) {
        String canonical = module == null ? null : CANONICAL_BY_LOWERCASE.get(module.toLowerCase());
        if (canonical == null) {
            throw new IllegalArgumentException("Unknown permission module: " + module);
        }
        return canonical;
    }

    public static List<String> allModules() {
        return CANONICAL_MODULES;
    }
}
