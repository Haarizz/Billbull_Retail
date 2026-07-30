package com.billbull.backend.pos.admin;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.util.PageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * Enterprise Console &gt; POS Administration — Phase 1 backend surface: generic correction
 * request/approval lifecycle only (architectural review §5/§8/§15 Phase 1). No
 * denomination/transaction correction business logic lives here yet (Phase 3/4);
 * this controller only manages {@link CorrectionRequest} rows themselves.
 *
 * <p>RBAC follows the same pattern as {@code PosTerminalController}/{@code
 * PosCashMovementController}: {@code @PreAuthorize("isAuthenticated()")} only at the Spring
 * layer, with single-switch {@code pos.admin.*} module rows checked manually via {@link
 * ModulePermissionService} inside each method — never a hardcoded role list.
 */
@RestController
@RequestMapping("/api/pos/admin/corrections")
@CrossOrigin
public class PosAdminController {

    private static final String MODULE_BASE        = "pos.admin";
    private static final String MODULE_SESSION      = "pos.admin.session";
    private static final String MODULE_TRANSACTION  = "pos.admin.transaction";
    private static final String MODULE_APPROVALS    = "pos.admin.approvals";

    private final CorrectionRequestService service;
    private final ModulePermissionService modulePermissionService;

    public PosAdminController(CorrectionRequestService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<CorrectionRequestResponse>> list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) CorrectionRequestStatus status,
            @RequestParam(required = false) CorrectionTargetType targetType,
            @RequestParam(required = false) CorrectionType correctionType,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        modulePermissionService.requireCanView(MODULE_BASE);
        return ResponseEntity.ok(service.list(branchId, status, targetType, correctionType, page, size));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CorrectionRequestResponse> getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_BASE);
        return ResponseEntity.ok(service.getById(id));
    }

    public static class CreateRequest {
        public CorrectionTargetType targetType;
        public Long targetId;
        public CorrectionType correctionType;
        public String originalValuesJson;
        public String proposedValuesJson;
        public String reason;
        public Long branchId;
        public LocalDate businessDate;
    }

    /** Requires create access on the target-appropriate correction module. Session-denomination
     *  and cash-movement-category corrections aren't reachable via any UI yet (Phase 2/3), but
     *  the endpoint itself is generic across target types, so it checks the transaction-correct
     *  permission for any non-session target and the session-correct permission for POS_SESSION/
     *  X_REPORT/Z_REPORT/DAY_CLOSE targets. */
    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CorrectionRequestResponse> create(@RequestBody CreateRequest body) {
        String module = isSessionScoped(body.targetType) ? MODULE_SESSION : MODULE_TRANSACTION;
        modulePermissionService.requireCanCreate(module);
        return ResponseEntity.ok(service.create(body.targetType, body.targetId, body.correctionType,
                body.originalValuesJson, body.proposedValuesJson, body.reason, body.branchId, body.businessDate));
    }

    private boolean isSessionScoped(CorrectionTargetType targetType) {
        return targetType == CorrectionTargetType.POS_SESSION
                || targetType == CorrectionTargetType.X_REPORT
                || targetType == CorrectionTargetType.Z_REPORT
                || targetType == CorrectionTargetType.DAY_CLOSE;
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CorrectionRequestResponse> submit(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_BASE);
        return ResponseEntity.ok(service.submitForApproval(id));
    }

    public static class ApproveRequest {
        public String notes;
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CorrectionRequestResponse> approve(@PathVariable Long id, @RequestBody(required = false) ApproveRequest body) {
        modulePermissionService.requireCanApprove(MODULE_APPROVALS);
        return ResponseEntity.ok(service.approve(id, body != null ? body.notes : null));
    }

    public static class RejectRequest {
        public String reason;
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CorrectionRequestResponse> reject(@PathVariable Long id, @RequestBody RejectRequest body) {
        modulePermissionService.requireCanApprove(MODULE_APPROVALS);
        return ResponseEntity.ok(service.reject(id, body.reason));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CorrectionRequestResponse> cancel(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_BASE);
        return ResponseEntity.ok(service.cancel(id));
    }
}
