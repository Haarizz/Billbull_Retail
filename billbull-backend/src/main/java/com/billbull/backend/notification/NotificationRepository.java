package com.billbull.backend.notification;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    // ── Single-record lookup (owned by user) ──────────────────────────────────

    Optional<Notification> findByIdAndTargetUsernameAndIsActiveTrue(Long id, String username);

    // ── Unread badge count — intentionally lightweight (COUNT, indexed cols) ──

    @Query("SELECT COUNT(n) FROM Notification n " +
           "WHERE n.targetUsername = :username AND n.isRead = false AND n.isActive = true")
    long countUnread(@Param("username") String username);

    // ── Paginated list — all notifications for a user ─────────────────────────

    Page<Notification> findByTargetUsernameAndIsActiveTrueOrderByCreatedAtDesc(
            String username, Pageable pageable);

    // ── Paginated list — filtered by category ─────────────────────────────────

    Page<Notification> findByTargetUsernameAndCategoryAndIsActiveTrueOrderByCreatedAtDesc(
            String username, String category, Pageable pageable);

    // ── Paginated list — unread only ──────────────────────────────────────────

    Page<Notification> findByTargetUsernameAndIsReadFalseAndIsActiveTrueOrderByCreatedAtDesc(
            String username, Pageable pageable);

    // ── Paginated list — unread + category ────────────────────────────────────

    Page<Notification> findByTargetUsernameAndCategoryAndIsReadFalseAndIsActiveTrueOrderByCreatedAtDesc(
            String username, String category, Pageable pageable);

    // ── Bulk mark-all-read ────────────────────────────────────────────────────

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true, n.readAt = :now " +
           "WHERE n.targetUsername = :username AND n.isRead = false AND n.isActive = true")
    int markAllRead(@Param("username") String username, @Param("now") LocalDateTime now);

    // ── Cleanup: hard-delete expired or old notifications ─────────────────────

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.expiresAt IS NOT NULL AND n.expiresAt < :now")
    int deleteExpired(@Param("now") LocalDateTime now);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.isRead = true AND n.createdAt < :cutoff")
    int deleteOldRead(@Param("cutoff") LocalDateTime cutoff);
}
