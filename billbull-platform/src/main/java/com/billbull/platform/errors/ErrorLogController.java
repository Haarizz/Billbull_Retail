package com.billbull.platform.errors;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.audit.AuditService;
import com.billbull.platform.auth.CurrentUser;
import com.billbull.platform.auth.PlatformPrincipal;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.tenant.TenantStatus;
import com.billbull.platform.web.ClientIp;

/**
 * Error logs across every client.
 *
 * <pre>
 *   GET  /api/errors                 summary + filtered, paged list of error groups   (VIEWER)
 *   GET  /api/errors/{id}            one group: ERP explanation, technical detail, occurrences (VIEWER)
 *   POST /api/errors/{id}/status     triage: OPEN / ACKNOWLEDGED / RESOLVED / IGNORED + note (OPERATOR, audited)
 *   POST /api/errors/sync            pull now, one client or all                        (OPERATOR)
 *   GET  /api/errors/sync-state      per-client pull status                             (VIEWER)
 *   GET  /api/errors/catalog         the error guide: every rule, category and module   (VIEWER)
 * </pre>
 */
@RestController
@RequestMapping("/api/errors")
public class ErrorLogController {

    private static final Set<String> STATUSES = Set.of("OPEN", "ACKNOWLEDGED", "RESOLVED", "IGNORED");
    private static final Set<String> SEVERITIES = Set.of("CRITICAL", "HIGH", "MEDIUM", "LOW");
    private static final String SEVERITY_RANK =
            "CASE g.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END";

    private final JdbcTemplate jdbc;
    private final ErrorSyncService sync;
    private final AuditService audit;
    private final TenantRepository tenants;

    public ErrorLogController(JdbcTemplate jdbc, ErrorSyncService sync, AuditService audit, TenantRepository tenants) {
        this.jdbc = jdbc;
        this.sync = sync;
        this.audit = audit;
        this.tenants = tenants;
    }

