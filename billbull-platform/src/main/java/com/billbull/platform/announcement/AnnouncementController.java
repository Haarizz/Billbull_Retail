package com.billbull.platform.announcement;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.agent.TenantAgentClient;
import com.billbull.platform.audit.AuditService;
import com.billbull.platform.auth.CurrentUser;
import com.billbull.platform.auth.PlatformPrincipal;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.tenant.TenantStatus;
import com.billbull.platform.web.ClientIp;

/**
 * Announcements to clients' users: VIEWER reads, OPERATOR creates, edits, archives and deletes.
 * Every change is audited and delivered in the background by {@link AnnouncementSyncService}.
 *
 * <pre>
 *   GET    /api/announcements                list (with delivery and seen counts)
 *   GET    /api/announcements/{id}           one, with a row per targeted client
 *   POST   /api/announcements                publish a new one (live at once)
 *   PUT    /api/announcements/{id}           edit; clients get the new text, but users who
 *                                            already dismissed it are not shown it again
 *   POST   /api/announcements/{id}/archive   stop showing it; counts are kept
 *   POST   /api/announcements/{id}/republish make an archived one live again
 *   DELETE /api/announcements/{id}           remove it from the list and from every client
 *   POST   /api/announcements/sync           push to every client now
 * </pre>
 */
@RestController
@RequestMapping("/api/announcements")
public class AnnouncementController {

    static final Set<String> KINDS = Set.of("INFO", "FEATURE", "UPDATE", "MAINTENANCE", "ALERT");
    static final Set<String> AUDIENCES = Set.of("EVERYONE", "ADMINS");

    private final AnnouncementRepository announcements;
    private final TenantRepository tenants;
    private final AnnouncementSyncService sync;
    private final TenantAgentClient agent;
    private final JdbcTemplate jdbc;
    private final AuditService audit;

