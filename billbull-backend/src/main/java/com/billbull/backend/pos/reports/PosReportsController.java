package com.billbull.backend.pos.reports;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.PageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;

/**
 * Back-office "POS Reports" module (Customers &amp; Sales &gt; Reports &gt; POS Reports) — read-only
 * historical browser over already-generated, immutable X-Report and Z-Report snapshots.
 * Never regenerates a report from live transactional data; list endpoints return summary
 * metadata only, detail endpoints return the exact stored snapshot. Same single-switch RBAC
 * mechanism as {@code PosCashMovementController}: {@code permissions.pos.reports.<action>}
 * rows checked via {@link ModulePermissionService}.
 */
@RestController
@RequestMapping("/api/pos/reports")
@CrossOrigin
public class PosReportsController {

    private static final String PERM_VIEW     = "permissions.pos.reports.view";
    private static final String PERM_VIEW_ALL = "permissions.pos.reports.viewall";
    private static final String PERM_EXPORT   = "permissions.pos.reports.export";
    private static final String PERM_PRINT    = "permissions.pos.reports.print";

    private final PosReportsService service;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;

    public PosReportsController(PosReportsService service, ModulePermissionService modulePermissionService,
                                 BranchAccessService branchAccessService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
    }

    /** Resolves the effective branch filter: viewall holders may query any branch (or all,
     *  when branchId is omitted); everyone else is pinned to their own current branch. */
    private Long resolveBranchFilter(Long requestedBranchId) {
        if (modulePermissionService.canView(PERM_VIEW_ALL)) {
            return requestedBranchId;
        }
        modulePermissionService.requireCanView(PERM_VIEW);
        return branchAccessService.getRequiredCurrentUserBranch().getId();
    }

    @GetMapping("/x")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<PosReportSummary>> listX(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) LocalDate dateFrom,
            @RequestParam(required = false) LocalDate dateTo,
            @RequestParam(required = false) String reportNumber,
            @RequestParam(required = false) String generatedBy,
            @RequestParam(required = false) String terminalId,
            @RequestParam(required = false) Long counterId,
            @RequestParam(required = false) String cashier,
            @RequestParam(required = false) Long sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Long effectiveBranchId = resolveBranchFilter(branchId);
        return ResponseEntity.ok(service.listX(effectiveBranchId, dateFrom, dateTo, reportNumber, generatedBy,
                terminalId, counterId, cashier, sessionId, page, size));
    }

    @GetMapping("/z")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<PosReportSummary>> listZ(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) LocalDate dateFrom,
            @RequestParam(required = false) LocalDate dateTo,
            @RequestParam(required = false) String reportNumber,
            @RequestParam(required = false) String generatedBy,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Long effectiveBranchId = resolveBranchFilter(branchId);
        return ResponseEntity.ok(service.listZ(effectiveBranchId, dateFrom, dateTo, reportNumber, generatedBy, page, size));
    }

    @GetMapping("/x/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosReportDetail> getXDetail(@PathVariable Long id) {
        requireViewAndOwnBranch();
        PosReportDetail detail = service.getXDetail(id);
        assertBranchVisible(detail.getBranchId());
        return ResponseEntity.ok(detail);
    }

    @GetMapping("/z/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosReportDetail> getZDetail(@PathVariable Long id) {
        requireViewAndOwnBranch();
        PosReportDetail detail = service.getZDetail(id);
        assertBranchVisible(detail.getBranchId());
        return ResponseEntity.ok(detail);
    }

    /** Hard gate before the frontend commits a report to print — mirrors the existing
     *  X/Z print-check gates in {@code PosSessionController}, kept separate here since
     *  a stored snapshot is by definition already generated/closed (nothing to check
     *  beyond the permission itself). */
    @PostMapping("/print-check")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> checkPrintable() {
        modulePermissionService.requireCan(canViewAllModule(), "view");
        modulePermissionService.requireCanView(PERM_PRINT);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/export-check")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> checkExportable() {
        modulePermissionService.requireCan(canViewAllModule(), "view");
        modulePermissionService.requireCanView(PERM_EXPORT);
        return ResponseEntity.noContent().build();
    }

    private String canViewAllModule() {
        return modulePermissionService.canView(PERM_VIEW_ALL) ? PERM_VIEW_ALL : PERM_VIEW;
    }

    private void requireViewAndOwnBranch() {
        if (!modulePermissionService.canView(PERM_VIEW_ALL)) {
            modulePermissionService.requireCanView(PERM_VIEW);
        }
    }

    private void assertBranchVisible(Long reportBranchId) {
        if (modulePermissionService.canView(PERM_VIEW_ALL)) return;
        Long ownBranchId = branchAccessService.getRequiredCurrentUserBranch().getId();
        if (reportBranchId == null || !reportBranchId.equals(ownBranchId)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,
                    "You do not have access to this report's branch.");
        }
    }
}
