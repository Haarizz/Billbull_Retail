package com.billbull.backend.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/summary")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<DashboardSummaryResponse> getSummary(
            @RequestParam(defaultValue = "All Time") String timeRange) {
        return ResponseEntity.ok(dashboardService.getSummary(timeRange));
    }
}
