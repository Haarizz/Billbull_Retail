package com.billbull.backend.notification;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Core notification service. All public methods that read/write notifications
 * derive the target user from the Spring Security context — never from request
 * parameters — preventing users from accessing or mutating each other's state.
 */
@Service
@Transactional
public class NotificationService {

    private final NotificationRepository repo;

    public NotificationService(NotificationRepository repo) {
        this.repo = repo;
    }

    // ── Query Methods ─────────────────────────────────────────────────────────

    /**
     * Returns paginated notifications for the authenticated user.
     *
     * @param page       zero-based page index
     * @param size       page size (capped at 50)
     * @param category   optional category filter (null = all)
     * @param unreadOnly if true, return only unread notifications
     */
    @Transactional(readOnly = true)
    public Page<NotificationResponse> getMyNotifications(
            int page, int size, String category, boolean unreadOnly) {

        String username = currentUser();
        Pageable pageable = PageRequest.of(page, Math.min(size, 50));

        Page<Notification> result;

        if (unreadOnly && category != null && !category.isBlank()) {
            result = repo.findByTargetUsernameAndCategoryAndIsReadFalseAndIsActiveTrueOrderByCreatedAtDesc(
                    username, category.toUpperCase(), pageable);
        } else if (unreadOnly) {
            result = repo.findByTargetUsernameAndIsReadFalseAndIsActiveTrueOrderByCreatedAtDesc(
                    username, pageable);
        } else if (category != null && !category.isBlank()) {
            result = repo.findByTargetUsernameAndCategoryAndIsActiveTrueOrderByCreatedAtDesc(
                    username, category.toUpperCase(), pageable);
        } else {
            result = repo.findByTargetUsernameAndIsActiveTrueOrderByCreatedAtDesc(
                    username, pageable);
        }

        return result.map(NotificationResponse::from);
    }

    /**
     * Lightweight unread count for the bell badge. Hits an indexed COUNT query —
     * no JOINs, no fetching entities.
     */
    @Transactional(readOnly = true)
    public long getUnreadCount() {
        return repo.countUnread(currentUser());
    }

    // ── Mutation Methods ──────────────────────────────────────────────────────

    /** Mark a single notification as read (only if owned by the current user). */
    public NotificationResponse markAsRead(Long id) {
        Notification n = repo.findByIdAndTargetUsernameAndIsActiveTrue(id, currentUser())
                .orElseThrow(() -> new RuntimeException("Notification not found"));
        if (!n.isRead()) {
            n.setRead(true);
            n.setReadAt(LocalDateTime.now());
            repo.save(n);
        }
        return NotificationResponse.from(n);
    }

    /** Bulk mark-all-read for the current user. Returns the number affected. */
    public int markAllAsRead() {
        return repo.markAllRead(currentUser(), LocalDateTime.now());
    }

    /** Soft-delete (dismiss) a notification. */
    public void dismiss(Long id) {
        Notification n = repo.findByIdAndTargetUsernameAndIsActiveTrue(id, currentUser())
                .orElseThrow(() -> new RuntimeException("Notification not found"));
        n.setActive(false);
        repo.save(n);
    }

    // ── Internal / Publisher Methods ──────────────────────────────────────────

    /**
     * Creates a notification for a single user. Called by
     * {@link NotificationEventPublisher} after fan-out.
     */
    public Notification createForUser(String targetUsername,
                                      String title, String message,
                                      String type, String category, String priority,
                                      String actionUrl,
                                      String referenceId, String referenceType,
                                      LocalDateTime expiresAt) {
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
        return repo.save(n);
    }

    /**
     * Fan-out: create one notification row per target user.
     */
    public void createForUsers(List<String> usernames,
                               String title, String message,
                               String type, String category, String priority,
                               String actionUrl,
                               String referenceId, String referenceType,
                               LocalDateTime expiresAt) {
        for (String username : usernames) {
            createForUser(username, title, message, type, category, priority,
                    actionUrl, referenceId, referenceType, expiresAt);
        }
    }

    // ── Scheduled Cleanup ─────────────────────────────────────────────────────

    /**
     * Runs at 3:00 AM daily. Hard-deletes:
     * <ul>
     *   <li>Notifications past their {@code expiresAt} timestamp</li>
     *   <li>Read notifications older than 90 days</li>
     * </ul>
     */
    @Scheduled(cron = "0 0 3 * * *")
    public void cleanupOldNotifications() {
        LocalDateTime now = LocalDateTime.now();
        int expired = repo.deleteExpired(now);
        int oldRead = repo.deleteOldRead(now.minusDays(90));
        if (expired > 0 || oldRead > 0) {
            System.out.println("🔔 Notification cleanup: deleted " + expired +
                    " expired + " + oldRead + " old read notifications");
        }
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private String currentUser() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
