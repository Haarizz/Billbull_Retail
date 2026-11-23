package com.billbull.backend.activity;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns a raw audited request ({@code POST /api/sales/invoices/42/send-email}) into something a
 * person reads: module SALES, action "Emailed", summary "Emailed sales invoice", reference "42".
 *
 * <p>Pure and stateless. Explicit rules cover the actions people do most and care most about;
 * everything else falls through to a generic reading of the path (verb from the HTTP method or a
 * trailing action word, subject from the last resource segment), so every audited mutation gets
 * a readable line — new endpoints never show up as raw URLs.</p>
 *
 * <p>{@link #MODULE_PREFIXES} and {@link #NOISE_PATTERNS} are also what {@link ActivityService}
 * filters on in SQL, so the module of a row and the module filter can never disagree.</p>
 */
public final class ActivityTranslator {

    private ActivityTranslator() {}

    // ── Modules ───────────────────────────────────────────────────────────────

    /** Module → API path prefixes (segment-exact: "/api/purchase" does not match "/api/purchase-invoices"). */
    public static final Map<String, List<String>> MODULE_PREFIXES = new LinkedHashMap<>();
    static {
        MODULE_PREFIXES.put("AUTH", List.of("/api/auth", "/api/session"));
        MODULE_PREFIXES.put("POS", List.of("/api/pos"));
        MODULE_PREFIXES.put("SALES", List.of("/api/sales", "/api/delivery-notes", "/api/vouchers", "/api/proforma",
                "/api/customer-prices", "/api/inquiries", "/api/messaging", "/api/whatsapp"));
        MODULE_PREFIXES.put("INVENTORY", List.of("/api/products", "/api/product-categories", "/api/inventory",
                "/api/warehouses", "/api/zones", "/api/locators", "/api/units", "/api/brands", "/api/departments",
                "/api/sub-departments", "/api/stock-transfers", "/api/barcode-templates", "/api/pricing",
                "/api/pricing-workspace", "/api/price-levels"));
        MODULE_PREFIXES.put("PURCHASE", List.of("/api/purchase", "/api/purchase-invoices", "/api/purchase-rfqs",
                "/api/lpos", "/api/grns", "/api/vendors", "/api/vendor-portal"));
        MODULE_PREFIXES.put("FINANCE", List.of("/api/financials", "/api/ledger", "/api/generalledger",
                "/api/expenses", "/api/expense-vouchers", "/api/pdcs", "/api/pay-cheques", "/api/settlements",
                "/api/reconciliation"));
        MODULE_PREFIXES.put("HR", List.of("/api/employees", "/api/hr", "/api/payroll", "/api/salary-advances"));
        MODULE_PREFIXES.put("ADMIN", List.of("/api/settings", "/api/branches", "/api/users", "/api/roles",
                "/api/role-permissions", "/api/templates", "/api/admin", "/api/approval-workflows", "/api/tasks",
                "/api/documents", "/api/dashboard"));
    }

    /**
     * SQL LIKE patterns for machine traffic that is audited but is not something a person did:
     * terminal heartbeats, session keep-alives, print-job bookkeeping, read-only POSTs.
     * On testdb these are ~95% of all audited mutations.
     */
    public static final List<String> NOISE_PATTERNS = List.of(
            "%/heartbeat",
            "%/touch-activity",
            "/api/pos/terminals/register",
            "/api/pos/print-jobs%",
            "/api/pos/printers/%/runtime",
            "/api/pos/printers/%/print/%",
            "/api/pos/checkout/attempts/lookup",
            "/api/pos/settings/verify-pin",
            "/api/pos/offline/keys%",
            "/api/pos/sessions/%/x-report/print-check",
            "/api/auth/pos/pin/staff",
            "/api/auth/refresh%",
            "/api/session/switch-branch",
            "/api/pricing/resolve%",
            "/api/barcode-templates/label-prices",
            "/api/documents/pdf%",
            "/api/notifications%",
            "/api/employees/pos-pin/check",
            "%/search",
            "%/lookup",
            "%/preview",
            "%/validate",
            "%/calculate");

    public static String moduleOf(String path) {
        if (path == null) return "OTHER";
        String best = "OTHER";
        int bestLen = -1;
        for (var e : MODULE_PREFIXES.entrySet()) {
            for (String prefix : e.getValue()) {
                if ((path.equals(prefix) || path.startsWith(prefix + "/")) && prefix.length() > bestLen) {
                    best = e.getKey();
                    bestLen = prefix.length();
                }
            }
        }
        return best;
    }

    // ── Translation ───────────────────────────────────────────────────────────

    /** What a row means. {@code reference} and {@code link} may be null. */
    public record Reading(String module, String action, String summary, String reference, String link) {}

    private record Rule(String method, Pattern pattern, String action, String subject, String link) {}

    private static final List<Rule> RULES = new ArrayList<>();

    private static void rule(String method, String path, String action, String subject, String link) {
        // "{id}" captures one path segment as the row's reference.
        String regex = "^" + Pattern.quote(path).replace("{id}", "\\E([^/]+)\\Q") + "$";
        RULES.add(new Rule(method, Pattern.compile(regex), action, subject, link));
    }

    static {
        // Sign-in / account
        rule("POST", "/api/auth/login", "Signed in", null, null);
        rule("POST", "/api/auth/pos/login", "Signed in", "to the POS till", null);
        rule("POST", "/api/auth/pos/pin/login", "Signed in", "to the POS till with a PIN", null);
        rule("POST", "/api/auth/logout", "Signed out", null, null);
        rule("POST", "/api/auth/change-password", "Changed", "their password", null);
        rule("PUT", "/api/auth/profile", "Updated", "their profile", "/myprofile/overview");

        // POS
        rule("POST", "/api/pos/checkout", "Completed", "a POS sale", "/sales/invoice");
        rule("POST", "/api/pos/checkout/deliveries/{id}/settle", "Settled", "a delivery payment", "/sales/pos");
        rule("POST", "/api/pos/sessions/open", "Opened", "a POS session", "/sales/pos");
        rule("POST", "/api/pos/sessions/{id}/close", "Closed", "POS session", "/sales/pos");
        rule("POST", "/api/pos/sessions/{id}/begin-closure", "Started closing", "POS session", "/sales/pos");
        rule("POST", "/api/pos/sessions/{id}/authorize-closure", "Authorized closure of", "POS session", "/sales/pos");
        rule("POST", "/api/pos/sessions/{id}/transfer", "Transferred", "POS session", "/sales/pos");
        rule("POST", "/api/pos/sessions/{id}/x-report/generate", "Generated", "an X report", "/sales/pos");
        rule("POST", "/api/pos/sessions/close-day", "Ran", "the day close (Z report)", "/sales/pos");
        rule("POST", "/api/pos/layaways", "Created", "a layaway", "/sales/pos");
        rule("POST", "/api/pos/layaways/{id}/convert", "Converted", "a layaway to a sale", "/sales/pos");
        rule("POST", "/api/pos/settings", "Updated", "POS settings", "/sales/pos");
        rule("POST", "/api/pos/settings/appearance", "Changed", "the POS appearance", "/sales/pos");
        rule("POST", "/api/pos/settings/supervisor-auth", "Gave", "a supervisor authorization", null);
        rule("POST", "/api/pos/settings/supervisor-handover", "Authorized", "a cashier handover", null);
        rule("PUT", "/api/pos/terminals/{id}/status", "Changed the status of", "terminal", "/sales/pos");
        rule("POST", "/api/pos/terminals/{id}/archive", "Archived", "terminal", "/sales/pos");
        rule("POST", "/api/pos/terminals/{id}/restore", "Restored", "terminal", "/sales/pos");

        // Sales
        rule("POST", "/api/sales/invoices", "Created", "a sales invoice", "/sales/invoice");
        rule("POST", "/api/sales/invoices/{id}/payment-detailed", "Recorded a payment on", "sales invoice", "/sales/invoice");
        rule("POST", "/api/sales/quotations", "Created", "a quotation", "/sales/quotation");
        rule("POST", "/api/sales/sales-orders", "Created", "a sales order", "/sales/order");
        rule("POST", "/api/sales/returns", "Created", "a sales return", "/sales/return");
        rule("PUT", "/api/sales/returns/{id}/status", "Changed the status of", "sales return", "/sales/return");
        rule("POST", "/api/sales/receipt-vouchers", "Created", "a receipt voucher", "/sales/payment");
        rule("POST", "/api/sales/payments", "Recorded", "a customer payment", "/sales/payment");
        rule("POST", "/api/sales/customer-ledger", "Added", "a customer", "/sales/customers");
        rule("PUT", "/api/sales/settings", "Updated", "sales settings", null);
        rule("POST", "/api/delivery-notes/{id}/advance-status", "Moved forward", "delivery note", "/sales/deliverynote");
        rule("POST", "/api/vouchers", "Issued", "a credit voucher", null);

        // Inventory
        rule("POST", "/api/products", "Added", "a product", "/inventory/products");
        rule("PUT", "/api/products/{id}", "Updated", "product", "/inventory/products");
        rule("DELETE", "/api/products/{id}", "Deleted", "product", "/inventory/products");
        rule("POST", "/api/products/import/excel/start", "Started", "a product import", "/inventory/products");
        rule("POST", "/api/pricing/units", "Updated", "unit pricing", null);
        rule("POST", "/api/inventory/stock-take/sessions", "Started", "a stock take", "/inventory/stock-take");

        // Purchase
        rule("POST", "/api/lpos", "Created", "an LPO", "/purchases/lpo");
        rule("POST", "/api/purchase-invoices/draft", "Saved", "a purchase invoice draft", "/purchases/invoice");

        // Admin
        rule("POST", "/api/role-permissions", "Changed", "role permissions", "/settings/roles");
        rule("POST", "/api/role-permissions/bulk", "Changed", "role permissions", "/settings/roles");
        rule("PUT", "/api/role-permissions/{id}", "Changed", "role permissions", "/settings/roles");
        rule("DELETE", "/api/role-permissions/{id}", "Removed", "a role permission", "/settings/roles");
        rule("POST", "/api/templates", "Created", "a document template", null);
        rule("PUT", "/api/templates/{id}", "Edited", "document template", null);
        rule("DELETE", "/api/templates/{id}", "Deleted", "document template", null);
        rule("PUT", "/api/branches/{id}", "Updated", "branch settings", null);
        rule("PUT", "/api/branches/{id}/tax-configuration", "Updated", "branch tax settings", null);
        rule("PUT", "/api/settings/company-profile", "Updated", "the company profile", null);
        rule("PUT", "/api/settings/email-config", "Updated", "email settings", null);
        rule("POST", "/api/settings/email-config/test", "Sent", "a test email", null);
        rule("PUT", "/api/users/{id}/freeze", "Froze", "user account", null);
        rule("PUT", "/api/users/{id}/unfreeze", "Unfroze", "user account", null);
        rule("PUT", "/api/users/{id}/branches", "Changed the branches of", "user", null);
    }

    /** Trailing path words that name the action better than the HTTP method does. */
    private static final Map<String, String> ACTION_WORDS = Map.ofEntries(
            Map.entry("approve", "Approved"), Map.entry("reject", "Rejected"), Map.entry("submit", "Submitted"),
            Map.entry("cancel", "Cancelled"), Map.entry("close", "Closed"), Map.entry("open", "Opened"),
            Map.entry("send", "Sent"), Map.entry("send-email", "Emailed"), Map.entry("email", "Emailed"),
            Map.entry("archive", "Archived"), Map.entry("restore", "Restored"), Map.entry("convert", "Converted"),
            Map.entry("revise", "Revised"), Map.entry("status", "Changed the status of"), Map.entry("freeze", "Froze"),
            Map.entry("unfreeze", "Unfroze"), Map.entry("post", "Posted"), Map.entry("reverse", "Reversed"),
            Map.entry("import", "Imported"), Map.entry("export", "Exported"), Map.entry("print", "Printed"),
            Map.entry("settle", "Settled"), Map.entry("transfer", "Transferred"), Map.entry("activate", "Activated"),
            Map.entry("deactivate", "Deactivated"), Map.entry("complete", "Completed"), Map.entry("receive", "Received"),
            Map.entry("dispatch", "Dispatched"), Map.entry("follow-up", "Logged a follow-up on"),
            Map.entry("advance-status", "Moved forward"), Map.entry("duplicate", "Duplicated"),
            Map.entry("reset-password", "Reset the password of"), Map.entry("verify", "Verified"),
            Map.entry("code", "Requested a code for"), Map.entry("upload", "Uploaded a file to"),
            Map.entry("test", "Tested"), Map.entry("bulk", "Bulk-updated"), Map.entry("batch-selection", "Picked batches for"));

    /** Nicer names for resource segments the generic reading would render clumsily. */
    private static final Map<String, String> SUBJECTS = Map.ofEntries(
            Map.entry("lpos", "LPO"), Map.entry("grns", "GRN"), Map.entry("pdcs", "post-dated cheque"),
            Map.entry("purchase-rfqs", "RFQ"), Map.entry("invoices", "invoice"), Map.entry("sales-orders", "sales order"),
            Map.entry("returns", "sales return"), Map.entry("customer-ledger", "customer"),
            Map.entry("role-permissions", "role permission"), Map.entry("vendor-portal", "vendor portal"),
            Map.entry("invite", "vendor invite"), Map.entry("hr", "HR record"), Map.entry("pay-cheques", "pay cheque"),
            Map.entry("stock-take", "stock take"), Map.entry("x-report", "X report"));

    private static final Pattern ID_SEGMENT = Pattern.compile(
            "^(\\d+|[0-9a-fA-F-]{32,36}|[A-Z]{1,6}-?\\d{2,}[-A-Z0-9]*|[A-Za-z0-9_-]{24,})$");

    public static Reading translate(String method, String path) {
        String m = method == null ? "" : method.toUpperCase(Locale.ROOT);
        String p = stripQuery(path);
        String module = moduleOf(p);

        for (Rule r : RULES) {
            if (!r.method().equals(m)) continue;
            Matcher matcher = r.pattern().matcher(p);
            if (matcher.matches()) {
                String ref = matcher.groupCount() >= 1 ? matcher.group(1) : null;
                String summary = r.subject() == null ? r.action()
                        : r.action() + " " + r.subject() + (ref != null && !hasArticle(r.subject()) ? " #" + ref : "");
                return new Reading(module, r.action(), summary, ref, r.link());
            }
        }
        return generic(module, m, p);
    }

    private static Reading generic(String module, String method, String path) {
        List<String> segments = new ArrayList<>();
        for (String s : path.split("/")) if (!s.isBlank()) segments.add(s);
        if (!segments.isEmpty() && segments.get(0).equals("api")) segments.remove(0);

        String reference = null;
        String actionWord = null;
        String subjectSegment = null;
        int subjectIndex = -1;
        for (int i = segments.size() - 1; i >= 0; i--) {
            String s = segments.get(i);
            if (ID_SEGMENT.matcher(s).matches()) {
                if (reference == null) reference = s;
                continue;
            }
            if (actionWord == null && subjectSegment == null && i == segments.size() - 1 && ACTION_WORDS.containsKey(s)) {
                actionWord = ACTION_WORDS.get(s);
                continue;
            }
            subjectSegment = s;
            subjectIndex = i;
            break;
        }

        // A nested resource with no id of its own: ".../sessions/STK-1/items" is an item in session STK-1.
        String parent = null;
        if (reference == null && subjectIndex >= 2 && ID_SEGMENT.matcher(segments.get(subjectIndex - 1)).matches()
                && !ID_SEGMENT.matcher(segments.get(subjectIndex - 2)).matches()) {
            reference = segments.get(subjectIndex - 1);
            parent = humanize(segments.get(subjectIndex - 2));
        }

        String action = actionWord != null ? actionWord : switch (method) {
            case "POST" -> "Created";
            case "PUT", "PATCH" -> "Updated";
            case "DELETE" -> "Deleted";
            default -> "Changed";
        };
        String subject = subjectSegment == null ? "a record" : humanize(subjectSegment);
        boolean isNew = actionWord == null && "POST".equals(method) && (reference == null || parent != null);
        String ref = reference != null && reference.length() <= 24 ? " #" + reference : "";
        String summary = action + " " + (isNew ? article(subject) + " " : "") + subject
                + (parent != null ? ("POST".equals(method) ? " in " : " of ") + parent + ref : ref);
        return new Reading(module, action, summary, reference, null);
    }

    /** "purchase-invoices" → "purchase invoice". */
    static String humanize(String segment) {
        String known = SUBJECTS.get(segment);
        if (known != null) return known;
        String words = segment.replace('-', ' ').replace('_', ' ').trim();
        if (words.endsWith("ies")) words = words.substring(0, words.length() - 3) + "y";
        else if (words.endsWith("sses")) words = words.substring(0, words.length() - 2);
        else if (words.endsWith("s") && !words.endsWith("ss") && !words.endsWith("us")) words = words.substring(0, words.length() - 1);
        return words;
    }

    private static String article(String noun) {
        if (noun.isEmpty()) return "a";
        if (Character.isUpperCase(noun.charAt(0)) && noun.length() > 1 && Character.isUpperCase(noun.charAt(1))) {
            return "AEFHILMNORSX".indexOf(noun.charAt(0)) >= 0 ? "an" : "a"; // acronyms: "an LPO", "a GRN"
        }
        return "aeiou".indexOf(Character.toLowerCase(noun.charAt(0))) >= 0 ? "an" : "a";
    }

    /** "a layaway", "an X report", "the day close" already read as complete phrases. */
    private static boolean hasArticle(String subject) {
        return subject.startsWith("a ") || subject.startsWith("an ") || subject.startsWith("the ")
                || subject.startsWith("their ");
    }

    private static String stripQuery(String path) {
        if (path == null) return "";
        int q = path.indexOf('?');
        return q >= 0 ? path.substring(0, q) : path;
    }

    // ── Business-event wording ────────────────────────────────────────────────

    /** "SALES_RETURN" + "RETURN_APPROVED" + "SR-0007" → "Sales return SR-0007 · return approved". */
    public static String describeBusinessEvent(String entityType, String action, String entityId) {
        String entity = entityType == null ? "Record" : sentence(entityType.replace('_', ' '));
        String verb = action == null ? "" : action.replace('_', ' ').toLowerCase(Locale.ROOT);
        String id = entityId == null || entityId.equals("-") ? "" : " " + entityId;
        return entity + id + (verb.isBlank() ? "" : " · " + verb);
    }

    private static String sentence(String s) {
        String lower = s.toLowerCase(Locale.ROOT);
        return lower.isEmpty() ? lower : Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }

    // ── Device ────────────────────────────────────────────────────────────────

    /** Short device label from a User-Agent: "BillBull POS", "Chrome on Windows", "Safari on iPhone". */
    public static String deviceOf(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) return null;
        String ua = userAgent;
        if (ua.contains("BillBullPOS") || ua.contains("Electron")) return "BillBull POS app";
        String browser = ua.contains("Edg/") ? "Edge"
                : ua.contains("OPR/") ? "Opera"
                : ua.contains("Firefox/") ? "Firefox"
                : ua.contains("Chrome/") ? "Chrome"
                : ua.contains("Safari/") ? "Safari"
                : null;
        String os = ua.contains("Windows") ? "Windows"
                : ua.contains("iPhone") ? "iPhone"
                : ua.contains("iPad") ? "iPad"
                : ua.contains("Android") ? "Android"
                : ua.contains("Mac OS") ? "Mac"
                : ua.contains("Linux") ? "Linux"
                : null;
        if (browser == null && os == null) return ua.length() > 40 ? ua.substring(0, 40) + "…" : ua;
        if (browser == null) return os;
        return os == null ? browser : browser + " on " + os;
    }
}
