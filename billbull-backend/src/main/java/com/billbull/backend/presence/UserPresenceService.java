package com.billbull.backend.presence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Who is signed in right now, per device. {@link #touch} is called by {@code JwtFilter} for every
 * authenticated request and writes at most once a minute per device, so it costs one small upsert
 * per active device per minute. A device is the pair (user, browser install): the frontend sends a
 * random per-browser id in {@code X-Client-Device}; callers without it are keyed on user agent + IP.
 *
 * <p>Recording never fails a request: any database error is logged once and swallowed.
 */
@Service
public class UserPresenceService {

    private static final Logger log = LoggerFactory.getLogger(UserPresenceService.class);

    /** Minimum gap between two writes for the same device. */
    static final long WRITE_EVERY_MS = 60_000;
    /** A device idle for longer than this starts a new "since" when it comes back. */
    static final int NEW_SESSION_GAP_MINUTES = 30;
    static final int DEFAULT_ONLINE_WINDOW_SECONDS = 180;
    private static final Pattern DEVICE_ID = Pattern.compile("[A-Za-z0-9_-]{8,64}");

    public enum App { RETAIL, POS, POS_DESKTOP, OTHER }

    /** One authenticated request, as seen by the JWT filter. */
    public record Touch(Long userId, String username, List<String> roles, Long branchId, String clientApp,
                        String clientDeviceId, String userAgent, String ip, Long supportSessionId) {
    }

    private final JdbcTemplate jdbc;
    private final Map<String, Long> lastWrite = new ConcurrentHashMap<>();
    private volatile long quietUntil;

    public UserPresenceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void touch(Touch t) {
        if (t == null || t.username() == null) return;
        long now = System.currentTimeMillis();
        if (now < quietUntil) return;
        String key = deviceKey(t);
        Long previous = lastWrite.get(key);
        if (previous != null && now - previous < WRITE_EVERY_MS) return;
        lastWrite.put(key, now);
        if (lastWrite.size() > 5_000) lastWrite.values().removeIf(v -> now - v > WRITE_EVERY_MS);
        try {
            jdbc.update("""
                    INSERT INTO user_presence (device_key, user_id, username, roles, branch_id, app, user_agent,
                                               ip_address, support_session_id, first_seen_at, last_seen_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
                    ON CONFLICT (device_key) DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        username = EXCLUDED.username,
                        roles = EXCLUDED.roles,
                        branch_id = EXCLUDED.branch_id,
                        app = EXCLUDED.app,
                        user_agent = EXCLUDED.user_agent,
                        ip_address = EXCLUDED.ip_address,
                        support_session_id = EXCLUDED.support_session_id,
                        first_seen_at = CASE
                            WHEN user_presence.last_seen_at < now() - make_interval(mins => ?)
                            THEN now() ELSE user_presence.first_seen_at END,
                        last_seen_at = now()
                    """,
                    key, t.userId(), clip(t.username(), 150), clip(rolesText(t.roles()), 300), t.branchId(),
                    classify(t.clientApp(), t.userAgent()).name(), clip(t.userAgent(), 400), clip(t.ip(), 64),
                    t.supportSessionId(), NEW_SESSION_GAP_MINUTES);
        } catch (RuntimeException e) {
            // Missing table on a tenant that hasn't migrated yet, or a DB hiccup: back off for 10
            // minutes instead of retrying on every request.
            quietUntil = now + 600_000;
            lastWrite.remove(key);
            log.warn("Presence not recorded (retrying in 10 min): {}", e.getMessage());
        }
    }

    /** The app a request came from: the frontend's {@code X-Client-App}, refined by user agent. */
    static App classify(String clientApp, String userAgent) {
        String app = clientApp == null ? "" : clientApp.trim().toLowerCase(Locale.ROOT);
        boolean electron = userAgent != null && userAgent.contains("Electron/");
        return switch (app) {
            case "pos" -> electron ? App.POS_DESKTOP : App.POS;
            case "retail" -> App.RETAIL;
            default -> electron ? App.POS_DESKTOP : App.OTHER;
        };
    }

    static String deviceKey(Touch t) {
        String device = t.clientDeviceId() != null && DEVICE_ID.matcher(t.clientDeviceId()).matches()
                ? "d:" + t.clientDeviceId()
                : "ua:" + t.userAgent() + "|" + t.ip();
        String who = t.userId() != null ? String.valueOf(t.userId()) : t.username();
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((who + "|" + device).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 20);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ── Reads for the platform agent ────────────────────────────────────────────

    /** Devices and people active within the online window; null when the table is unreadable. */
    public Map<String, Long> onlineCounts(int onlineWindowSeconds) {
        Map<String, Object> row = jdbc.queryForMap("""
                SELECT count(*) AS devices, count(DISTINCT coalesce(user_id::text, username)) AS users
                FROM user_presence WHERE last_seen_at >= now() - make_interval(secs => ?)
                """, window(onlineWindowSeconds));
        Map<String, Long> out = new LinkedHashMap<>();
        out.put("onlineDevices", ((Number) row.get("devices")).longValue());
        out.put("onlineUsers", ((Number) row.get("users")).longValue());
        return out;
    }

    /**
     * Everything Live Clients shows for this tenant: devices seen in the last 24 hours, who is on
     * the tills, and how busy the shop is today. Counts and names only — no business records.
     * Each section is gathered on its own so one failing query doesn't hide the others.
     */
    public Map<String, Object> snapshot(int onlineWindowSeconds, int limit) {
        int window = window(onlineWindowSeconds);
        int max = Math.max(1, Math.min(limit, 500));
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, String> errors = new LinkedHashMap<>();
        out.put("serverTime", java.time.Instant.now().toString());
        out.put("onlineWindowSeconds", window);

        try {
            List<Map<String, Object>> devices = new ArrayList<>();
            jdbc.query("""
                    SELECT p.device_key, p.user_id, p.username, u.full_name, p.roles, p.branch_id, b.name AS branch_name,
                           p.app, p.user_agent, p.ip_address, p.support_session_id, p.first_seen_at, p.last_seen_at,
                           p.last_seen_at >= now() - make_interval(secs => ?) AS online
                    FROM user_presence p
                    LEFT JOIN users u ON u.id = p.user_id
                    LEFT JOIN branches b ON b.id = p.branch_id
                    WHERE p.last_seen_at >= now() - interval '24 hours'
                    ORDER BY p.last_seen_at DESC
                    LIMIT ?
                    """, rs -> {
                Map<String, Object> d = new LinkedHashMap<>();
                d.put("deviceKey", rs.getString("device_key"));
                d.put("userId", (Long) rs.getObject("user_id", Long.class));
                d.put("username", rs.getString("username"));
                d.put("fullName", rs.getString("full_name"));
                d.put("roles", splitRoles(rs.getString("roles")));
                d.put("branchId", (Long) rs.getObject("branch_id", Long.class));
                d.put("branchName", rs.getString("branch_name"));
                d.put("app", rs.getString("app"));
                d.put("userAgent", rs.getString("user_agent"));
                d.put("ip", rs.getString("ip_address"));
                d.put("support", rs.getObject("support_session_id") != null);
                d.put("since", iso(rs.getTimestamp("first_seen_at")));
                d.put("lastSeenAt", iso(rs.getTimestamp("last_seen_at")));
                d.put("online", rs.getBoolean("online"));
                devices.add(d);
            }, window, max);
            out.put("devices", devices);
        } catch (RuntimeException e) {
            out.put("devices", List.of());
            errors.put("devices", e.getClass().getSimpleName());
        }

        try {
            out.put("activeUsersToday", jdbc.queryForObject("""
                    SELECT count(DISTINCT coalesce(user_id::text, username)) FROM user_presence
                    WHERE last_seen_at >= date_trunc('day', now())
                    """, Long.class));
        } catch (RuntimeException e) {
            errors.put("activeUsersToday", e.getClass().getSimpleName());
        }

        // Tills. pos_terminals / pos_sessions store wall-clock LocalDateTime, so cut-offs are
        // computed in the JVM's zone, the same one that wrote them.
        LocalDateTime terminalCutoff = LocalDateTime.now().minusSeconds(window);
        try {
            Map<String, Object> row = jdbc.queryForMap("""
                    SELECT count(*) FILTER (WHERE last_heartbeat_at >= ?) AS online, count(*) AS total
                    FROM pos_terminals WHERE status NOT IN ('DECOMMISSIONED', 'ARCHIVED')
                    """, Timestamp.valueOf(terminalCutoff));
            Map<String, Object> pos = new LinkedHashMap<>();
            pos.put("terminalsOnline", ((Number) row.get("online")).longValue());
            pos.put("terminalsTotal", ((Number) row.get("total")).longValue());
            out.put("pos", pos);
        } catch (RuntimeException e) {
            errors.put("terminals", e.getClass().getSimpleName());
        }
        try {
            List<Map<String, Object>> sessions = new ArrayList<>();
            jdbc.query("""
                    SELECT s.id, s.owner_user_id, coalesce(s.opened_by_display_name, s.opened_by) AS cashier,
                           s.counter_name, s.branch_name, s.opened_at, s.last_activity_at
                    FROM pos_sessions s WHERE s.status = 'OPEN'
                    ORDER BY s.opened_at DESC LIMIT 100
                    """, rs -> {
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("id", rs.getLong("id"));
                s.put("ownerUserId", (Long) rs.getObject("owner_user_id", Long.class));
                s.put("cashier", rs.getString("cashier"));
                s.put("counterName", rs.getString("counter_name"));
                s.put("branchName", rs.getString("branch_name"));
                s.put("openedAt", local(rs.getTimestamp("opened_at")));
                s.put("lastActivityAt", local(rs.getTimestamp("last_activity_at")));
                sessions.add(s);
            });
            out.put("openPosSessions", sessions);
        } catch (RuntimeException e) {
            errors.put("openPosSessions", e.getClass().getSimpleName());
        }

        try {
            Map<String, Object> row = jdbc.queryForMap("""
                    SELECT count(*) AS n, max(created_at) AS last_at FROM sales_invoices WHERE created_at >= ?
                    """, Timestamp.valueOf(LocalDate.now().atStartOfDay()));
            Map<String, Object> sales = new LinkedHashMap<>();
            sales.put("invoicesToday", ((Number) row.get("n")).longValue());
            sales.put("lastInvoiceAt", local((Timestamp) row.get("last_at")));
            out.put("sales", sales);
        } catch (RuntimeException e) {
            errors.put("sales", e.getClass().getSimpleName());
        }

        out.put("errors", errors);
        return out;
    }

    @Scheduled(cron = "0 40 3 * * *")
    public void prune() {
        try {
            int n = jdbc.update("DELETE FROM user_presence WHERE last_seen_at < now() - interval '30 days'");
            if (n > 0) log.info("Pruned {} presence rows older than 30 days", n);
        } catch (RuntimeException e) {
            log.debug("Presence prune skipped: {}", e.getMessage());
        }
    }

    private static int window(int seconds) {
        return seconds <= 0 ? DEFAULT_ONLINE_WINDOW_SECONDS : Math.min(seconds, 3600);
    }

    static String rolesText(List<String> roles) {
        return roles == null || roles.isEmpty() ? null : String.join(",", roles);
    }

    private static List<String> splitRoles(String roles) {
        return roles == null || roles.isBlank() ? List.of() : List.of(roles.split(","));
    }

    private static String iso(Timestamp ts) {
        return ts == null ? null : ts.toInstant().toString();
    }

    /** A wall-clock column read back in the JVM zone that wrote it, as an ISO instant. */
    private static String local(Timestamp ts) {
        return ts == null ? null : ts.toInstant().toString();
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
