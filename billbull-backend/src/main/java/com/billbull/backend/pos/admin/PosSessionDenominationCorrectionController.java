package com.billbull.backend.pos.admin;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.util.PageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration &gt; Session Denomination Corrections (Phase 3).
 * RBAC reuses the Phase 1-seeded modules exactly (no new permissions): {@code pos.admin.session}
 * gates viewing/requesting, {@code pos.admin.approvals} gates approve/reject/apply — the same
 * module already used for every other correction's approval decision.
 */
@RestController
@RequestMapping("/api/pos/admin/session-denomination-corrections")
@CrossOrigin
public class PosSessionDenominationCorrectionController {

    private static final String MODULE_SESSION = "pos.admin.session";
    private static final String MODULE_APPROVALS = "pos.admin.approvals";

    private final PosSessionDenominationCorrectionService service;
    private final ModulePermissionService modulePermissionService;

    public PosSessionDenominationCorrectionController(PosSessionDenominationCorrectionService service,
                                                       ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<PosSessionDenominationCorrectionResponse>> list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long sessionId,
            @RequestParam(required = false) CorrectionRequestStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        modulePermissionService.requireCanView(MODULE_SESSION);
        return ResponseEntity.ok(service.list(branchId, sessionId, status, page, size));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionDenominationCorrectionResponse> getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_SESSION);
        return ResponseEntity.ok(service.getById(id));
    }

    /** Original / corrected (if applied) / effective denomination overlay for a session —
     *  consumed by the correction request form (to show "Original Count") and anywhere else
     *  denomination data needs the effective view. Never regenerates any report snapshot. */
    @GetMapping("/session/{sessionId}/effective")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getEffective(@PathVariable Long sessionId) {
        modulePermissionService.requireCanView(MODULE_SESSION);
        return ResponseEntity.ok(service.getEffectiveDenomination(sessionId));
    }

    public static class CreateRequest {
        public Long sessionId;
        public Map<String, Integer> correctedDenominations;
        public String reason;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionDenominationCorrectionResponse> create(@RequestBody CreateRequest body) {
        modulePermissionService.requireCanCreate(MODULE_SESSION);
        return ResponseEntity.ok(service.request(body.sessionId, body.correctedDenominations, body.reason));
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionDenominationCorrectionResponse> submit(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_SESSION);
        return ResponseEntity.ok(service.submitForApproval(id));
    }

    public static class ApproveRequest {
        public String notes;
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionDenominationCorrectionResponse> approve(@PathVariable Long id, @RequestBody(required = false) ApproveRequest body) {
        modulePermissionService.requireCanApprove(MODULE_APPROVALS);
        return ResponseEntity.ok(service.approve(id, body != null ? body.notes : null));
    }

    public static class RejectRequest {
        public String reason;
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionDenominationCorrectionResponse> reject(@PathVariable Long id, @RequestBody RejectRequest body) {
        modulePermissionService.requireCanApprove(MODULE_APPROVALS);
        return ResponseEntity.ok(service.reject(id, body.reason));
    }

    @PostMapping("/{id}/apply")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionDenominationCorrectionResponse> apply(@PathVariable Long id) {
        modulePermissionService.requireCanApprove(MODULE_APPROVALS);
        return ResponseEntity.ok(service.apply(id));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionDenominationCorrectionResponse> cancel(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_SESSION);
        return ResponseEntity.ok(service.cancel(id));
    }
}
