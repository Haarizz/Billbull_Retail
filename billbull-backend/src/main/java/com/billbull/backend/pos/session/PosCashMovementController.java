package com.billbull.backend.pos.session;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.util.PageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Back-office "Cash Drop / Outs" module (Customers &amp; Sales &gt; Cash Drop / Outs) — list/view/
 * limited-edit/void for {@link PosCashMovement}. This is deliberately a separate controller from
 * {@link PosSessionController#addCashMovement}, which stays untouched (still {@code
 * isAuthenticated()} only) so the existing POS terminal "Cash Drawer" create flow keeps working
 * exactly as before for every role already using it (no breaking changes, §12 of the
 * requirement). New endpoints here follow the same RBAC pattern as {@code
 * PosTerminalController}: single-switch {@code permissions.pos.cashmovement.<action>} rows
 * checked via {@link ModulePermissionService}, not a hardcoded role list.
 */
@RestController
@RequestMapping("/api/pos/cash-movements")
@CrossOrigin
public class PosCashMovementController {

    private static final String PERM_CREATE   = "permissions.pos.cashmovement.create";
    private static final String PERM_VIEW     = "permissions.pos.cashmovement.view";
    private static final String PERM_VIEW_ALL = "permissions.pos.cashmovement.viewall";
    private static final String PERM_EDIT     = "permissions.pos.cashmovement.edit";
    private static final String PERM_VOID     = "permissions.pos.cashmovement.void";

    private final PosCashMovementService service;
    private final ModulePermissionService modulePermissionService;

    public PosCashMovementController(PosCashMovementService service,
                                      ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    private void requireAction(String permissionKey) {
        modulePermissionService.requireCanView(permissionKey);
    }

    /** Cashiers hold {@code view} (their own session only, enforced by requiring a
     *  {@code sessionId} filter) but not {@code viewall} (branch/cross-session history) —
     *  Supervisor/Manager/Admin hold both. */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<PosCashMovementResponse>> list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long sessionId,
            @RequestParam(required = false) PosCashMovementStatus status,
            @RequestParam(required = false) PosCashMovementType movementType,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate,
            @RequestParam(required = false) String performedBy,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (modulePermissionService.canView(PERM_VIEW_ALL)) {
            requireAction(PERM_VIEW_ALL);
        } else {
            requireAction(PERM_VIEW);
            if (sessionId == null) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                        "sessionId is required for users without cross-session view access.");
            }
        }
        return ResponseEntity.ok(service.list(branchId, sessionId, status, movementType,
                fromDate, toDate, performedBy, page, size));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementResponse> getById(@PathVariable Long id) {
        requireAction(modulePermissionService.canView(PERM_VIEW_ALL) ? PERM_VIEW_ALL : PERM_VIEW);
        return ResponseEntity.ok(service.getById(id));
    }

    public static class CreateRequest {
        public Long sessionId;
        public String movementType;
        public BigDecimal amount;
        public String description;
        public String reference;
        /** Optional unless the branch's PosSettings.requireCashMovementCategory toggle is on
         *  (Phase 2) — service/session layer enforces that, not this DTO. */
        public Long categoryId;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementResponse> create(@RequestBody CreateRequest body) {
        requireAction(PERM_CREATE);
        return ResponseEntity.ok(service.create(body.sessionId, body.movementType, body.amount,
                body.description, body.reference, body.categoryId));
    }

    public static class EditRequest {
        public String description;
        public String reference;
    }

    /** Limited edit — description/reference only; the service layer rejects everything else
     *  by construction (there is no way to pass amount/type/session through this DTO). */
    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementResponse> edit(@PathVariable Long id, @RequestBody EditRequest body) {
        requireAction(PERM_EDIT);
        return ResponseEntity.ok(service.edit(id, body.description, body.reference));
    }

    public static class VoidRequest {
        public String voidReason;
    }

    @PostMapping("/{id}/void")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementResponse> voidMovement(@PathVariable Long id, @RequestBody VoidRequest body) {
        requireAction(PERM_VOID);
        return ResponseEntity.ok(service.voidMovement(id, body.voidReason));
    }
}
