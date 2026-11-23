package com.billbull.backend.notification;

import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * REST controller for in-app notifications.
 * All endpoints derive the target user from the JWT / Spring Security context —
 * no username parameter is ever accepted from the client.
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    /**
     * Paginated list of the authenticated user's notifications, newest first.
     *
     * @param category   optional: INVENTORY, SALES, PURCHASE, FINANCE, HR, POS, SYSTEM
     * @param unreadOnly if true, only unread notifications
     * @param type       optional: INFO, WARNING, SUCCESS, ERROR
     * @param priority   optional: LOW, MEDIUM, HIGH, CRITICAL, or URGENT (HIGH + CRITICAL)
     * @param q          optional text search over title, message, reference and actor
     * @param from       optional first day (inclusive, yyyy-MM-dd)
     * @param to         optional last day (inclusive, yyyy-MM-dd)
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public Page<NotificationResponse> getNotifications(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.getMyNotifications(page, size,
                new NotificationService.InboxFilter(category, unreadOnly, type, priority, q, from, to));
    }

    /** Lightweight unread count for the bell badge. Returns {@code { "count": N }}. */
    @GetMapping("/unread-count")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Long> getUnreadCount() {
        return Map.of("count", service.getUnreadCount());
    }

    /** Totals, unread per category, urgent unread and today's count. */
    @GetMapping("/summary")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> getSummary() {
        return service.getSummary();
    }

    /** Mark a single notification as read. */
    @PutMapping("/{id}/read")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<NotificationResponse> markAsRead(@PathVariable Long id) {
        return ResponseEntity.ok(service.markAsRead(id));
    }

    /** Bulk mark all (or one category) as read. Returns the count affected. */
    @PutMapping("/read-all")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Integer> markAllAsRead(@RequestParam(required = false) String category) {
        return Map.of("updated", service.markAllAsRead(category));
    }

    /** Mark the given notifications as read. Body: {@code { "ids": [1, 2, 3] }}. */
    @PutMapping("/read")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Integer> markManyAsRead(@RequestBody IdsRequest body) {
        return Map.of("updated", service.markManyAsRead(body != null ? body.ids() : List.of()));
    }

    /** Dismiss (soft-delete) a single notification. */
    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> dismiss(@PathVariable Long id) {
        service.dismiss(id);
        return ResponseEntity.noContent().build();
    }

    /** Dismiss the given notifications. Body: {@code { "ids": [1, 2, 3] }}. */
    @PostMapping("/dismiss")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Integer> dismissMany(@RequestBody IdsRequest body) {
        return Map.of("dismissed", service.dismissMany(body != null ? body.ids() : List.of()));
    }

    /** Dismiss every notification already read. */
    @DeleteMapping("/read")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Integer> dismissAllRead() {
        return Map.of("dismissed", service.dismissAllRead());
    }

    public record IdsRequest(List<Long> ids) {}
}
