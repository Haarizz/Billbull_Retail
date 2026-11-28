package com.billbull.backend.platform;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Announcements from BillBull (admin.billbull.app) to this tenant's users.
 *
 * <p>The control plane pushes this tenant's complete set of live announcements
 * ({@link #replace}); anything it no longer sends — archived, deleted, or no longer aimed at this
 * tenant — is marked inactive. Each announcement pops up once per user: dismissing it writes a
 * row to {@code platform_announcement_views}, and the per-announcement counts go back to the
 * control plane in the reply to the next push.
 */
@Service
public class PlatformAnnouncementService {

    static final Set<String> KINDS = Set.of("INFO", "FEATURE", "UPDATE", "MAINTENANCE", "ALERT");
    static final Set<String> AUDIENCES = Set.of("EVERYONE", "ADMINS");
    static final int MAX_ANNOUNCEMENTS = 200;

    private final JdbcTemplate jdbc;
    private final PlatformAgentProperties properties;

    public PlatformAnnouncementService(JdbcTemplate jdbc, PlatformAgentProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    public record Item(Long id, Integer version, String title, String message, String kind, String audience,
                       String startsAt, String endsAt, String publishedAt) {}

    public record Push(List<Item> announcements) {}

    /** Replaces the live set with {@code push}; returns how many are live and the seen counts. */
    @Transactional
    public Map<String, Object> replace(Push push) {
        List<Item> items = push == null || push.announcements() == null ? List.of() : push.announcements();
        if (items.size() > MAX_ANNOUNCEMENTS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At most " + MAX_ANNOUNCEMENTS + " announcements");
        }
        Set<Long> ids = new HashSet<>();
        for (Item it : items) {
            Item v = validate(it);
            if (!ids.add(v.id())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate announcement id " + v.id());
            }
            jdbc.update("INSERT INTO platform_announcements"
                            + " (id, version, title, message, kind, audience, starts_at, ends_at, active, published_at)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, ?)"
                            + " ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, title = EXCLUDED.title,"
                            + " message = EXCLUDED.message, kind = EXCLUDED.kind, audience = EXCLUDED.audience,"
                            + " starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, active = true,"
                            + " published_at = EXCLUDED.published_at, updated_at = now()",
                    v.id(), v.version(), v.title(), v.message(), v.kind(), v.audience(),
                    ts(v.startsAt()), ts(v.endsAt()), ts(v.publishedAt()));
        }
        if (ids.isEmpty()) {
            jdbc.update("UPDATE platform_announcements SET active = false, updated_at = now() WHERE active");
        } else {
            jdbc.update("UPDATE platform_announcements SET active = false, updated_at = now()"
                    + " WHERE active AND NOT (id = ANY (?))", (Object) ids.toArray(new Long[0]));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("live", ids.size());
        out.put("stats", stats());
        return out;
    }

    /** Seen counts for every announcement this tenant has ever received. */
    public List<Map<String, Object>> stats() {
        return jdbc.query(
                "SELECT a.id, a.active, COUNT(v.username) AS seen_users, MIN(v.seen_at) AS first_seen,"
                        + " MAX(v.seen_at) AS last_seen FROM platform_announcements a"
                        + " LEFT JOIN platform_announcement_views v ON v.announcement_id = a.id"
                        + " GROUP BY a.id, a.active ORDER BY a.id",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("active", rs.getBoolean("active"));
                    m.put("seenUsers", rs.getLong("seen_users"));
                    m.put("firstSeenAt", str(rs.getObject("first_seen", OffsetDateTime.class)));
                    m.put("lastSeenAt", str(rs.getObject("last_seen", OffsetDateTime.class)));
                    return m;
                });
    }

    /**
     * Announcements {@code username} has not dismissed yet, oldest first: live, inside their
     * show window, and aimed at the user's audience. BillBull's own support user never sees them.
     */
    public List<Map<String, Object>> pendingFor(String username, boolean admin) {
        if (username == null || username.equalsIgnoreCase(properties.getSupportUsername())) return List.of();
        return jdbc.query(
                "SELECT a.id, a.version, a.title, a.message, a.kind, a.audience, a.published_at, a.ends_at"
                        + " FROM platform_announcements a"
                        + " WHERE a.active AND (a.starts_at IS NULL OR a.starts_at <= now())"
                        + " AND (a.ends_at IS NULL OR a.ends_at > now())"
                        + " AND (a.audience = 'EVERYONE' OR ?)"
                        + " AND NOT EXISTS (SELECT 1 FROM platform_announcement_views v"
                        + "   WHERE v.announcement_id = a.id AND v.username = ?)"
                        + " ORDER BY COALESCE(a.published_at, a.received_at), a.id LIMIT 20",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("version", rs.getInt("version"));
                    m.put("title", rs.getString("title"));
                    m.put("message", rs.getString("message"));
                    m.put("kind", rs.getString("kind"));
                    m.put("audience", rs.getString("audience"));
                    m.put("publishedAt", str(rs.getObject("published_at", OffsetDateTime.class)));
                    m.put("endsAt", str(rs.getObject("ends_at", OffsetDateTime.class)));
                    return m;
                },
                admin, username);
    }

    /** Records that {@code username} dismissed announcement {@code id}; idempotent. */
    @Transactional
    public boolean markSeen(long id, String username) {
        if (username == null || username.equalsIgnoreCase(properties.getSupportUsername())) return false;
        List<Integer> version = jdbc.query("SELECT version FROM platform_announcements WHERE id = ?",
                (rs, i) -> rs.getInt(1), id);
        if (version.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Announcement not found");
        }
        return jdbc.update("INSERT INTO platform_announcement_views (announcement_id, username, version_seen)"
                + " VALUES (?, ?, ?) ON CONFLICT (announcement_id, username) DO NOTHING",
                id, clip(username, 100), version.get(0)) > 0;
    }

    static Item validate(Item it) {
        if (it == null || it.id() == null || it.id() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Announcement id required");
        }
        String title = it.title() == null ? "" : it.title().trim();
        String message = it.message() == null ? "" : it.message().trim();
        if (title.isEmpty() || message.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Announcement " + it.id() + " needs a title and message");
        }
        String kind = it.kind() == null ? "INFO" : it.kind().trim().toUpperCase(Locale.ROOT);
        if (!KINDS.contains(kind)) kind = "INFO"; // a newer control plane may send kinds this build doesn't know
        String audience = it.audience() == null ? "EVERYONE" : it.audience().trim().toUpperCase(Locale.ROOT);
        if (!AUDIENCES.contains(audience)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown audience: " + it.audience());
        }
        parse(it.startsAt());
        parse(it.endsAt());
        parse(it.publishedAt());
        return new Item(it.id(), it.version() == null || it.version() < 1 ? 1 : it.version(), clip(title, 150),
                clip(message, 4000), kind, audience, it.startsAt(), it.endsAt(), it.publishedAt());
    }

    private static Instant parse(String iso) {
        if (iso == null || iso.isBlank()) return null;
        try {
            return Instant.parse(iso);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad timestamp: " + iso);
        }
    }

    private static Timestamp ts(String iso) {
        Instant i = parse(iso);
        return i == null ? null : Timestamp.from(i);
    }

    private static String str(OffsetDateTime t) {
        return t == null ? null : t.toInstant().toString();
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
