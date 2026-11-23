package com.billbull.backend.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Every query is scoped by {@code targetUsername}: the service always passes the authenticated
 * user, so one user can never read or mutate another user's rows. The inbox list itself is
 * built from a {@link org.springframework.data.jpa.domain.Specification} in
 * {@link NotificationService#getMyNotifications}.
 */
public interface NotificationRepository extends JpaRepository<Notification, Long>,
        JpaSpecificationExecutor<Notification> {

    // ── Single-record lookup (owned by user) ──────────────────────────────────

    Optional<Notification> findByIdAndTargetUsernameAndIsActiveTrue(Long id, String username);

    // ── Unread badge count — intentionally lightweight (COUNT, indexed cols) ──

    @Query("SELECT COUNT(n) FROM Notification n " +
           "WHERE n.targetUsername = :username AND n.isRead = false AND n.isActive = true")
    long countUnread(@Param("username") String username);

    // ── Inbox summary — one grouped scan instead of a COUNT per category ──────

    /** Rows of {@code [category, priority, isRead, count]} over the user's live notifications. */
    @Query("SELECT n.category, n.priority, n.isRead, COUNT(n) FROM Notification n " +
           "WHERE n.targetUsername = :username AND n.isActive = true " +
           "GROUP BY n.category, n.priority, n.isRead")
    List<Object[]> summarize(@Param("username") String username);

    @Query("SELECT COUNT(n) FROM Notification n " +
           "WHERE n.targetUsername = :username AND n.isActive = true AND n.createdAt >= :since")
    long countSince(@Param("username") String username, @Param("since") LocalDateTime since);

    // ── De-duplication of repeating alerts (e.g. low stock on every movement) ──

    @Query("SELECT COUNT(n) > 0 FROM Notification n " +
           "WHERE n.targetUsername = :username AND n.isActive = true AND n.isRead = false " +
           "AND n.title = :title AND n.referenceType = :referenceType AND n.referenceId = :referenceId " +
           "AND n.createdAt >= :since")
    boolean existsUnreadDuplicate(@Param("username") String username,
                                  @Param("title") String title,
                                  @Param("referenceType") String referenceType,
                                  @Param("referenceId") String referenceId,
                                  @Param("since") LocalDateTime since);

    // ── Bulk mutations ────────────────────────────────────────────────────────

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true, n.readAt = :now " +
           "WHERE n.targetUsername = :username AND n.isRead = false AND n.isActive = true")
    int markAllRead(@Param("username") String username, @Param("now") LocalDateTime now);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true, n.readAt = :now " +
           "WHERE n.targetUsername = :username AND n.isRead = false AND n.isActive = true " +
           "AND n.category = :category")
    int markCategoryRead(@Param("username") String username,
                         @Param("category") String category,
                         @Param("now") LocalDateTime now);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true, n.readAt = :now " +
           "WHERE n.targetUsername = :username AND n.isRead = false AND n.isActive = true " +
           "AND n.id IN :ids")
    int markReadByIds(@Param("username") String username,
                      @Param("ids") Collection<Long> ids,
                      @Param("now") LocalDateTime now);

    @Modifying
    @Query("UPDATE Notification n SET n.isActive = false " +
           "WHERE n.targetUsername = :username AND n.isActive = true AND n.id IN :ids")
    int dismissByIds(@Param("username") String username, @Param("ids") Collection<Long> ids);

    @Modifying
    @Query("UPDATE Notification n SET n.isActive = false " +
           "WHERE n.targetUsername = :username AND n.isActive = true AND n.isRead = true")
    int dismissAllRead(@Param("username") String username);

    // ── Cleanup: hard-delete expired or old notifications ─────────────────────

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.expiresAt IS NOT NULL AND n.expiresAt < :now")
    int deleteExpired(@Param("now") LocalDateTime now);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.isRead = true AND n.createdAt < :cutoff")
    int deleteOldRead(@Param("cutoff") LocalDateTime cutoff);
}
