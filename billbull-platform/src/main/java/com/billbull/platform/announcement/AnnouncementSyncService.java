package com.billbull.platform.announcement;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
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
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Delivers announcements: each client gets its complete live set through
 * {@code PUT /api/platform/announcements}, and the reply carries the client's seen counts.
 *
 * <p>The set is re-sent when it changed since the client last accepted it (hash differs), and
 * otherwise every {@code platform.announcements.refresh-ms} to refresh the counts. A client that
 * was down catches up on the next cycle. Agent calls run outside any database transaction, and
 * runs are serialised so a scheduled cycle and a "send now" never overlap.
 */
@Service
public class AnnouncementSyncService {

    private static final Logger log = LoggerFactory.getLogger(AnnouncementSyncService.class);
    static final String AGENT_PATH = "/api/platform/announcements";

    private final AnnouncementRepository announcements;
    private final TenantRepository tenants;
    private final TenantAgentClient agent;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper;
    private final Duration refresh;
    private final ExecutorService soon = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "announcement-sync");
        t.setDaemon(true);
        return t;
    });

    public AnnouncementSyncService(AnnouncementRepository announcements, TenantRepository tenants,
                                   TenantAgentClient agent, JdbcTemplate jdbc, TransactionTemplate tx,
                                   ObjectMapper mapper,
                                   @Value("${platform.announcements.refresh-ms:300000}") long refreshMs) {
        this.announcements = announcements;
        this.tenants = tenants;
        this.agent = agent;
        this.jdbc = jdbc;
        this.tx = tx;
        this.mapper = mapper;
        this.refresh = Duration.ofMillis(Math.max(60_000, refreshMs));
    }

    /** One client's delivery state, as the admin UI shows it. */
    public record SyncRow(String payloadHash, Instant syncedAt, Instant lastAttemptAt, String lastError) {}

    /** Delivers changed sets in the background, right after an announcement changed. */
    public void syncSoon() {
        soon.submit(() -> {
            try {
                syncAll(false);
            } catch (RuntimeException e) {
                log.warn("Announcement sync failed: {}", e.getMessage());
            }
        });
    }

    @Scheduled(fixedDelayString = "${platform.sync.interval-ms:60000}", initialDelay = 30_000)
    public void scheduled() {
        syncAll(false);
    }

    /**
     * Pushes to every client whose set changed, whose counts are stale, or whose last push failed;
     * with {@code force}, to every client. Returns how many pushes succeeded and failed.
     */
    public synchronized Map<String, Integer> syncAll(boolean force) {
        Instant now = Instant.now();
        List<Announcement> deliverable = announcements.findByStatusIn(List.of(Announcement.LIVE)).stream()
                .filter(a -> a.deliverable(now)).toList();
        Map<Long, SyncRow> rows = syncRows();
        int ok = 0;
        int failed = 0;
        for (Tenant t : tenants.findByStatusNot(TenantStatus.ARCHIVED)) {
            if (!agent.configured(t)) continue;
            List<Map<String, Object>> payload = payloadFor(t.id, deliverable);
            String hash = hash(payload);
            SyncRow row = rows.get(t.id);
            if (!force && !due(row, hash, now)) continue;
            try {
                if (push(t, payload, hash, deliverable)) ok++;
                else failed++;
            } catch (RuntimeException e) {
                failed++;
                log.warn("Announcement push to {} errored: {}", t.code, e.getMessage());
            }
        }
        Map<String, Integer> out = new LinkedHashMap<>();
        out.put("sent", ok);
        out.put("failed", failed);
        return out;
    }

    boolean due(SyncRow row, String hash, Instant now) {
        if (row == null || row.syncedAt() == null || row.lastError() != null) return true;
        if (!hash.equals(row.payloadHash())) return true;
        return row.syncedAt().plus(refresh).isBefore(now);
    }

    private boolean push(Tenant t, List<Map<String, Object>> payload, String hash, List<Announcement> deliverable) {
        AgentResponse r = agent.put(t, AGENT_PATH, Map.of("announcements", payload), "platform-announcements");
        Instant now = Instant.now();
        if (!r.ok()) {
            String err = r.status() == 404 ? "The client's platform agent is off or too old for announcements (404)"
                    : r.describe();
            jdbc.update("INSERT INTO announcement_sync (tenant_id, last_attempt_at, last_error) VALUES (?, ?, ?)"
                            + " ON CONFLICT (tenant_id) DO UPDATE SET last_attempt_at = EXCLUDED.last_attempt_at,"
                            + " last_error = EXCLUDED.last_error",
                    t.id, Timestamp.from(now), clip(err, 1000));
            log.info("Announcement push to {} failed: {}", t.code, err);
            return false;
        }
        Map<Long, Integer> sentVersions = payload.stream()
                .collect(Collectors.toMap(m -> (Long) m.get("id"), m -> (Integer) m.get("version")));
        Set<Long> known = deliverable.stream().map(a -> a.id).collect(Collectors.toSet());
        tx.executeWithoutResult(s -> {
            jdbc.update("INSERT INTO announcement_sync (tenant_id, payload_hash, synced_at, last_attempt_at, last_error)"
                            + " VALUES (?, ?, ?, ?, NULL) ON CONFLICT (tenant_id) DO UPDATE SET"
                            + " payload_hash = EXCLUDED.payload_hash, synced_at = EXCLUDED.synced_at,"
                            + " last_attempt_at = EXCLUDED.last_attempt_at, last_error = NULL",
                    t.id, hash, Timestamp.from(now), Timestamp.from(now));
            storeStats(t.id, r.body() == null ? null : r.body().get("stats"), sentVersions, known, now);
        });
        return true;
    }

    /**
     * Saves the client's seen counts. Ids the client reports but this registry no longer has as
     * deliverable are only recorded if the announcement still exists (archived ones keep counting).
     */
    private void storeStats(long tenantId, JsonNode stats, Map<Long, Integer> sentVersions, Set<Long> deliverable,
                            Instant now) {
        Map<Long, JsonNode> byId = new HashMap<>();
        if (stats != null && stats.isArray()) {
            for (JsonNode s : stats) {
                if (s.hasNonNull("id")) byId.put(s.get("id").asLong(), s);
            }
        }
        // Everything just delivered gets a row even before anyone has seen it.
        for (Long id : sentVersions.keySet()) byId.putIfAbsent(id, null);
        if (byId.isEmpty()) return;
        Set<Long> existing = Set.copyOf(jdbc.queryForList(
                "SELECT id FROM announcements WHERE id = ANY (?)", Long.class,
                (Object) byId.keySet().toArray(new Long[0])));
        for (Map.Entry<Long, JsonNode> e : byId.entrySet()) {
            long id = e.getKey();
            if (!existing.contains(id) && !deliverable.contains(id)) continue;
            JsonNode s = e.getValue();
            long seen = s == null ? 0 : s.path("seenUsers").asLong(0);
            Timestamp first = s == null ? null : ts(s.path("firstSeenAt").asText(null));
            Timestamp last = s == null ? null : ts(s.path("lastSeenAt").asText(null));
            Integer version = sentVersions.get(id);
            jdbc.update("INSERT INTO announcement_tenant_stats (announcement_id, tenant_id, delivered_version,"
                            + " delivered_at, seen_users, first_seen_at, last_seen_at, reported_at)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (announcement_id, tenant_id) DO UPDATE SET"
                            + " delivered_at = CASE WHEN EXCLUDED.delivered_version IS NOT NULL AND"
                            + "   announcement_tenant_stats.delivered_version IS DISTINCT FROM EXCLUDED.delivered_version"
                            + "   THEN EXCLUDED.delivered_at ELSE announcement_tenant_stats.delivered_at END,"
                            + " delivered_version = COALESCE(EXCLUDED.delivered_version, announcement_tenant_stats.delivered_version),"
                            + " seen_users = EXCLUDED.seen_users, first_seen_at = EXCLUDED.first_seen_at,"
                            + " last_seen_at = EXCLUDED.last_seen_at, reported_at = EXCLUDED.reported_at",
                    id, tenantId, version, version == null ? null : Timestamp.from(now), seen, first, last,
                    Timestamp.from(now));
        }
    }

    /** The announcements a client should hold, in a stable order so the hash is stable. */
    static List<Map<String, Object>> payloadFor(long tenantId, List<Announcement> deliverable) {
        return deliverable.stream()
                .filter(a -> a.targets(tenantId))
                .sorted(Comparator.comparing(a -> a.id))
                .map(AnnouncementSyncService::item)
                .toList();
    }

    static Map<String, Object> item(Announcement a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.id);
        m.put("version", a.version);
        m.put("title", a.title);
        m.put("message", a.message);
        m.put("kind", a.kind);
        m.put("audience", a.audience);
        m.put("startsAt", a.startsAt == null ? null : a.startsAt.toString());
        m.put("endsAt", a.endsAt == null ? null : a.endsAt.toString());
        m.put("publishedAt", a.publishedAt == null ? null : a.publishedAt.toString());
        return m;
    }

    String hash(List<Map<String, Object>> payload) {
        try {
            byte[] json = mapper.writeValueAsBytes(payload);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public Map<Long, SyncRow> syncRows() {
        Map<Long, SyncRow> out = new HashMap<>();
        jdbc.query("SELECT tenant_id, payload_hash, synced_at, last_attempt_at, last_error FROM announcement_sync",
                rs -> {
                    out.put(rs.getLong("tenant_id"), new SyncRow(rs.getString("payload_hash"),
                            instant(rs.getObject("synced_at", OffsetDateTime.class)),
                            instant(rs.getObject("last_attempt_at", OffsetDateTime.class)),
                            rs.getString("last_error")));
                });
        return out;
    }

    private static Instant instant(OffsetDateTime t) {
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(String iso) {
        if (iso == null || iso.isBlank() || "null".equals(iso)) return null;
        try {
            return Timestamp.from(Instant.parse(iso));
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
