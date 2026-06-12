package com.billbull.backend.notification;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller for in-app notifications.
 * All endpoints derive the target user from the JWT / Spring Security context —
 * no username parameter is ever accepted from the client.
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private static final String MODULE = "notification";

    private final NotificationService service;
    private final ModulePermissionService modulePermissionService;

    public NotificationController(NotificationService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    /**
     * Paginated list of the authenticated user's notifications.
     *
     * @param page       zero-based page index (default 0)
     * @param size       page size (default 20, max 50)
     * @param category   optional filter: INVENTORY, SALES, PURCHASE, FINANCE, HR, SYSTEM
     * @param unreadOnly if "true", return only unread notifications
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public Page<NotificationResponse> getNotifications(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "false") boolean unreadOnly) {
        modulePermissionService.requireCanView(MODULE);
        return service.getMyNotifications(page, size, category, unreadOnly);
    }

    /**
     * Lightweight unread count for the bell badge.
     * Returns {@code { "count": N }}.
     */
    @GetMapping("/unread-count")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Long> getUnreadCount() {
        modulePermissionService.requireCanView(MODULE);
        return Map.of("count", service.getUnreadCount());
    }

    /** Mark a single notification as read. */
    @PutMapping("/{id}/read")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<NotificationResponse> markAsRead(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.markAsRead(id));
    }

    /** Bulk mark all notifications as read. Returns the count affected. */
    @PutMapping("/read-all")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Integer> markAllAsRead() {
        modulePermissionService.requireCanEdit(MODULE);
        return Map.of("updated", service.markAllAsRead());
    }

    /** Dismiss (soft-delete) a single notification. */
    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> dismiss(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.dismiss(id);
        return ResponseEntity.noContent().build();
    }
}
