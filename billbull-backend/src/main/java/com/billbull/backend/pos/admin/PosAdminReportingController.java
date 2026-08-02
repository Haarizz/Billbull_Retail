package com.billbull.backend.pos.admin;

import com.billbull.backend.financials.audit.FinancialAuditLog;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.util.PageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration &gt; Reporting (Phase 5). Every endpoint here is
 * read-only — no correction workflow, no GL posting, no mutation of any historical record.
 * RBAC reuses the modules already seeded in Phase 1 (no new permissions): {@code pos.admin}
 * (view) gates dashboard/history/analytics/effective; {@code pos.admin.audit} gates the Audit
 * View specifically, matching its existing view-only grant to ADMIN/BRANCH_ADMIN/ACCOUNTANT.
 */
@RestController
@RequestMapping("/api/pos/admin/reporting")
@CrossOrigin
public class PosAdminReportingController {

    private static final String MODULE_VIEW = "pos.admin";
    private static final String MODULE_AUDIT = "pos.admin.audit";

    private final CorrectionDashboardService dashboardService;
    private final CorrectionHistoryService historyService;
    private final CorrectionAnalyticsService analyticsService;
    private final PosAdminAuditService auditService;
    private final EffectiveCorrectionViewService effectiveViewService;
    private final ModulePermissionService modulePermissionService;

    public PosAdminReportingController(CorrectionDashboardService dashboardService,
                                        CorrectionHistoryService historyService,
                                        CorrectionAnalyticsService analyticsService,
                                        PosAdminAuditService auditService,
                                        EffectiveCorrectionViewService effectiveViewService,
                                        ModulePermissionService modulePermissionService) {
        this.dashboardService = dashboardService;
        this.historyService = historyService;
        this.analyticsService = analyticsService;
        this.auditService = auditService;
        this.effectiveViewService = effectiveViewService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/dashboard")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CorrectionDashboardResponse> getDashboard() {
        modulePermissionService.requireCanView(MODULE_VIEW);
        return ResponseEntity.ok(dashboardService.getDashboard());
    }

    @GetMapping("/history")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<CorrectionRequestResponse>> getHistory(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) CorrectionRequestStatus status,
            @RequestParam(required = false) CorrectionTargetType targetType,
            @RequestParam(required = false) CorrectionType correctionType,
            @RequestParam(required = false) Long targetId,
            @RequestParam(required = false) String requestedBy,
            @RequestParam(required = false) String approvedBy,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        modulePermissionService.requireCanView(MODULE_VIEW);
        return ResponseEntity.ok(historyService.search(branchId, status, targetType, correctionType, targetId,
                requestedBy, approvedBy, fromDate, toDate, search, page, size));
    }

    @GetMapping("/analytics")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CorrectionAnalyticsResponse> getAnalytics() {
        modulePermissionService.requireCanView(MODULE_VIEW);
        return ResponseEntity.ok(analyticsService.getAnalytics());
    }

    /** Original / corrected (if applied) / effective view for any correction target — the one
     *  entry point every screen should use instead of hand-rolling overlay logic. */
    @GetMapping("/effective")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getEffective(
            @RequestParam CorrectionTargetType targetType, @RequestParam Long targetId) {
        modulePermissionService.requireCanView(MODULE_VIEW);
        return ResponseEntity.ok(effectiveViewService.getEffectiveView(targetType, targetId));
    }

    @GetMapping("/audit/recent")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<FinancialAuditLog>> getRecentAudit(@RequestParam(defaultValue = "100") int limit) {
        modulePermissionService.requireCanView(MODULE_AUDIT);
        return ResponseEntity.ok(auditService.getRecentAuditActivity(limit));
    }

    @GetMapping("/audit/request/{requestNumber}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getAuditForRequest(@PathVariable String requestNumber,
                                                                   @RequestParam Long correctionRequestId) {
        modulePermissionService.requireCanView(MODULE_AUDIT);
        return ResponseEntity.ok(Map.of(
                "auditTrail", auditService.getAuditTrailForRequest(requestNumber),
                "linkedJournals", auditService.getLinkedJournalsForCorrectionRequest(correctionRequestId)));
    }

    @GetMapping("/audit/category/{code}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<FinancialAuditLog>> getCategoryAudit(@PathVariable String code) {
        modulePermissionService.requireCanView(MODULE_AUDIT);
        return ResponseEntity.ok(auditService.getCategoryAuditTrail(code));
    }
}