    public AnnouncementController(AnnouncementRepository announcements, TenantRepository tenants,
                                  AnnouncementSyncService sync, TenantAgentClient agent, JdbcTemplate jdbc,
                                  AuditService audit) {
        this.announcements = announcements;
        this.tenants = tenants;
        this.sync = sync;
        this.agent = agent;
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public record AnnouncementInput(String title, String message, String kind, String audience, Boolean targetAll,
                                    List<Long> tenantIds, String startsAt, String endsAt) {}

    record Stat(long tenantId, Integer deliveredVersion, Instant deliveredAt, long seenUsers, Instant firstSeenAt,
                Instant lastSeenAt, Instant reportedAt) {}

    @GetMapping
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, Object>> list() {
        List<Announcement> all = announcements.findByStatusNotOrderByCreatedAtDesc(Announcement.DELETED);
        Map<Long, List<Stat>> stats = stats(null);
        List<Tenant> live = tenants.findByStatusNot(TenantStatus.ARCHIVED);
        Map<Long, String> names = tenantNames();
        return all.stream().map(a -> view(a, stats.getOrDefault(a.id, List.of()), live, names)).toList();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('VIEWER')")
    public Map<String, Object> get(@PathVariable long id) {
        Announcement a = find(id);
        List<Stat> stats = stats(id).getOrDefault(id, List.of());
        List<Tenant> live = tenants.findByStatusNot(TenantStatus.ARCHIVED);
        Map<String, Object> out = view(a, stats, live, tenantNames());
        Map<Long, Stat> byTenant = new HashMap<>();
        stats.forEach(s -> byTenant.put(s.tenantId(), s));
        Map<Long, AnnouncementSyncService.SyncRow> syncRows = sync.syncRows();
        List<Map<String, Object>> clients = new ArrayList<>();
        Set<Long> listed = new LinkedHashSet<>();
        for (Tenant t : live) {
            if (!a.targets(t.id)) continue;
            listed.add(t.id);
            clients.add(clientRow(a, t, byTenant.get(t.id), syncRows.get(t.id), true));
        }
        // Clients that saw it but are no longer targeted (or were archived) keep their history.
        for (Stat s : stats) {
            if (listed.contains(s.tenantId())) continue;
            tenants.findById(s.tenantId()).ifPresent(t -> clients.add(clientRow(a, t, s, null, false)));
        }
        out.put("clients", clients);
        return out;
    }

    @PostMapping
    @PreAuthorize("hasRole('OPERATOR')")
    @Transactional
    public Map<String, Object> create(@RequestBody AnnouncementInput in, HttpServletRequest request) {
        PlatformPrincipal who = CurrentUser.get();
        Announcement a = new Announcement();
        apply(a, in);
        a.status = Announcement.LIVE;
        a.publishedAt = Instant.now();
        a.createdBy = a.updatedBy = who.email();
        announcements.save(a);
        audit.record(who, "ANNOUNCEMENT_PUBLISHED", "Announcement", String.valueOf(a.id), null, describe(a),
                ClientIp.of(request));
        afterCommit();
        return get(a.id);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('OPERATOR')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody AnnouncementInput in,
                                      HttpServletRequest request) {
        PlatformPrincipal who = CurrentUser.get();
        Announcement a = find(id);
        String before = describe(a);
        apply(a, in);
        a.version++;
        a.updatedBy = who.email();
        announcements.save(a);
        audit.record(who, "ANNOUNCEMENT_UPDATED", "Announcement", String.valueOf(id), null,
                before + " → " + describe(a), ClientIp.of(request));
        afterCommit();
        return get(id);
    }

    @PostMapping("/{id}/archive")
    @PreAuthorize("hasRole('OPERATOR')")
    @Transactional
    public Map<String, Object> archive(@PathVariable long id, HttpServletRequest request) {
        return changeStatus(id, Announcement.ARCHIVED, "ANNOUNCEMENT_ARCHIVED", request);
    }

    @PostMapping("/{id}/republish")
    @PreAuthorize("hasRole('OPERATOR')")
    @Transactional
    public Map<String, Object> republish(@PathVariable long id, HttpServletRequest request) {
        Announcement a = find(id);
        if (a.endsAt != null && !a.endsAt.isAfter(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Its end date has passed — edit it to set a new one");
        }
        return changeStatus(id, Announcement.LIVE, "ANNOUNCEMENT_REPUBLISHED", request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('OPERATOR')")
    @Transactional
    public Map<String, Object> delete(@PathVariable long id, HttpServletRequest request) {
        // Soft delete: the row stays so the audit trail's references resolve; clients drop it.
        changeStatus(id, Announcement.DELETED, "ANNOUNCEMENT_DELETED", request);
        return Map.of("deleted", true);
    }

    @PostMapping("/sync")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Integer> syncNow(HttpServletRequest request) {
        Map<String, Integer> r = sync.syncAll(true);
        audit.record(CurrentUser.get(), "ANNOUNCEMENTS_SYNCED", "Announcement", null, null,
                "Pushed to every client: " + r, ClientIp.of(request));
        return r;
    }

    private Map<String, Object> changeStatus(long id, String status, String action, HttpServletRequest request) {
        PlatformPrincipal who = CurrentUser.get();
        Announcement a = find(id);
        if (status.equals(a.status)) return get(id);
        String before = a.status;
        a.status = status;
        a.version++;
        a.updatedBy = who.email();
        if (Announcement.ARCHIVED.equals(status)) a.archivedAt = Instant.now();
        if (Announcement.LIVE.equals(status)) a.archivedAt = null;
        announcements.save(a);
        audit.record(who, action, "Announcement", String.valueOf(id), null,
                "\"" + a.title + "\" " + before + " → " + status, ClientIp.of(request));
        afterCommit();
        return Announcement.DELETED.equals(status) ? Map.of() : get(id);
    }

    /** Starts delivery once the change is committed, so the sync thread reads it. */
    private void afterCommit() {
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            sync.syncSoon();
                        }
                    });
        } else {
            sync.syncSoon();
        }
    }

    private Announcement find(long id) {
        return announcements.findById(id)
                .filter(a -> !Announcement.DELETED.equals(a.status))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Announcement not found"));
    }

    void apply(Announcement a, AnnouncementInput in) {
        if (in == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Body required");
        String title = in.title() == null ? "" : in.title().trim();
        String message = in.message() == null ? "" : in.message().trim();
        if (title.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A title is required");
        if (title.length() > 150) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title: at most 150 characters");
        if (message.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A message is required");
        if (message.length() > 4000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message: at most 4000 characters");
        }
        String kind = in.kind() == null ? "INFO" : in.kind().trim().toUpperCase(Locale.ROOT);
        if (!KINDS.contains(kind)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown type: " + in.kind());
        String audience = in.audience() == null ? "EVERYONE" : in.audience().trim().toUpperCase(Locale.ROOT);
        if (!AUDIENCES.contains(audience)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown audience: " + in.audience());
        }
        boolean all = in.targetAll() == null || in.targetAll();
        Set<Long> ids = new LinkedHashSet<>();
        if (!all) {
            if (in.tenantIds() != null) in.tenantIds().stream().filter(Objects::nonNull).forEach(ids::add);
            if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose at least one client");
            for (Long id : ids) {
                Tenant t = tenants.findById(id).orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown client id " + id));
                if (t.status == TenantStatus.ARCHIVED) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, t.name + " is archived");
                }
            }
        }
        Instant starts = parse(in.startsAt(), "start");
        Instant ends = parse(in.endsAt(), "end");
        if (starts != null && ends != null && !ends.isAfter(starts)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The end must be after the start");
        }
        if (ends != null && !ends.isAfter(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The end is already in the past");
        }
        a.title = title;
        a.message = message;
        a.kind = kind;
        a.audience = audience;
        a.targetAll = all;
        a.tenantIds.clear();
        a.tenantIds.addAll(ids);
        a.startsAt = starts;
        a.endsAt = ends;
    }

    static Instant parse(String iso, String what) {
        if (iso == null || iso.isBlank()) return null;
        try {
            return Instant.parse(iso);
        } catch (RuntimeException e) {
            try {
                return OffsetDateTime.parse(iso).toInstant();
            } catch (RuntimeException e2) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad " + what + " time: " + iso);
            }
        }
    }

    private Map<Long, List<Stat>> stats(Long announcementId) {
        Map<Long, List<Stat>> out = new HashMap<>();
        String sql = "SELECT announcement_id, tenant_id, delivered_version, delivered_at, seen_users, first_seen_at,"
                + " last_seen_at, reported_at FROM announcement_tenant_stats"
                + (announcementId != null ? " WHERE announcement_id = ?" : "");
        Object[] args = announcementId != null ? new Object[] {announcementId} : new Object[0];
        jdbc.query(sql, rs -> {
            Integer dv = rs.getObject("delivered_version") == null ? null : rs.getInt("delivered_version");
            out.computeIfAbsent(rs.getLong("announcement_id"), k -> new ArrayList<>()).add(new Stat(
                    rs.getLong("tenant_id"), dv, inst(rs.getObject("delivered_at", OffsetDateTime.class)),
                    rs.getLong("seen_users"), inst(rs.getObject("first_seen_at", OffsetDateTime.class)),
                    inst(rs.getObject("last_seen_at", OffsetDateTime.class)),
                    inst(rs.getObject("reported_at", OffsetDateTime.class))));
        }, args);
        return out;
    }

    private Map<Long, String> tenantNames() {
        Map<Long, String> m = new HashMap<>();
        tenants.findAll().forEach(t -> m.put(t.id, t.name));
        return m;
    }

    Map<String, Object> view(Announcement a, List<Stat> stats, List<Tenant> live, Map<Long, String> names) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.id);
        m.put("title", a.title);
        m.put("message", a.message);
        m.put("kind", a.kind);
        m.put("audience", a.audience);
        m.put("targetAll", a.targetAll);
        m.put("tenantIds", a.tenantIds);
        m.put("tenantNames", a.tenantIds.stream().map(id -> names.getOrDefault(id, "#" + id)).toList());
        m.put("status", a.status);
        m.put("phase", phase(a, Instant.now()));
        m.put("version", a.version);
        m.put("startsAt", a.startsAt);
        m.put("endsAt", a.endsAt);
        m.put("publishedAt", a.publishedAt);
        m.put("archivedAt", a.archivedAt);
        m.put("createdBy", a.createdBy);
        m.put("updatedBy", a.updatedBy);
        m.put("createdAt", a.createdAt);
        m.put("updatedAt", a.updatedAt);
        long targeted = live.stream().filter(t -> a.targets(t.id)).count();
        long delivered = live.stream().filter(t -> a.targets(t.id)).filter(t -> stats.stream()
                .anyMatch(s -> s.tenantId() == t.id && s.deliveredVersion() != null
                        && s.deliveredVersion() == a.version)).count();
        m.put("targetedClients", targeted);
        m.put("deliveredClients", delivered);
        m.put("seenUsers", stats.stream().mapToLong(Stat::seenUsers).sum());
        m.put("seenClients", stats.stream().filter(s -> s.seenUsers() > 0).count());
        m.put("lastSeenAt", stats.stream().map(Stat::lastSeenAt).filter(Objects::nonNull).max(Instant::compareTo).orElse(null));
        return m;
    }

    /** What the admin sees: LIVE, SCHEDULED (not started), ENDED (past its end), ARCHIVED. */
    static String phase(Announcement a, Instant now) {
        if (!Announcement.LIVE.equals(a.status)) return a.status;
        if (a.endsAt != null && !a.endsAt.isAfter(now)) return "ENDED";
        if (a.startsAt != null && a.startsAt.isAfter(now)) return "SCHEDULED";
        return "LIVE";
    }

    private Map<String, Object> clientRow(Announcement a, Tenant t, Stat s, AnnouncementSyncService.SyncRow sync,
                                          boolean targeted) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tenantId", t.id);
        m.put("code", t.code);
        m.put("name", t.name);
        m.put("tenantStatus", t.status);
        m.put("targeted", targeted);
        String delivery;
        if (!targeted) delivery = "NOT_TARGETED";
        else if (!a.deliverable(Instant.now())) delivery = "WITHDRAWN";
        else if (!agent.configured(t)) delivery = "NOT_CONFIGURED";
        else if (s != null && s.deliveredVersion() != null && s.deliveredVersion() == a.version) delivery = "DELIVERED";
        else if (sync != null && sync.lastError() != null) delivery = "FAILED";
        else delivery = "PENDING";
        m.put("delivery", delivery);
        m.put("deliveryError", targeted && sync != null ? sync.lastError() : null);
        m.put("deliveredAt", s == null ? null : s.deliveredAt());
        m.put("seenUsers", s == null ? 0 : s.seenUsers());
        m.put("firstSeenAt", s == null ? null : s.firstSeenAt());
        m.put("lastSeenAt", s == null ? null : s.lastSeenAt());
        m.put("reportedAt", s == null ? null : s.reportedAt());
        return m;
    }

    private static String describe(Announcement a) {
        return "\"" + a.title + "\" {" + a.kind + ", audience=" + a.audience
                + ", to=" + (a.targetAll ? "every client" : "clients " + a.tenantIds)
                + ", window=" + a.startsAt + ".." + a.endsAt + ", v" + a.version + "}";
    }

    private static Instant inst(OffsetDateTime t) {
        return t == null ? null : t.toInstant();
    }
}
