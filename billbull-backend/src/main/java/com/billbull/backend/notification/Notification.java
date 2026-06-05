package com.billbull.backend.notification;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * In-app notification entity. Uses a fan-out-on-write model: every notification
 * is a single row targeted at exactly one user ({@code targetUsername}). When a
 * business event needs to reach multiple users (e.g., all ADMIN users), the
 * {@link NotificationEventPublisher} fans it out by inserting one row per user.
 *
 * <p>This keeps queries dead-simple (no JOINs for read-state) and guarantees
 * isolated read/dismiss state per user.</p>
 */
@Entity
@Table(name = "notifications",
        indexes = {
                @Index(name = "idx_notif_user_read", columnList = "target_username, is_read"),
                @Index(name = "idx_notif_user_active", columnList = "target_username, is_active"),
                @Index(name = "idx_notif_created", columnList = "created_at")
        })
public class Notification extends BaseEntity {

    /** Short headline — e.g. "Low Stock Alert" */
    @Column(nullable = false)
    private String title;

    /** Descriptive body — e.g. "Product X is below reorder level (qty: 3)" */
    @Column(length = 1000)
    private String message;

    /** Visual type controlling icon/color on the frontend. */
    @Column(nullable = false, length = 20)
    private String type = "INFO"; // INFO, WARNING, SUCCESS, ERROR

    /** Business domain tag for filtering. */
    @Column(length = 30)
    private String category; // INVENTORY, SALES, PURCHASE, FINANCE, HR, SYSTEM

    /** Sort/filter priority. */
    @Column(length = 20)
    private String priority = "MEDIUM"; // LOW, MEDIUM, HIGH, CRITICAL

    /** The specific user this notification is addressed to. Always populated. */
    @Column(name = "target_username", nullable = false)
    private String targetUsername;

    /** Read state — isolated per user because of the fan-out model. */
    @Column(name = "is_read", nullable = false)
    private boolean isRead = false;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    /** Frontend route to navigate to when the notification is clicked. */
    @Column(name = "action_url", length = 500)
    private String actionUrl;

    /** External reference identifier — e.g. invoice number, product ID. */
    @Column(name = "reference_id", length = 100)
    private String referenceId;

    /** Type of reference — e.g. "PRODUCT", "LPO", "INVOICE". */
    @Column(name = "reference_type", length = 50)
    private String referenceType;

    /** Optional TTL — cleanup job hard-deletes expired rows. */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public String getTargetUsername() { return targetUsername; }
    public void setTargetUsername(String targetUsername) { this.targetUsername = targetUsername; }

    public boolean isRead() { return isRead; }
    public void setRead(boolean read) { isRead = read; }

    public LocalDateTime getReadAt() { return readAt; }
    public void setReadAt(LocalDateTime readAt) { this.readAt = readAt; }

    public String getActionUrl() { return actionUrl; }
    public void setActionUrl(String actionUrl) { this.actionUrl = actionUrl; }

    public String getReferenceId() { return referenceId; }
    public void setReferenceId(String referenceId) { this.referenceId = referenceId; }

    public String getReferenceType() { return referenceType; }
    public void setReferenceType(String referenceType) { this.referenceType = referenceType; }

    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
}
