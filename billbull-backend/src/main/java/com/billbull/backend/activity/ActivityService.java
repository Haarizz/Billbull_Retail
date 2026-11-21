package com.billbull.backend.activity;

import com.billbull.backend.notification.DisplayNameResolver;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.BranchScope;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * The user activity feed: what people did in the system, read from {@code audit_logs}.
 *
 * <p>Every mutating API call is already audited as an {@code API_MUTATION} row
 * (RequestLoggingFilter) and modules add {@code BUSINESS} rows for domain events (a return
 * approved, a voucher redeemed). This service reads the mutations, drops machine traffic
 * ({@link ActivityTranslator#NOISE_PATTERNS}), attaches the business events raised by the same
 * request, and turns each row into a sentence via {@link ActivityTranslator}.</p>
 *
 * <p>Visibility: ADMIN / SUPER_ADMIN see everyone (narrowed to the active branch when one is
 * selected); BRANCH_ADMIN sees their branches plus their own actions; everyone else sees only
 * their own actions.</p>
 */
@Service
@Transactional(readOnly = true)
public class ActivityService {

    public enum Scope { ALL, BRANCH, SELF }

    public record ActivityFilter(String username, String module, String outcome,
                                 LocalDate from, LocalDate to, Long branchId, String q) {}

    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_SUMMARY_DAYS = 31;
    private static final Set<String> ANONYMOUS = Set.of("system", "anonymous", "anonymoususer");
    private static final List<String> LOGIN_ENDPOINTS =
            List.of("/api/auth/login", "/api/auth/pos/login", "/api/auth/pos/pin/login");

    private final EntityManager em;
    private final DisplayNameResolver names;

    public ActivityService(EntityManager em, DisplayNameResolver names) {
        this.em = em;
        this.names = names;
    }

    // ── Feed ──────────────────────────────────────────────────────────────────

    public Map<String, Object> getFeed(int page, int size, ActivityFilter filter) {
        int pageSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int pageNumber = Math.max(page, 0);
        Viewer viewer = currentViewer();
        Where where = buildWhere(viewer, filter, null);

        // One extra row tells us whether there is a next page without a COUNT over audit_logs,
        // which is the largest table on a busy tenant.
        Query query = em.createNativeQuery(
                "SELECT a.id, a.username, a.endpoint, a.http_method, a.http_status, a.access_time, a.branch_id, "
                        + "a.request_id, a.ip_address, a.user_agent, a.duration_ms, a.client_host "
                        + "FROM audit_logs a WHERE " + where.sql
                        + " ORDER BY a.access_time DESC, a.id DESC LIMIT :lim OFFSET :off");
        where.bind(query);
        query.setParameter("lim", pageSize + 1);
        query.setParameter("off", (long) pageNumber * pageSize);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        boolean hasMore = rows.size() > pageSize;
        if (hasMore) rows = rows.subList(0, pageSize);

        Map<String, List<Map<String, Object>>> eventsByRequest = businessEvents(
                rows.stream().map(r -> (String) r[7]).filter(id -> id != null && !id.isBlank()).toList());
        Map<String, String> fullNames = names.fullNames(rows.stream().map(r -> (String) r[1]).toList());
        Map<Long, String> branchNames = names.branchNames(rows.stream().map(r -> toLong(r[6])).toList());

        List<Map<String, Object>> content = new ArrayList<>();
        for (Object[] r : rows) {
            content.add(toEntry(r, eventsByRequest, fullNames, branchNames));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", content);
        out.put("page", pageNumber);
        out.put("size", pageSize);
        out.put("hasMore", hasMore);
        out.put("scope", viewer.scope.name());
        return out;
    }

    private Map<String, Object> toEntry(Object[] r,
                                        Map<String, List<Map<String, Object>>> eventsByRequest,
                                        Map<String, String> fullNames,
                                        Map<Long, String> branchNames) {
        String username = (String) r[1];
        String endpoint = (String) r[2];
        String method = (String) r[3];
        Integer status = r[4] != null ? ((Number) r[4]).intValue() : null;
        LocalDateTime at = toDateTime(r[5]);
        Long branchId = toLong(r[6]);
        String requestId = (String) r[7];
        boolean failed = status != null && status >= 400;
        boolean anonymous = username == null || ANONYMOUS.contains(username.toLowerCase(Locale.ROOT));

        ActivityTranslator.Reading reading = ActivityTranslator.translate(method, endpoint);
        String summary = reading.summary();
        String actorName;
        if (anonymous) {
            if (LOGIN_ENDPOINTS.contains(endpoint)) {
                summary = "Failed sign-in attempt";
                actorName = "Unknown user";
            } else if (endpoint != null && endpoint.startsWith("/api/vendor-portal/")) {
                actorName = "Vendor (portal)";
            } else {
                actorName = "Unknown user";
            }
        } else {
            actorName = fullNames.getOrDefault(username, username);
        }

        Map<String, Object> e = new LinkedHashMap<>();
        e.put("id", toLong(r[0]));
        e.put("time", at);
        e.put("username", anonymous ? null : username);
        e.put("actorName", actorName);
        e.put("module", reading.module());
        e.put("action", reading.action());
        e.put("summary", summary);
        e.put("reference", reading.reference());
        e.put("link", failed ? null : reading.link());
        e.put("outcome", failed ? "FAILED" : "SUCCESS");
        e.put("status", status);
        e.put("method", method);
        e.put("endpoint", endpoint);
        e.put("durationMs", toLong(r[10]));
        e.put("branchId", branchId);
        e.put("branchName", branchId != null ? branchNames.get(branchId) : null);
        e.put("ipAddress", r[8]);
        e.put("device", ActivityTranslator.deviceOf((String) r[9]));
        e.put("host", r[11]);
        e.put("requestId", requestId);
        e.put("events", requestId != null ? eventsByRequest.getOrDefault(requestId, List.of()) : List.of());
        return e;
    }

    /** BUSINESS rows raised inside the given requests, grouped by request id. */
    private Map<String, List<Map<String, Object>>> businessEvents(Collection<String> requestIds) {
        Map<String, List<Map<String, Object>>> out = new HashMap<>();
        if (requestIds.isEmpty()) return out;
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                        "SELECT a.request_id, a.entity_type, a.http_method, a.entity_id, a.details "
                                + "FROM audit_logs a WHERE a.event_type = 'BUSINESS' AND a.request_id IN (:ids) "
                                + "ORDER BY a.access_time, a.id")
                .setParameter("ids", new HashSet<>(requestIds))
                .getResultList();
        for (Object[] r : rows) {
            Map<String, Object> ev = new LinkedHashMap<>();
            ev.put("entityType", r[1]);
            ev.put("action", r[2]);
            ev.put("entityId", r[3]);
            ev.put("title", ActivityTranslator.describeBusinessEvent((String) r[1], (String) r[2], (String) r[3]));
            ev.put("detail", r[4]);
            out.computeIfAbsent((String) r[0], k -> new ArrayList<>()).add(ev);
        }
        return out;
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    /**
     * Totals for the activity header over the last {@code days} days (1 = today): actions,
     * failures, active people, the busiest people, actions per module and a timeline
     * (hourly for today, daily otherwise).
     */
    public Map<String, Object> getSummary(int days, ActivityFilter filter) {
        int window = Math.min(Math.max(days, 1), MAX_SUMMARY_DAYS);
        LocalDateTime since = LocalDate.now().minusDays(window - 1L).atStartOfDay();
        Viewer viewer = currentViewer();
        Where where = buildWhere(viewer, filter, since);

        Query grouped = em.createNativeQuery(
                "SELECT a.endpoint, a.username, (COALESCE(a.http_status, 200) >= 400) AS failed, COUNT(*) "
                        + "FROM audit_logs a WHERE " + where.sql + " GROUP BY 1, 2, 3");
        where.bind(grouped);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = grouped.getResultList();

        long total = 0, failed = 0;
        Map<String, Long> byModule = new TreeMap<>();
        Map<String, Long> byUser = new HashMap<>();
        for (Object[] r : rows) {
            long n = ((Number) r[3]).longValue();
            total += n;
            if (Boolean.TRUE.equals(r[2])) failed += n;
            byModule.merge(ActivityTranslator.moduleOf((String) r[0]), n, Long::sum);
            String u = (String) r[1];
            if (u != null && !ANONYMOUS.contains(u.toLowerCase(Locale.ROOT))) byUser.merge(u, n, Long::sum);
        }

        String unit = window == 1 ? "hour" : "day"; // whitelisted literal, never user input
        Query timelineQuery = em.createNativeQuery(
                "SELECT date_trunc('" + unit + "', a.access_time) AS bucket, COUNT(*) "
                        + "FROM audit_logs a WHERE " + where.sql + " GROUP BY 1 ORDER BY 1");
        where.bind(timelineQuery);
        @SuppressWarnings("unchecked")
        List<Object[]> buckets = timelineQuery.getResultList();
        Map<LocalDateTime, Long> counts = new HashMap<>();
        for (Object[] b : buckets) counts.put(toDateTime(b[0]), ((Number) b[1]).longValue());

        List<Map<String, Object>> timeline = new ArrayList<>();
        LocalDateTime end = window == 1 ? LocalDateTime.now().truncatedTo(ChronoUnit.HOURS) : LocalDate.now().atStartOfDay();
        for (LocalDateTime t = since; !t.isAfter(end); t = window == 1 ? t.plusHours(1) : t.plusDays(1)) {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("bucket", t);
            point.put("count", counts.getOrDefault(t, 0L));
            timeline.add(point);
        }

        List<Map.Entry<String, Long>> top = byUser.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue(Comparator.reverseOrder()))
                .limit(5)
                .toList();
        Map<String, String> fullNames = names.fullNames(top.stream().map(Map.Entry::getKey).toList());
        List<Map<String, Object>> topUsers = new ArrayList<>();
        for (var t : top) {
            Map<String, Object> u = new LinkedHashMap<>();
            u.put("username", t.getKey());
            u.put("name", fullNames.getOrDefault(t.getKey(), t.getKey()));
            u.put("count", t.getValue());
            topUsers.add(u);
        }

        List<Map<String, Object>> modules = new ArrayList<>();
        byModule.forEach((m, n) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("module", m);
            row.put("count", n);
            modules.add(row);
        });
        modules.sort(Comparator.comparing((Map<String, Object> row) -> (Long) row.get("count")).reversed());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", window);
        out.put("since", since);
        out.put("total", total);
        out.put("failed", failed);
        out.put("activeUsers", byUser.size());
        out.put("topUsers", topUsers);
        out.put("modules", modules);
        out.put("timeline", timeline);
        out.put("timelineUnit", unit);
        out.put("scope", viewer.scope.name());
        return out;
    }

    /** The people this viewer may filter by (everyone they can see activity for). */
    public List<Map<String, Object>> getPeople() {
        Viewer viewer = currentViewer();
        if (viewer.scope == Scope.SELF) {
            Map<String, Object> me = new LinkedHashMap<>();
            me.put("username", viewer.username);
            me.put("name", names.fullNames(List.of(viewer.username)).getOrDefault(viewer.username, viewer.username));
            return List.of(me);
        }
        Where where = buildWhere(viewer, null, LocalDate.now().minusDays(90).atStartOfDay());
        Query q = em.createNativeQuery("SELECT DISTINCT a.username FROM audit_logs a WHERE " + where.sql);
        where.bind(q);
        @SuppressWarnings("unchecked")
        List<String> usernames = ((List<Object>) q.getResultList()).stream()
                .map(String::valueOf)
                .filter(u -> !ANONYMOUS.contains(u.toLowerCase(Locale.ROOT)))
                .sorted()
                .toList();
        Map<String, String> fullNames = names.fullNames(usernames);
        List<Map<String, Object>> out = new ArrayList<>();
        for (String u : usernames) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("username", u);
            p.put("name", fullNames.getOrDefault(u, u));
            out.add(p);
        }
        out.sort(Comparator.comparing(p -> String.valueOf(p.get("name")).toLowerCase(Locale.ROOT)));
        return out;
    }

    // ── WHERE builder (single source for feed, summary and people) ────────────

    static final class Where {
        final StringBuilder sql = new StringBuilder();
        final Map<String, Object> params = new LinkedHashMap<>();
        private int n = 0;

        String param(Object value) {
            String name = "p" + (n++);
            params.put(name, value);
            return ":" + name;
        }

        Where and(String clause) {
            if (!sql.isEmpty()) sql.append(" AND ");
            sql.append(clause);
            return this;
        }

        void bind(Query q) {
            params.forEach(q::setParameter);
        }
    }

    static Where buildWhere(Viewer viewer, ActivityFilter f, LocalDateTime since) {
        Where w = new Where();
        w.and("a.event_type = 'API_MUTATION'");
        for (String pattern : ActivityTranslator.NOISE_PATTERNS) {
            w.and("a.endpoint NOT LIKE " + w.param(pattern));
        }
        // Unauthenticated rows carry no person. Keep only what still means something:
        // failed sign-in attempts and vendors acting through the portal.
        w.and("(LOWER(a.username) NOT IN ('system', 'anonymous', 'anonymoususer')"
                + " OR (a.endpoint IN (" + w.param(LOGIN_ENDPOINTS) + ") AND COALESCE(a.http_status, 200) >= 400)"
                + " OR a.endpoint LIKE '/api/vendor-portal/%')");

        // Visibility
        switch (viewer.scope) {
            case SELF -> w.and("a.username = " + w.param(viewer.username));
            case BRANCH -> w.and("(a.branch_id IN (" + w.param(viewer.allowedBranchIds)
                    + ") OR a.username = " + w.param(viewer.username) + ")");
            case ALL -> {
                if (viewer.activeBranchId != null && (f == null || f.branchId() == null)) {
                    w.and("(a.branch_id = " + w.param(viewer.activeBranchId) + " OR a.branch_id IS NULL)");
                }
            }
        }

        if (since != null) w.and("a.access_time >= " + w.param(since));
        if (f == null) return w;

        if (notBlank(f.username()) && viewer.scope != Scope.SELF) {
            w.and("a.username = " + w.param(f.username().trim()));
        }
        if (f.branchId() != null) {
            if (viewer.scope == Scope.BRANCH && !viewer.allowedBranchIds.contains(f.branchId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This branch is not accessible.");
            }
            w.and("a.branch_id = " + w.param(f.branchId()));
        }
        if (notBlank(f.module())) {
            String module = f.module().trim().toUpperCase(Locale.ROOT);
            List<String> prefixes = ActivityTranslator.MODULE_PREFIXES.get(module);
            if (prefixes != null) {
                List<String> ors = new ArrayList<>();
                for (String p : prefixes) {
                    ors.add("a.endpoint = " + w.param(p));
                    ors.add("a.endpoint LIKE " + w.param(p + "/%"));
                }
                // Segment-exact like moduleOf(): "/api/purchase/%" never matches "/api/purchase-invoices".
                w.and("(" + String.join(" OR ", ors) + ")");
            } else if (module.equals("OTHER")) {
                List<String> nots = new ArrayList<>();
                for (List<String> prefixes2 : ActivityTranslator.MODULE_PREFIXES.values()) {
                    for (String p : prefixes2) {
                        nots.add("a.endpoint <> " + w.param(p));
                        nots.add("a.endpoint NOT LIKE " + w.param(p + "/%"));
                    }
                }
                w.and("(" + String.join(" AND ", nots) + ")");
            }
        }
        if ("FAILED".equalsIgnoreCase(f.outcome())) w.and("COALESCE(a.http_status, 200) >= 400");
        if ("SUCCESS".equalsIgnoreCase(f.outcome())) w.and("COALESCE(a.http_status, 200) < 400");
        if (f.from() != null) w.and("a.access_time >= " + w.param(f.from().atStartOfDay()));
        if (f.to() != null) w.and("a.access_time < " + w.param(f.to().plusDays(1).atStartOfDay()));
        if (notBlank(f.q())) {
            String like = "%" + f.q().trim().toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                    .replace("%", "\\%").replace("_", "\\_") + "%";
            w.and("(LOWER(a.username) LIKE " + w.param(like) + " OR LOWER(a.endpoint) LIKE " + w.param(like) + ")");
        }
        return w;
    }

    // ── Viewer ────────────────────────────────────────────────────────────────

    record Viewer(String username, Scope scope, Set<Long> allowedBranchIds, Long activeBranchId) {}

    static Viewer currentViewer() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth != null ? auth.getName() : "anonymous";
        Set<String> roles = new HashSet<>();
        if (auth != null) for (GrantedAuthority a : auth.getAuthorities()) roles.add(a.getAuthority());

        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        Set<Long> allowed = ctx != null ? ctx.allowedBranchIds() : Set.of();

        if (roles.contains("ROLE_ADMIN") || roles.contains("ROLE_SUPER_ADMIN")) {
            return new Viewer(username, Scope.ALL, allowed, BranchScope.currentBranchId());
        }
        if (roles.contains("ROLE_BRANCH_ADMIN") && !allowed.isEmpty()) {
            return new Viewer(username, Scope.BRANCH, allowed, BranchScope.currentBranchId());
        }
        return new Viewer(username, Scope.SELF, allowed, BranchScope.currentBranchId());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static Long toLong(Object o) {
        return o instanceof Number n ? n.longValue() : null;
    }

    private static LocalDateTime toDateTime(Object o) {
        if (o instanceof LocalDateTime t) return t;
        if (o instanceof Timestamp t) return t.toLocalDateTime();
        if (o instanceof java.time.OffsetDateTime t) return t.toLocalDateTime();
        if (o instanceof java.time.Instant t) return LocalDateTime.ofInstant(t, java.time.ZoneId.systemDefault());
        return null;
    }
}
