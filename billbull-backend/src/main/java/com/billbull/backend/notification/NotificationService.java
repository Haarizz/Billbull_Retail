package com.billbull.backend.notification;

import com.billbull.backend.logging.LogContext;
import com.billbull.backend.security.BranchScope;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * Core notification service. All public methods that read/write notifications
 * derive the target user from the Spring Security context — never from request
 * parameters — preventing users from accessing or mutating each other's state.
 */
@Service
@Transactional
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_PAGE_SIZE = 50;
    private static final int MAX_BULK_IDS = 500;

    private final NotificationRepository repo;
    private final DisplayNameResolver names;

    public NotificationService(NotificationRepository repo, DisplayNameResolver names) {
        this.repo = repo;
        this.names = names;
    }

    /** Inbox filters. Every field is optional; null/blank means "don't filter on it". */
    public record InboxFilter(String category, boolean unreadOnly, String type, String priority,
                              String q, LocalDate from, LocalDate to) {
        public static InboxFilter of(String category, boolean unreadOnly) {
            return new InboxFilter(category, unreadOnly, null, null, null, null, null);
        }
    }

    // ── Query Methods ─────────────────────────────────────────────────────────

    /** Paginated, filtered notifications for the authenticated user, newest first. */
    @Transactional(readOnly = true)
    public Page<NotificationResponse> getMyNotifications(int page, int size, InboxFilter filter) {
        String username = currentUser();
        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));

        Page<Notification> result = repo.findAll(inboxSpec(username, filter), pageable);

        Map<String, String> fullNames = names.fullNames(
                result.getContent().stream().map(NotificationResponse::actorOf).toList());
        Map<Long, String> branchNames = names.branchNames(
                result.getContent().stream().map(Notification::getBranchId).toList());
        return result.map(n -> NotificationResponse.from(n, fullNames, branchNames));
    }

    /** Back-compat overload for the original category/unread-only filters. */
    @Transactional(readOnly = true)
    public Page<NotificationResponse> getMyNotifications(int page, int size, String category, boolean unreadOnly) {
        return getMyNotifications(page, size, InboxFilter.of(category, unreadOnly));
    }

    static Specification<Notification> inboxSpec(String username, InboxFilter f) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("targetUsername"), username));
            p.add(cb.isTrue(root.<Boolean>get("isActive")));
            if (f == null) return cb.and(p.toArray(Predicate[]::new));

            if (notBlank(f.category())) p.add(cb.equal(root.get("category"), f.category().trim().toUpperCase(Locale.ROOT)));
            if (f.unreadOnly()) p.add(cb.isFalse(root.<Boolean>get("isRead")));
            if (notBlank(f.type())) p.add(cb.equal(root.get("type"), f.type().trim().toUpperCase(Locale.ROOT)));
            if (notBlank(f.priority())) {
                String priority = f.priority().trim().toUpperCase(Locale.ROOT);
                // URGENT = what the bell's "needs attention" count covers: HIGH and CRITICAL.
                p.add("URGENT".equals(priority)
                        ? root.get("priority").in("HIGH", "CRITICAL")
                        : cb.equal(root.get("priority"), priority));
            }
            if (f.from() != null) p.add(cb.greaterThanOrEqualTo(root.<LocalDateTime>get("createdAt"), f.from().atStartOfDay()));
            if (f.to() != null) p.add(cb.lessThan(root.<LocalDateTime>get("createdAt"), f.to().plusDays(1).atStartOfDay()));
            if (notBlank(f.q())) {
                String like = "%" + escapeLike(f.q().trim().toLowerCase(Locale.ROOT)) + "%";
                p.add(cb.or(
                        cb.like(cb.lower(root.<String>get("title")), like, '\\'),
                        cb.like(cb.lower(root.<String>get("message")), like, '\\'),
                        cb.like(cb.lower(root.<String>get("referenceId")), like, '\\'),
                        cb.like(cb.lower(root.<String>get("createdBy")), like, '\\')));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    /** Lightweight unread count for the bell badge (indexed COUNT, no entity fetch). */
    @Transactional(readOnly = true)
    public long getUnreadCount() {
        return repo.countUnread(currentUser());
    }

    /**
     * Inbox overview for the page header and the category rail: totals, unread per category,
     * unread urgent (HIGH/CRITICAL) count and how many arrived today.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getSummary() {
        String username = currentUser();
        long total = 0, unread = 0, urgentUnread = 0, criticalUnread = 0;
        Map<String, long[]> byCategory = new TreeMap<>(); // category → [total, unread]

        for (Object[] row : repo.summarize(username)) {
            String category = row[0] != null ? row[0].toString() : "OTHER";
            String priority = row[1] != null ? row[1].toString() : "MEDIUM";
            boolean read = Boolean.TRUE.equals(row[2]);
            long count = ((Number) row[3]).longValue();

            total += count;
            long[] bucket = byCategory.computeIfAbsent(category, k -> new long[2]);
            bucket[0] += count;
            if (!read) {
                unread += count;
                bucket[1] += count;
                if ("HIGH".equals(priority) || "CRITICAL".equals(priority)) urgentUnread += count;
                if ("CRITICAL".equals(priority)) criticalUnread += count;
            }
        }

        List<Map<String, Object>> categories = new ArrayList<>();
        byCategory.forEach((category, b) -> {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("category", category);
            c.put("total", b[0]);
            c.put("unread", b[1]);
            categories.add(c);
        });

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total);
        out.put("unread", unread);
        out.put("urgentUnread", urgentUnread);
        out.put("criticalUnread", criticalUnread);
        out.put("today", repo.countSince(username, LocalDate.now().atStartOfDay()));
        out.put("categories", categories);
        return out;
    }

    // ── Mutation Methods ──────────────────────────────────────────────────────

    /** Mark a single notification as read (only if owned by the current user). */
    public NotificationResponse markAsRead(Long id) {
        Notification n = requireOwned(id);
        if (!n.isRead()) {
            n.setRead(true);
            n.setReadAt(LocalDateTime.now());
            repo.save(n);
        }
        return NotificationResponse.from(n);
    }

    /** Bulk mark-all-read for the current user (optionally one category). Returns the number affected. */
    public int markAllAsRead(String category) {
        if (notBlank(category)) {
            return repo.markCategoryRead(currentUser(), category.trim().toUpperCase(Locale.ROOT), LocalDateTime.now());
        }
        return repo.markAllRead(currentUser(), LocalDateTime.now());
    }

    public int markAllAsRead() {
        return markAllAsRead(null);
    }

    public int markManyAsRead(Collection<Long> ids) {
        List<Long> clean = cleanIds(ids);
        return clean.isEmpty() ? 0 : repo.markReadByIds(currentUser(), clean, LocalDateTime.now());
    }

    /** Soft-delete (dismiss) a notification. */
    public void dismiss(Long id) {
        Notification n = requireOwned(id);
        n.setActive(false);
        repo.save(n);
    }

    public int dismissMany(Collection<Long> ids) {
        List<Long> clean = cleanIds(ids);
        return clean.isEmpty() ? 0 : repo.dismissByIds(currentUser(), clean);
    }

    /** Clear out everything already read. */
    public int dismissAllRead() {
        return repo.dismissAllRead(currentUser());
    }

    // ── Internal / Publisher Methods ──────────────────────────────────────────

    /** Creates a notification for a single user (no details). */
    public Notification createForUser(String targetUsername,
                                      String title, String message,
                                      String type, String category, String priority,
                                      String actionUrl,
                                      String referenceId, String referenceType,
                                      LocalDateTime expiresAt) {
        return createForUser(targetUsername, title, message, type, category, priority,
                actionUrl, referenceId, referenceType, expiresAt, null);
    }

    /**
     * Creates a notification for a single user. The branch is taken from the current request,
     * so "where did this happen" needs no help from the calling module.
     */
    public Notification createForUser(String targetUsername,
                                      String title, String message,
                                      String type, String category, String priority,
                                      String actionUrl,
                                      String referenceId, String referenceType,
                                      LocalDateTime expiresAt,
                                      Map<String, ?> details) {
        Notification n = new Notification();
        n.setTargetUsername(targetUsername);
        n.setTitle(title);
        n.setMessage(message);
        n.setType(type != null ? type : "INFO");
        n.setCategory(category);
        n.setPriority(priority != null ? priority : "MEDIUM");
        n.setActionUrl(actionUrl);
        n.setReferenceId(referenceId);
        n.setReferenceType(referenceType);
        n.setExpiresAt(expiresAt);
        n.setBranchId(currentBranchId());
        n.setMetadata(toJson(details));
        return repo.save(n);
    }

    /** Fan-out: create one notification row per target user. */
    public void createForUsers(List<String> usernames,
                               String title, String message,
                               String type, String category, String priority,
                               String actionUrl,
                               String referenceId, String referenceType,
                               LocalDateTime expiresAt) {
        createForUsers(usernames, title, message, type, category, priority,
                actionUrl, referenceId, referenceType, expiresAt, null, null);
    }

    /**
     * Fan-out with details. With {@code dedupeWithin} set, a user who still has an unread
     * notification with the same title and reference from inside that window is skipped —
     * repeating alerts (low stock fires on every stock movement) then stay one row, not forty.
     */
    public void createForUsers(List<String> usernames,
                               String title, String message,
                               String type, String category, String priority,
                               String actionUrl,
                               String referenceId, String referenceType,
                               LocalDateTime expiresAt,
                               Map<String, ?> details,
                               Duration dedupeWithin) {
        LocalDateTime since = dedupeWithin != null ? LocalDateTime.now().minus(dedupeWithin) : null;
        for (String username : usernames) {
            if (since != null && referenceId != null && referenceType != null
                    && repo.existsUnreadDuplicate(username, title, referenceType, referenceId, since)) {
                continue;
            }
            createForUser(username, title, message, type, category, priority,
                    actionUrl, referenceId, referenceType, expiresAt, details);
        }
    }

    // ── Scheduled Cleanup ─────────────────────────────────────────────────────

    /**
     * Runs at 3:00 AM daily. Hard-deletes notifications past their {@code expiresAt}
     * timestamp and read notifications older than 90 days.
     */
    @Scheduled(cron = "0 0 3 * * *")
    public void cleanupOldNotifications() {
        LocalDateTime now = LocalDateTime.now();
        int expired = repo.deleteExpired(now);
        int oldRead = repo.deleteOldRead(now.minusDays(90));
        if (expired > 0 || oldRead > 0) {
            log.info("Notification cleanup: deleted {} expired + {} old read notifications", expired, oldRead);
        }
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private Notification requireOwned(Long id) {
        return repo.findByIdAndTargetUsernameAndIsActiveTrue(id, currentUser())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found"));
    }

    private static List<Long> cleanIds(Collection<Long> ids) {
        if (ids == null) return List.of();
        List<Long> clean = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (clean.size() > MAX_BULK_IDS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "At most " + MAX_BULK_IDS + " notifications can be changed at once");
        }
        return clean;
    }

    private static Long currentBranchId() {
        Long fromLog = LogContext.getLong(LogContext.BRANCH_ID);
        return fromLog != null ? fromLog : BranchScope.currentBranchId();
    }

    static String toJson(Map<String, ?> details) {
        if (details == null || details.isEmpty()) return null;
        Map<String, Object> clean = new LinkedHashMap<>();
        details.forEach((k, v) -> {
            if (k != null && v != null && !(v instanceof String s && s.isBlank())) clean.put(k, v);
        });
        if (clean.isEmpty()) return null;
        try {
            return JSON.writeValueAsString(clean);
        } catch (Exception e) {
            return null; // details are decoration; never fail the business event over them
        }
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private String currentUser() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
