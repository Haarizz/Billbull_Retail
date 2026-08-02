package com.billbull.backend.pos.admin;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.util.PageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration &gt; Transaction Corrections (Phase 4). RBAC
 * reuses the Phase 1-seeded modules exactly (no new permissions): {@code pos.admin.transaction}
 * gates viewing/requesting, {@code pos.admin.approvals} gates approve/reject/apply.
 */
@RestController
@RequestMapping("/api/pos/admin/transaction-corrections")
@CrossOrigin
public class PosTransactionCorrectionController {

    private static final String MODULE_TRANSACTION = "pos.admin.transaction";
    private static final String MODULE_APPROVALS = "pos.admin.approvals";

    private final PosTransactionCorrectionService service;
    private final ModulePermissionService modulePermissionService;

    public PosTransactionCorrectionController(PosTransactionCorrectionService service,
                                               ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<PosTransactionCorrectionResponse>> list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) CorrectionTargetType targetType,
            @RequestParam(required = false) CorrectionType correctionType,
            @RequestParam(required = false) Long targetId,
            @RequestParam(required = false) CorrectionRequestStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        modulePermissionService.requireCanView(MODULE_TRANSACTION);
        return ResponseEntity.ok(service.list(branchId, targetType, correctionType, targetId, status, page, size));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTransactionCorrectionResponse> getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_TRANSACTION);
        return ResponseEntity.ok(service.getById(id));
    }

    /** Original / corrected (if applied) / effective snapshot for a transaction — never
     *  regenerates any report snapshot, never touches the source row. */
    @GetMapping("/effective")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getEffective(
            @RequestParam CorrectionTargetType targetType, @RequestParam Long targetId) {
        modulePermissionService.requireCanView(MODULE_TRANSACTION);
        return ResponseEntity.ok(service.getEffective(targetType, targetId));
    }

    public static class CreateRequest {
        public CorrectionTargetType targetType;
        public Long targetId;
        public CorrectionType correctionType;
        public String reason;
        public String correctedCustomerCode;
        public String correctedPaymentMode;
        public BigDecimal correctedAmount;
        public String correctedInvoiceNumber;
        public Long correctedCategoryId;

        PosTransactionCorrectionService.CorrectionInput toInput() {
            var input = new PosTransactionCorrectionService.CorrectionInput();
            input.correctedCustomerCode = correctedCustomerCode;
            input.correctedPaymentMode = correctedPaymentMode;
            input.correctedAmount = correctedAmount;
            input.correctedInvoiceNumber = correctedInvoiceNumber;
            input.correctedCategoryId = correctedCategoryId;
            return input;
        }
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTransactionCorrectionResponse> create(@RequestBody CreateRequest body) {
        modulePermissionService.requireCanCreate(MODULE_TRANSACTION);
        return ResponseEntity.ok(service.request(body.targetType, body.targetId, body.correctionType, body.toInput(), body.reason));
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTransactionCorrectionResponse> submit(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_TRANSACTION);
        return ResponseEntity.ok(service.submitForApproval(id));
    }

    public static class ApproveRequest {
        public String notes;
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTransactionCorrectionResponse> approve(@PathVariable Long id, @RequestBody(required = false) ApproveRequest body) {
        modulePermissionService.requireCanApprove(MODULE_APPROVALS);
        return ResponseEntity.ok(service.approve(id, body != null ? body.notes : null));
    }

    public static class RejectRequest {
        public String reason;
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTransactionCorrectionResponse> reject(@PathVariable Long id, @RequestBody RejectRequest body) {
        modulePermissionService.requireCanApprove(MODULE_APPROVALS);
        return ResponseEntity.ok(service.reject(id, body.reason));
    }

    @PostMapping("/{id}/apply")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTransactionCorrectionResponse> apply(@PathVariable Long id) {
        modulePermissionService.requireCanApprove(MODULE_APPROVALS);
        return ResponseEntity.ok(service.apply(id));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTransactionCorrectionResponse> cancel(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE_TRANSACTION);
        return ResponseEntity.ok(service.cancel(id));
    }
}