    @GetMapping
    @PreAuthorize("hasRole('VIEWER')")
    public Map<String, Object> list(@RequestParam(required = false) Long tenantId,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) String severity,
                                    @RequestParam(required = false) String module,
                                    @RequestParam(required = false) String category,
                                    @RequestParam(required = false) String source,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "168") int sinceHours,
                                    @RequestParam(defaultValue = "false") boolean includeBusinessRules,
                                    @RequestParam(defaultValue = "recent") String sort,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (tenantId != null) {
            where.append(" AND g.tenant_id = ?");
            args.add(tenantId);
        }
        addEnum(where, args, "g.status", status, STATUSES);
        addEnum(where, args, "g.severity", severity, SEVERITIES);
        addEnum(where, args, "g.module", module, enumNames(ErpModule.values()));
        addEnum(where, args, "g.category", category, enumNames(ErrorExplainer.Category.values()));
        addEnum(where, args, "g.source", source, Set.of("SERVER", "CLIENT", "JOB", "LOG"));
        if (!includeBusinessRules && blank(category)) {
            where.append(" AND g.category NOT IN ('BUSINESS_RULE', 'ACCOUNTING_RULE')");
        }
        if (sinceHours > 0) {
            where.append(" AND g.last_seen_at >= now() - make_interval(hours => ?)");
            args.add(Math.min(sinceHours, 24 * 365));
        }
        if (!blank(q)) {
            where.append(" AND (g.title ILIKE ? OR g.message ILIKE ? OR g.root_cause_message ILIKE ? OR g.exception_class ILIKE ?"
                    + " OR g.path_template ILIKE ? OR g.last_request_id = ? OR t.code ILIKE ?)");
            String like = "%" + q.trim().replace("%", "\\%").replace("_", "\\_") + "%";
            for (int i = 0; i < 5; i++) args.add(like);
            args.add(q.trim());
            args.add(like);
        }
        String order = switch (sort == null ? "" : sort) {
            case "frequent" -> " ORDER BY events_24h DESC, g.occurrences DESC, g.last_seen_at DESC";
            case "severity" -> " ORDER BY " + SEVERITY_RANK + ", g.last_seen_at DESC";
            default -> " ORDER BY g.last_seen_at DESC";
        };
        int n = Math.max(1, Math.min(200, size));
        int offset = Math.max(0, page) * n;

        String from = " FROM error_groups g JOIN tenants t ON t.id = g.tenant_id";
        Long total = jdbc.queryForObject("SELECT count(*)" + from + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(n);
        pageArgs.add(offset);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT g.id, g.tenant_id, t.code AS tenant_code, t.name AS tenant_name, g.title, g.rule_code, g.module,
                       g.category, g.severity, g.source, g.status, g.regressed, g.exception_class, g.message,
                       g.root_cause_message, g.http_method, g.path_template, g.http_status, g.occurrences,
                       g.first_seen_at, g.last_seen_at, g.last_username,
                       (SELECT count(*) FROM error_events e WHERE e.group_id = g.id
                          AND e.occurred_at >= now() - interval '24 hours') AS events_24h,
                       (SELECT count(DISTINCT e.username) FROM error_events e WHERE e.group_id = g.id) AS users_affected
                """ + from + where + order + " LIMIT ? OFFSET ?", pageArgs.toArray());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary(tenantId));
        out.put("total", total);
        out.put("page", Math.max(0, page));
        out.put("size", n);
        out.put("groups", rows.stream().map(ErrorLogController::listView).toList());
        return out;
    }

    /** Headline numbers (always the last 24 hours / currently open), optionally for one client. */
    Map<String, Object> summary(Long tenantId) {
        String tf = tenantId != null ? " AND g.tenant_id = " + tenantId.longValue() : "";
        String fault = " AND g.category NOT IN ('BUSINESS_RULE', 'ACCOUNTING_RULE')";
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("openFaults", jdbc.queryForObject("SELECT count(*) FROM error_groups g WHERE g.status = 'OPEN'" + fault + tf, Long.class));
        s.put("openCritical", jdbc.queryForObject("SELECT count(*) FROM error_groups g WHERE g.status = 'OPEN' AND g.severity = 'CRITICAL'" + tf, Long.class));
        s.put("regressed", jdbc.queryForObject("SELECT count(*) FROM error_groups g WHERE g.status = 'OPEN' AND g.regressed" + tf, Long.class));
        s.put("faultEvents24h", jdbc.queryForObject("SELECT count(*) FROM error_events e JOIN error_groups g ON g.id = e.group_id"
                + " WHERE e.occurred_at >= now() - interval '24 hours'" + fault + tf, Long.class));
        s.put("businessRuleEvents24h", jdbc.queryForObject("SELECT count(*) FROM error_events e JOIN error_groups g ON g.id = e.group_id"
                + " WHERE e.occurred_at >= now() - interval '24 hours' AND g.category IN ('BUSINESS_RULE', 'ACCOUNTING_RULE')" + tf, Long.class));
        s.put("clientsAffected24h", jdbc.queryForObject("SELECT count(DISTINCT g.tenant_id) FROM error_groups g"
                + " WHERE g.last_seen_at >= now() - interval '24 hours' AND g.status IN ('OPEN', 'ACKNOWLEDGED')" + fault + tf, Long.class));
        s.put("byModule", counts("g.module", tf, fault));
        s.put("bySeverity", counts("g.severity", tf, fault));
        s.put("byCategory", counts("g.category", tf, ""));
        return s;
    }

    private Map<String, Long> counts(String column, String tf, String extra) {
        Map<String, Long> m = new LinkedHashMap<>();
        jdbc.query("SELECT " + column + " AS k, count(*) AS n FROM error_groups g"
                        + " WHERE g.status IN ('OPEN', 'ACKNOWLEDGED') AND g.last_seen_at >= now() - interval '7 days'"
                        + extra + tf + " GROUP BY " + column + " ORDER BY n DESC",
                rs -> {
                    m.put(rs.getString("k"), rs.getLong("n"));
                });
        return m;
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('VIEWER')")
    public Map<String, Object> get(@PathVariable long id) {
        List<Map<String, Object>> found = jdbc.queryForList("""
                SELECT g.*, t.code AS tenant_code, t.name AS tenant_name
                FROM error_groups g JOIN tenants t ON t.id = g.tenant_id WHERE g.id = ?""", id);
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Error not found");
        Map<String, Object> g = found.get(0);
        ErrorExplainer.Explanation x = ErrorExplainer.explain(ErrorSyncService.facts(g));

        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> group = new LinkedHashMap<>();
        g.forEach((k, v) -> group.put(camel(k), v));
        out.put("group", group);
        out.put("explanation", x.toMap());
        out.put("events", jdbc.queryForList("""
                SELECT id, occurred_at, request_id, username, branch_id, http_method, path, http_status, message, client_url
                FROM error_events WHERE group_id = ? ORDER BY occurred_at DESC LIMIT 100""", id)
                .stream().map(ErrorLogController::camelMap).toList());
        out.put("daily", jdbc.queryForList("""
                SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day, count(*) AS n
                FROM error_events WHERE group_id = ? AND occurred_at >= now() - interval '14 days'
                GROUP BY 1 ORDER BY 1""", id));
        out.put("usersAffected", jdbc.queryForObject(
                "SELECT count(DISTINCT username) FROM error_events WHERE group_id = ?", Long.class, id));
        out.put("branchesAffected", jdbc.queryForObject(
                "SELECT count(DISTINCT branch_id) FROM error_events WHERE group_id = ?", Long.class, id));
        out.put("otherClients", jdbc.queryForList("""
                SELECT g2.id, t2.code AS tenant_code, g2.occurrences, g2.last_seen_at, g2.status
                FROM error_groups g2 JOIN tenants t2 ON t2.id = g2.tenant_id
                WHERE g2.id <> ? AND g2.rule_code = ? AND COALESCE(g2.top_frame, '') = COALESCE(?, '')
                  AND COALESCE(g2.path_template, '') = COALESCE(?, '') AND COALESCE(g2.exception_class, '') = COALESCE(?, '')
                ORDER BY g2.last_seen_at DESC LIMIT 20""",
                id, g.get("rule_code"), g.get("top_frame"), g.get("path_template"), g.get("exception_class"))
                .stream().map(ErrorLogController::camelMap).toList());
        return out;
    }

    public record StatusChange(String status, String note) {}

    @PostMapping("/{id}/status")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> setStatus(@PathVariable long id, @RequestBody StatusChange change, HttpServletRequest request) {
        String status = change.status() == null ? "" : change.status().trim().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be one of " + STATUSES);
        }
        String note = change.note() == null ? null : change.note().trim();
        if (note != null && note.length() > 1000) note = note.substring(0, 1000);
        List<Map<String, Object>> before = jdbc.queryForList("SELECT tenant_id, status, title FROM error_groups WHERE id = ?", id);
        if (before.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Error not found");
        PlatformPrincipal me = CurrentUser.get();
        jdbc.update("""
                UPDATE error_groups SET status = ?, status_note = ?, status_changed_at = now(), status_changed_by = ?,
                    regressed = false WHERE id = ?""", status, note == null || note.isEmpty() ? null : note, me.email(), id);
        Map<String, Object> b = before.get(0);
        Long tenantId = ((Number) b.get("tenant_id")).longValue();
        audit.record(me, "ERROR_STATUS", "ErrorGroup", String.valueOf(id), tenantId,
                b.get("status") + " → " + status + ": " + b.get("title") + (note != null && !note.isEmpty() ? " — " + note : ""),
                ClientIp.of(request));
        return get(id);
    }

    @PostMapping("/sync")
    @PreAuthorize("hasRole('OPERATOR')")
    public List<Map<String, Object>> syncNow(@RequestParam(required = false) Long tenantId) {
        if (tenantId != null) {
            if (tenants.findById(tenantId).isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
            return List.of(sync.sync(tenantId).toMap());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        tenants.findByStatusNot(TenantStatus.ARCHIVED).forEach(t -> {
            try {
                out.add(sync.sync(t.id).toMap());
            } catch (RuntimeException e) {
                out.add(new ErrorSyncService.SyncResult(t.id, "ERROR", 0, 0, e.getMessage()).toMap());
            }
        });
        return out;
    }

    @GetMapping("/sync-state")
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, Object>> syncState() {
        return jdbc.queryForList("""
                SELECT t.id AS tenant_id, t.code AS tenant_code, t.name AS tenant_name, s.last_sync_at, s.last_status,
                       s.last_error, s.tenant_app_version, s.after_event_id
                FROM tenants t LEFT JOIN error_sync_state s ON s.tenant_id = t.id
                WHERE t.status <> 'ARCHIVED' ORDER BY t.name""").stream().map(ErrorLogController::camelMap).toList();
    }

    @GetMapping("/catalog")
    @PreAuthorize("hasRole('VIEWER')")
    public Map<String, Object> catalog() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rules", ErrorExplainer.catalogue());
        out.put("categories", ErrorExplainer.categories());
        out.put("modules", ErrorExplainer.modules());
        return out;
    }

    /** Open high/critical faults seen in the last 24 hours, per client — for the dashboard. */
    public Map<Long, long[]> attentionByTenant() {
        Map<Long, long[]> m = new LinkedHashMap<>();
        jdbc.query("""
                SELECT tenant_id,
                       count(*) FILTER (WHERE severity = 'CRITICAL') AS critical,
                       count(*) FILTER (WHERE severity = 'HIGH') AS high
                FROM error_groups
                WHERE status = 'OPEN' AND severity IN ('CRITICAL', 'HIGH')
                  AND category NOT IN ('BUSINESS_RULE', 'ACCOUNTING_RULE')
                  AND last_seen_at >= now() - interval '24 hours'
                GROUP BY tenant_id""",
                rs -> {
                    m.put(rs.getLong("tenant_id"), new long[] {rs.getLong("critical"), rs.getLong("high")});
                });
        return m;
    }

    // ------------------------------------------------------------------ helpers

    private static Map<String, Object> listView(Map<String, Object> r) {
        Map<String, Object> m = camelMap(r);
        ErpModule mod = parse(ErpModule.class, (String) r.get("module"), ErpModule.GENERAL);
        ErrorExplainer.Category cat = parse(ErrorExplainer.Category.class, (String) r.get("category"),
                ErrorExplainer.Category.APPLICATION_BUG);
        m.put("moduleLabel", mod.label());
        m.put("categoryLabel", cat.label);
        return m;
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String v, E fallback) {
        try {
            return v == null ? fallback : Enum.valueOf(type, v);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    private static void addEnum(StringBuilder where, List<Object> args, String column, String value, Set<String> allowed) {
        if (blank(value)) return;
        List<String> vals = new ArrayList<>();
        for (String v : value.split(",")) {
            String u = v.trim().toUpperCase(Locale.ROOT);
            if (allowed.contains(u)) vals.add(u);
        }
        if (vals.isEmpty()) return;
        where.append(" AND ").append(column).append(" IN (").append(String.join(",", vals.stream().map(x -> "?").toList())).append(')');
        args.addAll(vals);
    }

    private static Set<String> enumNames(Enum<?>[] values) {
        java.util.HashSet<String> s = new java.util.HashSet<>();
        for (Enum<?> e : values) s.add(e.name());
        return s;
    }

    private static Map<String, Object> camelMap(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        row.forEach((k, v) -> m.put(camel(k), v));
        return m;
    }

    static String camel(String snake) {
        StringBuilder sb = new StringBuilder();
        boolean up = false;
        for (char c : snake.toCharArray()) {
            if (c == '_') {
                up = true;
            } else {
                sb.append(up ? Character.toUpperCase(c) : c);
                up = false;
            }
        }
        return sb.toString();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
