package com.billbull.backend.notification;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Lightweight DTO projected from {@link Notification} for API responses.
 * Includes a computed {@code timeAgo} string, who triggered the event ({@code actor*}),
 * where it happened ({@code branch*}) and the event's key facts ({@code details}).
 */
public class NotificationResponse {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {};

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
    private String actorUsername;
    private String actorName;
    private Long branchId;
    private String branchName;
    private Map<String, Object> details;

    // ── Factory ───────────────────────────────────────────────────────────────

    public static NotificationResponse from(Notification n) {
        return from(n, Collections.emptyMap(), Collections.emptyMap());
    }

    /**
     * @param fullNames   username → display name, resolved in one batch by the service
     * @param branchNames branch id → branch name, resolved in one batch by the service
     */
    public static NotificationResponse from(Notification n,
                                            Map<String, String> fullNames,
                                            Map<Long, String> branchNames) {
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
        r.actorUsername = actorOf(n);
        r.actorName = r.actorUsername != null
                ? fullNames.getOrDefault(r.actorUsername, r.actorUsername)
                : null;
        r.branchId = n.getBranchId();
        r.branchName = n.getBranchId() != null ? branchNames.get(n.getBranchId()) : null;
        r.details = parseDetails(n.getMetadata());
        return r;
    }

    /**
     * The user who triggered the event. {@code createdBy} is filled by JPA auditing from the
     * request's principal; scheduled jobs and seeders write without one, and those show as
     * system events (null actor) rather than as the literal auditor fallback.
     */
    static String actorOf(Notification n) {
        String by = n.getCreatedBy();
        if (by == null || by.isBlank()) return null;
        String lower = by.toLowerCase();
        if (lower.equals("system") || lower.equals("anonymous") || lower.equals("anonymoususer")) return null;
        return by;
    }

    static Map<String, Object> parseDetails(String metadata) {
        if (metadata == null || metadata.isBlank()) return Collections.emptyMap();
        try {
            return JSON.readValue(metadata, MAP_TYPE);
        } catch (Exception e) {
            return Collections.emptyMap(); // a malformed blob must never break the inbox
        }
    }

    // ── Time-ago with graceful fallback to dd-MM-yyyy ─────────────────────────

    private static String computeTimeAgo(LocalDateTime created) {
        if (created == null) return "";
        Duration dur = Duration.between(created, LocalDateTime.now());
        long seconds = dur.getSeconds();
        if (seconds < 60) return "just now";
        long minutes = seconds / 60;
        if (minutes < 60) return minutes + (minutes == 1 ? " min ago" : " mins ago");
        long hours = minutes / 60;
        if (hours < 24) return hours + (hours == 1 ? " hour ago" : " hours ago");
        long days = hours / 24;
        if (days == 1) return "Yesterday";
        if (days < 7) return days + " days ago";
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
    public String getActorUsername() { return actorUsername; }
    public String getActorName() { return actorName; }
    public Long getBranchId() { return branchId; }
    public String getBranchName() { return branchName; }
    public Map<String, Object> getDetails() { return details; }
}
