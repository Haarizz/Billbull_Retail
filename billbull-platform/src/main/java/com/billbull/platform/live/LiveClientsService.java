package com.billbull.platform.live;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.agent.TenantAgentClient;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.tenant.TenantStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Live Clients: asks every non-archived tenant's agent who is signed in right now
 * ({@code GET /api/platform/presence}) in parallel and folds the answers into one fleet view.
 *
 * <p>Nothing is stored: the page polls, and the whole result is cached for a few seconds so several
 * operators watching at once cost the tenants one call each. The 24-hour activity line comes from
 * the online counts the 5-minute health poll already records.
 */
@Service
public class LiveClientsService {

    static final long BUCKET_SECONDS = 900;

    private final TenantRepository tenants;
    private final TenantAgentClient agent;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final long cacheMs;
    private final ExecutorService pool = Executors.newFixedThreadPool(8, r -> {
        Thread t = new Thread(r, "live-clients");
        t.setDaemon(true);
        return t;
    });

    private volatile Map<String, Object> cached;
    private volatile long cachedAt;

    public LiveClientsService(TenantRepository tenants, TenantAgentClient agent, JdbcTemplate jdbc, ObjectMapper mapper,
                              @Value("${platform.live.cache-ms:10000}") long cacheMs) {
        this.tenants = tenants;
        this.agent = agent;
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.cacheMs = Math.max(1000, cacheMs);
    }

    /** The fleet view; {@code fresh} skips the cache unless it is under three seconds old. */
    public synchronized Map<String, Object> live(boolean fresh) {
        long now = System.currentTimeMillis();
        long age = now - cachedAt;
        if (cached != null && (age < 3000 || (!fresh && age < cacheMs))) return cached;
        cached = build();
        cachedAt = System.currentTimeMillis();
        return cached;
    }

