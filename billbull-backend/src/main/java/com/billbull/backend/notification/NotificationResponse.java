package com.billbull.backend.notification;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * Lightweight DTO projected from {@link Notification} for API responses.
 * Includes a computed {@code timeAgo} string for UI convenience.
 */
public class NotificationResponse {

    private Long id;
    private String title;
    private String message;
    private String type;
    private String category;
    private String priority;
    private boolean read;
    private LocalDateTime readAt;
    private String actionUrl;
    private String referenceId;
    private String referenceType;
    private LocalDateTime createdAt;
    private String timeAgo;

    // ── Factory ───────────────────────────────────────────────────────────────

    public static NotificationResponse from(Notification n) {
        NotificationResponse r = new NotificationResponse();
        r.id = n.getId();
        r.title = n.getTitle();
        r.message = n.getMessage();
        r.type = n.getType();
        r.category = n.getCategory();
        r.priority = n.getPriority();
        r.read = n.isRead();
        r.readAt = n.getReadAt();
        r.actionUrl = n.getActionUrl();
        r.referenceId = n.getReferenceId();
        r.referenceType = n.getReferenceType();
        r.createdAt = n.getCreatedAt();
        r.timeAgo = computeTimeAgo(n.getCreatedAt());
        return r;
    }

    // ── Time-ago with graceful fallback to dd-MM-yyyy ─────────────────────────

    private static String computeTimeAgo(LocalDateTime created) {
        if (created == null) return "";
        Duration dur = Duration.between(created, LocalDateTime.now());
        long seconds = dur.getSeconds();
        if (seconds < 0) return "just now";
        if (seconds < 60) return "just now";
        long minutes = seconds / 60;
        if (minutes < 60) return minutes + (minutes == 1 ? " min ago" : " mins ago");
        long hours = minutes / 60;
        if (hours < 24) return hours + (hours == 1 ? " hour ago" : " hours ago");
        long days = hours / 24;
        if (days == 1) return "Yesterday";
        if (days < 7) return days + " days ago";
        // Fall back to dd-MM-yyyy for older notifications
        return String.format("%02d-%02d-%d",
                created.getDayOfMonth(), created.getMonthValue(), created.getYear());
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public String getMessage() { return message; }
    public String getType() { return type; }
    public String getCategory() { return category; }
    public String getPriority() { return priority; }
    public boolean isRead() { return read; }
    public LocalDateTime getReadAt() { return readAt; }
    public String getActionUrl() { return actionUrl; }
    public String getReferenceId() { return referenceId; }
    public String getReferenceType() { return referenceType; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public String getTimeAgo() { return timeAgo; }
}
