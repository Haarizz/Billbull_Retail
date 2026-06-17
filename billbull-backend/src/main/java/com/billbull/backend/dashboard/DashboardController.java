package com.billbull.backend.dashboard;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private static final String MODULE = "dashboard";

    private final DashboardService dashboardService;
    private final ModulePermissionService modulePermissionService;

    public DashboardController(DashboardService dashboardService, ModulePermissionService modulePermissionService) {
        this.dashboardService = dashboardService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/summary")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<DashboardSummaryResponse> getSummary(
            @RequestParam(defaultValue = "All Time") String timeRange,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(dashboardService.getSummary(timeRange, branchId));
    }

    /** Force-clears the server-side cache and returns fresh data immediately. */
    @PostMapping("/summary/refresh")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<DashboardSummaryResponse> refresh(
            @RequestParam(defaultValue = "All Time") String timeRange,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        dashboardService.invalidateCache();
        return ResponseEntity.ok(dashboardService.getSummary(timeRange, branchId));
    }
}