    private Map<String, Object> build() {
        List<Tenant> list = tenants.findAllByOrderByNameAsc().stream()
                .filter(t -> t.status != TenantStatus.ARCHIVED).toList();
        Map<Long, List<Map<String, Object>>> history = history();

        List<Future<Map<String, Object>>> futures = new ArrayList<>();
        for (Tenant t : list) {
            futures.add(pool.submit(() -> {
                if (!agent.configured(t)) return summarize(t, null, mapper);
                return summarize(t, agent.get(t, "/api/platform/presence", "platform-live"), mapper);
            }));
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < list.size(); i++) {
            Map<String, Object> row;
            try {
                row = futures.get(i).get(15, TimeUnit.SECONDS);
            } catch (Exception e) {
                futures.get(i).cancel(true);
                row = summarize(list.get(i), new AgentResponse(0, null, 15000, "timed out"), mapper);
            }
            row.put("history", history.getOrDefault(list.get(i).id, List.of()));
            rows.add(row);
        }
        rows.sort(Comparator.comparing((Map<String, Object> r) -> -((Number) r.get("devicesOnline")).intValue())
                .thenComparing(r -> String.valueOf(r.get("name")).toLowerCase()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", Instant.now().toString());
        out.put("totals", totals(rows));
        out.put("history", fleetHistory(history));
        out.put("clients", rows);
        return out;
    }

    /**
     * One client's row from its agent's answer. {@code r == null} means the agent isn't set up.
     * A 404 from a tenant whose health check works means its build predates presence.
     */
    static Map<String, Object> summarize(Tenant t, AgentResponse r, ObjectMapper mapper) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("tenantId", t.id);
        row.put("code", t.code);
        row.put("name", t.name);
        row.put("status", t.status.name());
        row.put("lastHealthStatus", t.lastHealthStatus);
        row.put("latencyMs", r == null ? null : r.latencyMs());
        List<Map<String, Object>> devices = new ArrayList<>();
        List<Object> sessions = new ArrayList<>();
        Map<String, Integer> apps = new TreeMap<>();
        int devicesOnline = 0;
        java.util.Set<String> peopleOnline = new java.util.HashSet<>();
        String lastActivity = null;
        Long activeToday = null;
        Object pos = null;
        Object sales = null;

        String connection;
        String error = null;
        if (r == null) {
            connection = "NOT_CONFIGURED";
            error = "Agent URL or secret not set";
        } else if (r.unreachable()) {
            connection = "UNREACHABLE";
            error = r.error();
        } else if (r.status() == 404) {
            boolean healthy = "UP".equals(t.lastHealthStatus) || "DEGRADED".equals(t.lastHealthStatus);
            connection = healthy ? "OUTDATED" : "AGENT_OFF";
            error = healthy ? "This client's build doesn't report live presence yet; deploy the current build."
                    : "The client's platform agent is disabled (404)";
        } else if (r.status() == 401 || r.status() == 503) {
            connection = "AUTH_FAILED";
            error = r.describe();
        } else if (!r.ok() || r.body() == null) {
            connection = "ERROR";
            error = r.describe();
        } else {
            JsonNode b = r.body();
            for (JsonNode d : b.path("devices")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> m = mapper.convertValue(d, LinkedHashMap.class);
                devices.add(m);
                String seen = d.path("lastSeenAt").asText(null);
                if (seen != null && (lastActivity == null || seen.compareTo(lastActivity) > 0)) lastActivity = seen;
                if (d.path("online").asBoolean(false)) {
                    devicesOnline++;
                    peopleOnline.add(d.hasNonNull("userId") ? d.get("userId").asText() : d.path("username").asText());
                    apps.merge(d.path("app").asText("OTHER"), 1, Integer::sum);
                }
            }
            if (b.hasNonNull("activeUsersToday")) activeToday = b.get("activeUsersToday").asLong();
            if (b.path("openPosSessions").isArray()) sessions.addAll(mapper.convertValue(b.get("openPosSessions"), List.class));
            if (b.has("pos")) pos = mapper.convertValue(b.get("pos"), Map.class);
            if (b.has("sales")) sales = mapper.convertValue(b.get("sales"), Map.class);
            JsonNode errors = b.path("errors");
            if (errors.isObject() && errors.size() > 0) error = "Partial answer: " + errors;
            connection = devicesOnline > 0 ? "ONLINE" : "OFFLINE";
        }
        row.put("connection", connection);
        row.put("error", error);
        row.put("devicesOnline", devicesOnline);
        row.put("peopleOnline", peopleOnline.size());
        row.put("appsOnline", apps);
        row.put("activeToday", activeToday);
        row.put("lastActivityAt", lastActivity);
        row.put("pos", pos);
        row.put("sales", sales);
        row.put("openPosSessions", sessions);
        row.put("devices", devices);
        return row;
    }

    static Map<String, Object> totals(List<Map<String, Object>> rows) {
        int online = 0;
        int devices = 0;
        int people = 0;
        long activeToday = 0;
        long terminalsOnline = 0;
        long terminalsTotal = 0;
        long invoicesToday = 0;
        int openSessions = 0;
        int reporting = 0;
        Map<String, Integer> apps = new TreeMap<>();
        for (Map<String, Object> r : rows) {
            String c = (String) r.get("connection");
            if ("ONLINE".equals(c)) online++;
            if ("ONLINE".equals(c) || "OFFLINE".equals(c)) reporting++;
            devices += ((Number) r.get("devicesOnline")).intValue();
            people += ((Number) r.get("peopleOnline")).intValue();
            if (r.get("activeToday") instanceof Number n) activeToday += n.longValue();
            if (r.get("pos") instanceof Map<?, ?> p) {
                terminalsOnline += longOf(p.get("terminalsOnline"));
                terminalsTotal += longOf(p.get("terminalsTotal"));
            }
            if (r.get("sales") instanceof Map<?, ?> s) invoicesToday += longOf(s.get("invoicesToday"));
            openSessions += ((List<?>) r.get("openPosSessions")).size();
            @SuppressWarnings("unchecked")
            Map<String, Integer> a = (Map<String, Integer>) r.get("appsOnline");
            a.forEach((k, v) -> apps.merge(k, v, Integer::sum));
        }
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("clients", rows.size());
        t.put("clientsReporting", reporting);
        t.put("clientsOnline", online);
        t.put("devicesOnline", devices);
        t.put("peopleOnline", people);
        t.put("appsOnline", apps);
        t.put("activeToday", activeToday);
        t.put("terminalsOnline", terminalsOnline);
        t.put("terminalsTotal", terminalsTotal);
        t.put("openPosSessions", openSessions);
        t.put("invoicesToday", invoicesToday);
        return t;
    }

    /** Per tenant, the most devices seen online in each 15-minute bucket of the last 24 hours. */
    private Map<Long, List<Map<String, Object>>> history() {
        Map<Long, List<Map<String, Object>>> out = new HashMap<>();
        try {
            jdbc.query("""
                    SELECT tenant_id,
                           to_timestamp(floor(extract(epoch FROM checked_at) / ?) * ?) AS bucket,
                           max(online_devices) AS devices, max(online_users) AS users
                    FROM health_snapshots
                    WHERE checked_at >= now() - interval '24 hours' AND online_devices IS NOT NULL
                    GROUP BY tenant_id, bucket
                    ORDER BY bucket
                    """, rs -> {
                Map<String, Object> p = new LinkedHashMap<>();
                Timestamp ts = rs.getTimestamp("bucket");
                p.put("at", ts.toInstant().toString());
                p.put("devices", rs.getLong("devices"));
                p.put("users", rs.getLong("users"));
                out.computeIfAbsent(rs.getLong("tenant_id"), k -> new ArrayList<>()).add(p);
            }, BUCKET_SECONDS, BUCKET_SECONDS);
        } catch (RuntimeException e) {
            // History is decoration; the live figures still render without it.
        }
        return out;
    }

    static List<Map<String, Object>> fleetHistory(Map<Long, List<Map<String, Object>>> perTenant) {
        Map<String, long[]> sum = new TreeMap<>();
        perTenant.values().forEach(points -> points.forEach(p -> {
            long[] v = sum.computeIfAbsent((String) p.get("at"), k -> new long[2]);
            v[0] += longOf(p.get("devices"));
            v[1] += longOf(p.get("users"));
        }));
        List<Map<String, Object>> out = new ArrayList<>();
        sum.forEach((at, v) -> {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("at", at);
            p.put("devices", v[0]);
            p.put("users", v[1]);
            out.add(p);
        });
        return out;
    }

    private static long longOf(Object o) {
        return o instanceof Number n ? n.longValue() : 0;
    }
}
