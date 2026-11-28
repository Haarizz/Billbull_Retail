package com.billbull.platform.errors;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The BillBull ERP module an error belongs to, worked out from the API path (server errors), the
 * screen URL (browser errors) or the Java package of the logger (background jobs). Each module
 * says, in business terms, what a failed change means for the client's books and stock.
 */
public enum ErpModule {

    POS("Point of Sale",
            "A till action failed. If it was a checkout, the sale was not recorded — no receipt, stock deduction or "
                    + "payment was posted — so the cashier should check Recent sales before ringing it up again, to "
                    + "avoid a double sale. If it was a session open/close or day close, that step did not complete."),
    SALES("Sales",
            "The sales document (invoice, delivery note, quotation, return or price change) was not saved. Its stock "
                    + "movements and ledger postings normally run in the same database transaction, so nothing should "
                    + "be half-posted — confirm on the document list if in doubt."),
    PURCHASE("Purchase",
            "The purchase document (RFQ, LPO, GRN, purchase invoice or supplier payment) was not saved. No stock was "
                    + "received and no supplier balance changed."),
    INVENTORY("Inventory",
            "The stock action (adjustment, transfer, stock take, putaway or product change) did not complete. On-hand "
                    + "quantities are unchanged: the stock ledger only changes when a movement is committed."),
    FINANCIALS("Financials",
            "The accounting action (voucher, journal, receipt, expense, PDC or reconciliation) was not posted. The "
                    + "ledgers and trial balance are unchanged."),
    HR("HR & Payroll",
            "The HR or payroll record (employee, salary advance, payroll run or cheque) was not saved."),
    USERS("Users & Access",
            "A sign-in, user, role or permission change failed. Users may be unable to sign in or to get the access "
                    + "they need until it is fixed."),
    SETTINGS("Settings & Setup",
            "A settings change was not saved; the previous configuration is still in force."),
    DOCUMENTS("Documents & Messaging",
            "A document could not be generated, printed or sent. The business transaction behind it is already "
                    + "saved — only the output failed and can be produced again once fixed."),
    REPORTS("Dashboards & Reports",
            "A dashboard or report failed. Reports only read data, so nothing was changed."),
    PLATFORM("Platform agent",
            "A control-plane call to this client failed; the client's own users are not affected."),
    GENERAL("General",
            "The change was not saved.");

    private final String label;
    private final String writeImpact;

    ErpModule(String label, String writeImpact) {
        this.label = label;
        this.writeImpact = writeImpact;
    }

    public String label() {
        return label;
    }

    public String writeImpact() {
        return writeImpact;
    }

    /** API path prefix → module. Longest match wins, so list order doesn't matter. */
    private static final Map<String, ErpModule> API = Map.ofEntries(
            Map.entry("/api/pos", POS),
            Map.entry("/api/sales", SALES), Map.entry("/api/delivery-notes", SALES), Map.entry("/api/proforma", SALES),
            Map.entry("/api/inquiries", SALES), Map.entry("/api/customer-prices", SALES), Map.entry("/api/price-levels", SALES),
            Map.entry("/api/pricing", SALES), Map.entry("/api/pricing-workspace", SALES), Map.entry("/api/customers", SALES),
            Map.entry("/api/purchase", PURCHASE), Map.entry("/api/purchase-invoices", PURCHASE), Map.entry("/api/purchase-rfqs", PURCHASE),
            Map.entry("/api/grns", PURCHASE), Map.entry("/api/lpos", PURCHASE), Map.entry("/api/vendors", PURCHASE),
            Map.entry("/api/vendor-portal", PURCHASE),
            Map.entry("/api/inventory", INVENTORY), Map.entry("/api/products", INVENTORY), Map.entry("/api/product-categories", INVENTORY),
            Map.entry("/api/brands", INVENTORY), Map.entry("/api/units", INVENTORY), Map.entry("/api/sub-departments", INVENTORY),
            Map.entry("/api/warehouses", INVENTORY), Map.entry("/api/zones", INVENTORY), Map.entry("/api/locators", INVENTORY),
            Map.entry("/api/bin-moves", INVENTORY), Map.entry("/api/stock-transfers", INVENTORY), Map.entry("/api/barcode-templates", INVENTORY),
            Map.entry("/api/financials", FINANCIALS), Map.entry("/api/generalledger", FINANCIALS), Map.entry("/api/ledger", FINANCIALS),
            Map.entry("/api/vouchers", FINANCIALS), Map.entry("/api/expense-vouchers", FINANCIALS), Map.entry("/api/expenses", FINANCIALS),
            Map.entry("/api/pdcs", FINANCIALS), Map.entry("/api/reconciliation", FINANCIALS), Map.entry("/api/settlements", FINANCIALS),
            Map.entry("/api/hr", HR), Map.entry("/api/employees", HR), Map.entry("/api/payroll", HR),
            Map.entry("/api/salary-advances", HR), Map.entry("/api/pay-cheques", HR),
            Map.entry("/api/auth", USERS), Map.entry("/api/users", USERS), Map.entry("/api/roles", USERS),
            Map.entry("/api/role-permissions", USERS), Map.entry("/api/session", USERS), Map.entry("/api/access-audit", USERS),
            Map.entry("/api/platform-access", USERS), Map.entry("/api/admin", USERS), Map.entry("/api/audit-logs", USERS),
            Map.entry("/api/settings", SETTINGS), Map.entry("/api/branches", SETTINGS), Map.entry("/api/templates", SETTINGS),
            Map.entry("/api/approval-workflows", SETTINGS),
            Map.entry("/api/documents", DOCUMENTS), Map.entry("/api/document-links", DOCUMENTS), Map.entry("/api/messaging", DOCUMENTS),
            Map.entry("/api/whatsapp", DOCUMENTS), Map.entry("/api/notifications", DOCUMENTS),
            Map.entry("/api/dashboard", REPORTS), Map.entry("/api/activity", REPORTS),
            Map.entry("/api/platform", PLATFORM));

