package com.billbull.platform.errors;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.agent.TenantAgentClient;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.tenant.TenantStatus;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Pulls each tenant's error log through its platform agent ({@code GET /api/platform/errors}),
 * stores it in {@code error_groups} / {@code error_events} and classifies every group with
 * {@link ErrorExplainer}.
 *
 * <p>Cursors (last group change and last event id) are kept per tenant in
 * {@code error_sync_state}; every write is an upsert, so re-reading a page is harmless. When a
 * tenant reports maximum cursors below ours — its database was restored — the cursors restart
 * from zero. A group marked RESOLVED that occurs again is reopened and flagged as a regression.
 */
@Service
public class ErrorSyncService {

    private static final Logger log = LoggerFactory.getLogger(ErrorSyncService.class);
    static final int PAGE_SIZE = 200;

    private final JdbcTemplate jdbc;
    private final TenantRepository tenants;
    private final TenantAgentClient agent;
    private final TransactionTemplate tx;
    private final int maxPagesPerSync;
    private final int eventRetentionDays;
    private final int groupRetentionDays;
    private final ExecutorService pool = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "error-sync");
        t.setDaemon(true);
        return t;
    });

    public ErrorSyncService(JdbcTemplate jdbc, TenantRepository tenants, TenantAgentClient agent, TransactionTemplate tx,
                            @Value("${platform.errors.max-pages-per-sync:10}") int maxPagesPerSync,
                            @Value("${platform.errors.event-retention-days:30}") int eventRetentionDays,
                            @Value("${platform.errors.group-retention-days:180}") int groupRetentionDays) {
        this.jdbc = jdbc;
        this.tenants = tenants;
        this.agent = agent;
        this.tx = tx;
        this.maxPagesPerSync = Math.max(1, maxPagesPerSync);
        this.eventRetentionDays = Math.max(1, eventRetentionDays);
        this.groupRetentionDays = Math.max(this.eventRetentionDays, groupRetentionDays);
    }

    /** Outcome of one tenant's pull. */
    public record SyncResult(long tenantId, String status, int groups, int events, String error) {
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tenantId", tenantId);
            m.put("status", status);
            m.put("groups", groups);
            m.put("events", events);
            m.put("error", error);
            return m;
        }
    }

    @Scheduled(fixedDelayString = "${platform.errors.poll-interval-ms:300000}", initialDelay = 45_000)
    public void syncAll() {
        List<Tenant> list = tenants.findByStatusNot(TenantStatus.ARCHIVED);
        List<Future<?>> futures = list.stream().<Future<?>>map(t -> pool.submit(() -> {
            try {
                sync(t.id);
            } catch (RuntimeException e) {
                log.warn("Error-log sync for {} failed: {}", t.code, e.getMessage());
            }
        })).toList();
        for (Future<?> f : futures) {
            try {
                f.get(120, TimeUnit.SECONDS);
            } catch (Exception e) {
                f.cancel(true);
            }
        }
    }

    public SyncResult sync(long tenantId) {
        Tenant t = tenants.findById(tenantId).orElseThrow();
        jdbc.update("INSERT INTO error_sync_state (tenant_id) VALUES (?) ON CONFLICT (tenant_id) DO NOTHING", tenantId);
        if (!agent.configured(t)) return finish(tenantId, "NOT_CONFIGURED", 0, 0, "Agent URL or secret not set", null);

        Map<String, Object> cur = jdbc.queryForMap(
                "SELECT after_group_seq, after_event_id FROM error_sync_state WHERE tenant_id = ?", tenantId);
        long groupSeq = ((Number) cur.get("after_group_seq")).longValue();
        long eventId = ((Number) cur.get("after_event_id")).longValue();
        int groups = 0;
        int events = 0;
        String version = null;
        boolean restarted = false;

        for (int page = 0; page < maxPagesPerSync; page++) {
            AgentResponse r = agent.get(t, "/api/platform/errors?afterGroupSeq=" + groupSeq + "&afterEventId=" + eventId
                    + "&limit=" + PAGE_SIZE, "platform-errors");
            if (!r.ok() || r.body() == null) {
                String status = r.unreachable() ? "UNREACHABLE"
                        : (r.status() == 401 || r.status() == 503) ? "AUTH_FAILED"
                        : r.status() == 404 ? "NOT_SUPPORTED" : "ERROR";
                String msg = r.status() == 404
                        ? "404 — the agent is disabled, or this client runs a build without error logs (needs V155)"
                        : r.describe();
                return finish(tenantId, status, groups, events, msg, version);
            }
            JsonNode b = r.body();
            version = text(b, "appVersion");
            long maxGroupSeq = b.path("maxGroupSeq").asLong(Long.MAX_VALUE);
            long maxEventId = b.path("maxEventId").asLong(Long.MAX_VALUE);
            if (!restarted && (maxGroupSeq < groupSeq || maxEventId < eventId)) {
                // The tenant's database went back in time (restore): read everything again.
                log.info("Error-log cursors for {} are ahead of the tenant (restored database?); restarting", t.code);
                restarted = true;
                groupSeq = 0;
                eventId = 0;
                saveCursors(tenantId, 0, 0);
                page--;
                continue;
            }
            int[] n = ingest(tenantId, b);
            groups += n[0];
            events += n[1];
            groupSeq = b.path("nextGroupSeq").asLong(groupSeq);
            eventId = b.path("nextEventId").asLong(eventId);
            saveCursors(tenantId, groupSeq, eventId);
            if (!b.path("more").asBoolean(false)) break;
        }
        return finish(tenantId, "OK", groups, events, null, version);
    }

    /** Upserts one page's groups, then its events. Returns {groups, events} written. */
    int[] ingest(long tenantId, JsonNode body) {
        return tx.execute(s -> {
            Map<Long, Long> localByRemote = new HashMap<>();
            int g = 0;
            for (JsonNode n : body.path("groups")) {
                Long id = upsertGroup(tenantId, n);
                if (id != null) {
                    localByRemote.put(n.path("id").asLong(), id);
                    g++;
                }
            }
            int e = 0;
            for (JsonNode n : body.path("events")) {
                long remoteGroup = n.path("group_id").asLong();
                Long local = localByRemote.get(remoteGroup);
                if (local == null) {
                    List<Long> found = jdbc.queryForList(
                            "SELECT id FROM error_groups WHERE tenant_id = ? AND remote_id = ?", Long.class, tenantId, remoteGroup);
                    if (found.isEmpty()) continue;
                    local = found.get(0);
                }
                e += jdbc.update("""
                        INSERT INTO error_events (group_id, tenant_id, remote_id, occurred_at, request_id, username,
                            branch_id, http_method, path, http_status, message, client_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (tenant_id, remote_id) DO NOTHING
                        """, local, tenantId, n.path("id").asLong(), ts(n, "occurred_at"), clip(text(n, "request_id"), 120),
                        clip(text(n, "username"), 100), longOrNull(n, "branch_id"), clip(text(n, "http_method"), 10),
                        clip(text(n, "path"), 300), intOrNull(n, "http_status"), clip(text(n, "message"), 2000),
                        clip(text(n, "client_url"), 300));
            }
            return new int[] {g, e};
        });
    }

    private Long upsertGroup(long tenantId, JsonNode n) {
        String fingerprint = text(n, "fingerprint");
        if (fingerprint == null) return null;
        ErrorFacts facts = facts(n);
        ErrorExplainer.Explanation x = ErrorExplainer.explain(facts);
        Timestamp lastSeen = ts(n, "last_seen_at");
        return jdbc.queryForObject("""
                INSERT INTO error_groups (tenant_id, remote_id, fingerprint, source, exception_class, root_cause_class,
                    cause_chain, message, root_cause_message, error_code, sql_state, http_method, path_template,
                    http_status, logger, top_frame, stack_trace, app_version, first_seen_at, last_seen_at, occurrences,
                    last_request_id, last_username, last_branch_id, module, category, severity, rule_code, title, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
                ON CONFLICT (tenant_id, fingerprint) DO UPDATE SET
                    remote_id = EXCLUDED.remote_id,
                    message = EXCLUDED.message,
                    root_cause_message = EXCLUDED.root_cause_message,
                    http_status = EXCLUDED.http_status,
                    top_frame = EXCLUDED.top_frame,
                    stack_trace = EXCLUDED.stack_trace,
                    app_version = EXCLUDED.app_version,
                    first_seen_at = LEAST(error_groups.first_seen_at, EXCLUDED.first_seen_at),
                    last_seen_at = GREATEST(error_groups.last_seen_at, EXCLUDED.last_seen_at),
                    occurrences = EXCLUDED.occurrences,
                    last_request_id = EXCLUDED.last_request_id,
                    last_username = EXCLUDED.last_username,
                    last_branch_id = EXCLUDED.last_branch_id,
                    module = EXCLUDED.module,
                    category = EXCLUDED.category,
                    severity = EXCLUDED.severity,
                    rule_code = EXCLUDED.rule_code,
                    title = EXCLUDED.title,
                    regressed = CASE WHEN error_groups.status = 'RESOLVED'
                                      AND EXCLUDED.last_seen_at > COALESCE(error_groups.status_changed_at, '-infinity')
                                     THEN true ELSE error_groups.regressed END,
                    status = CASE WHEN error_groups.status = 'RESOLVED'
                                   AND EXCLUDED.last_seen_at > COALESCE(error_groups.status_changed_at, '-infinity')
                                  THEN 'OPEN' ELSE error_groups.status END,
                    synced_at = now()
                RETURNING id
                """, Long.class,
                tenantId, n.path("id").asLong(), fingerprint, facts.source().name(), facts.exceptionClass(),
                facts.rootCauseClass(), clip(facts.causeChain(), 600), clip(facts.message(), 2000),
                clip(facts.rootCauseMessage(), 2000), clip(facts.errorCode(), 80), clip(facts.sqlState(), 10),
                clip(facts.httpMethod(), 10), clip(facts.pathTemplate(), 300), facts.httpStatus(), clip(facts.logger(), 200),
                clip(facts.topFrame(), 400), facts.stackTrace(), clip(text(n, "app_version"), 60), ts(n, "first_seen_at"),
                lastSeen, n.path("occurrences").asLong(1), clip(text(n, "last_request_id"), 120),
                clip(text(n, "last_username"), 100), longOrNull(n, "last_branch_id"), x.module().name(),
                x.category().name(), x.severity().name(), x.ruleCode(), clip(x.title(), 200));
    }

    static ErrorFacts facts(JsonNode n) {
        return new ErrorFacts(ErrorFacts.source(text(n, "source")), clip(text(n, "exception_class"), 200),
                clip(text(n, "root_cause_class"), 200), text(n, "cause_chain"), text(n, "message"),
                text(n, "root_cause_message"), text(n, "error_code"), text(n, "sql_state"), text(n, "http_method"),
                text(n, "path_template"), intOrNull(n, "http_status"), text(n, "logger"), text(n, "top_frame"),
                text(n, "stack_trace"));
    }

    /** Facts of a stored group row (for re-classification and the detail view). */
    static ErrorFacts facts(Map<String, Object> row) {
        return new ErrorFacts(ErrorFacts.source((String) row.get("source")), (String) row.get("exception_class"),
                (String) row.get("root_cause_class"), (String) row.get("cause_chain"), (String) row.get("message"),
                (String) row.get("root_cause_message"), (String) row.get("error_code"), (String) row.get("sql_state"),
                (String) row.get("http_method"), (String) row.get("path_template"),
                row.get("http_status") == null ? null : ((Number) row.get("http_status")).intValue(),
                (String) row.get("logger"), (String) row.get("top_frame"), (String) row.get("stack_trace"));
    }

    /** Applies the current catalogue to every stored group, so rule improvements re-label history. */
    @EventListener(ApplicationReadyEvent.class)
    public void reclassifyAll() {
        try {
            int changed = 0;
            List<Map<String, Object>> rows = jdbc.queryForList("""
                    SELECT id, source, exception_class, root_cause_class, cause_chain, message, root_cause_message,
                           error_code, sql_state, http_method, path_template, http_status, logger, top_frame, stack_trace,
                           module, category, severity, rule_code, title
                    FROM error_groups""");
            for (Map<String, Object> row : rows) {
                ErrorExplainer.Explanation x = ErrorExplainer.explain(facts(row));
                if (!x.ruleCode().equals(row.get("rule_code")) || !x.module().name().equals(row.get("module"))
                        || !x.severity().name().equals(row.get("severity")) || !x.title().equals(row.get("title"))
                        || !x.category().name().equals(row.get("category"))) {
                    changed += jdbc.update("UPDATE error_groups SET module = ?, category = ?, severity = ?, rule_code = ?, title = ? WHERE id = ?",
                            x.module().name(), x.category().name(), x.severity().name(), x.ruleCode(), clip(x.title(), 200), row.get("id"));
                }
            }
            if (changed > 0) log.info("Re-classified {} error groups with the current catalogue", changed);
        } catch (RuntimeException e) {
            log.warn("Error-group re-classification skipped: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "0 30 3 * * *")
    public void prune() {
        Timestamp eventsBefore = Timestamp.from(Instant.now().minus(Duration.ofDays(eventRetentionDays)));
        Timestamp groupsBefore = Timestamp.from(Instant.now().minus(Duration.ofDays(groupRetentionDays)));
        int ev = jdbc.update("DELETE FROM error_events WHERE occurred_at < ?", eventsBefore);
        int gr = jdbc.update("DELETE FROM error_groups WHERE last_seen_at < ?", groupsBefore);
        if (ev + gr > 0) log.info("Pruned {} error events and {} error groups", ev, gr);
    }

    private void saveCursors(long tenantId, long groupSeq, long eventId) {
        jdbc.update("UPDATE error_sync_state SET after_group_seq = ?, after_event_id = ? WHERE tenant_id = ?",
                groupSeq, eventId, tenantId);
    }

    private SyncResult finish(long tenantId, String status, int groups, int events, String error, String version) {
        jdbc.update("""
                UPDATE error_sync_state SET last_sync_at = now(), last_status = ?, last_error = ?,
                    tenant_app_version = COALESCE(?, tenant_app_version)
                WHERE tenant_id = ?""", status, clip(error, 1000), clip(version, 60), tenantId);
        return new SyncResult(tenantId, status, groups, events, error);
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n.get(f);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static Long longOrNull(JsonNode n, String f) {
        JsonNode v = n.get(f);
        return v == null || !v.isNumber() ? null : v.asLong();
    }

    private static Integer intOrNull(JsonNode n, String f) {
        JsonNode v = n.get(f);
        return v == null || !v.isNumber() ? null : v.asInt();
    }

    private static Timestamp ts(JsonNode n, String f) {
        String s = text(n, f);
        if (s == null) return Timestamp.from(Instant.now());
        try {
            return Timestamp.from(Instant.parse(s));
        } catch (RuntimeException e) {
            return Timestamp.from(Instant.now());
        }
    }

    static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
