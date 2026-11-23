package com.billbull.backend.activity;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * User activity feed. Visibility is decided server-side from the caller's roles and branch
 * context (see {@link ActivityService}); nothing the client sends can widen it.
 */
@RestController
@RequestMapping("/api/activity")
@PreAuthorize("isAuthenticated()")
public class ActivityController {

    private final ActivityService service;

    public ActivityController(ActivityService service) {
        this.service = service;
    }

    /**
     * Newest-first page of readable activity entries.
     * Returns {@code { content, page, size, hasMore, scope }}.
     *
     * @param module  AUTH, POS, SALES, INVENTORY, PURCHASE, FINANCE, HR, ADMIN or OTHER
     * @param outcome SUCCESS or FAILED
     */
    @GetMapping
    public Map<String, Object> feed(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.getFeed(page, size,
                new ActivityService.ActivityFilter(username, module, outcome, from, to, branchId, q));
    }

    /** Header numbers and timeline for the last {@code days} days (1 = today, max 31). */
    @GetMapping("/summary")
    public Map<String, Object> summary(
            @RequestParam(defaultValue = "1") int days,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) Long branchId) {
        return service.getSummary(days,
                new ActivityService.ActivityFilter(username, module, null, null, null, branchId, null));
    }

    /** People the caller can filter the feed by. */
    @GetMapping("/people")
    public List<Map<String, Object>> people() {
        return service.getPeople();
    }
}