    /** Screen (browser route) prefix → module. */
    private static final List<Map.Entry<String, ErpModule>> SCREENS = List.of(
            Map.entry("/pos", POS), Map.entry("/sales/pos", POS),
            Map.entry("/sales", SALES), Map.entry("/customer", SALES),
            Map.entry("/purchase", PURCHASE),
            Map.entry("/inventory", INVENTORY),
            Map.entry("/financials", FINANCIALS), Map.entry("/finance", FINANCIALS),
            Map.entry("/hr", HR),
            Map.entry("/settings", SETTINGS),
            Map.entry("/users", USERS), Map.entry("/login", USERS),
            Map.entry("/reports", REPORTS), Map.entry("/dashboard", REPORTS));

    /** Logger package segment (com.billbull.backend.&lt;segment&gt;...) → module. */
    private static final Map<String, ErpModule> PACKAGES = Map.ofEntries(
            Map.entry("pos", POS), Map.entry("sales", SALES), Map.entry("customer", SALES),
            Map.entry("purchase", PURCHASE), Map.entry("inventory", INVENTORY),
            Map.entry("financials", FINANCIALS), Map.entry("hr", HR),
            Map.entry("auth", USERS), Map.entry("user", USERS), Map.entry("role", USERS), Map.entry("security", USERS),
            Map.entry("settings", SETTINGS), Map.entry("document", DOCUMENTS), Map.entry("notification", DOCUMENTS),
            Map.entry("messaging", DOCUMENTS), Map.entry("dashboard", REPORTS), Map.entry("platform", PLATFORM));

    public static ErpModule of(ErrorFacts f) {
        if (f.source() == ErrorFacts.Source.CLIENT) return fromScreen(f.pathTemplate());
        ErpModule byPath = fromApiPath(f.pathTemplate());
        if (byPath != GENERAL) return byPath;
        return fromLogger(f.logger() != null ? f.logger() : f.topFrame());
    }

    static ErpModule fromApiPath(String path) {
        if (path == null) return GENERAL;
        String p = path.toLowerCase(Locale.ROOT);
        String best = null;
        for (String prefix : API.keySet()) {
            if ((p.equals(prefix) || p.startsWith(prefix + "/")) && (best == null || prefix.length() > best.length())) {
                best = prefix;
            }
        }
        return best == null ? GENERAL : API.get(best);
    }

    static ErpModule fromScreen(String path) {
        if (path == null) return GENERAL;
        String p = path.toLowerCase(Locale.ROOT);
        // The standalone till is served under /pos/, the Retail till at /sales/pos.
        for (Map.Entry<String, ErpModule> e : SCREENS) {
            if (p.equals(e.getKey()) || p.startsWith(e.getKey() + "/")) return e.getValue();
        }
        return GENERAL;
    }

    static ErpModule fromLogger(String logger) {
        if (logger == null) return GENERAL;
        if (logger.contains("GlBalanceRebuildJob") || logger.contains("PeriodLock")) return FINANCIALS;
        if (logger.contains("AuditLogRetentionJob")) return USERS;
        String prefix = "com.billbull.backend.";
        if (!logger.startsWith(prefix)) return GENERAL;
        String rest = logger.substring(prefix.length());
        int dot = rest.indexOf('.');
        String segment = dot > 0 ? rest.substring(0, dot) : rest;
        return PACKAGES.getOrDefault(segment, GENERAL);
    }
}
