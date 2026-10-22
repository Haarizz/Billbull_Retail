package com.billbull.backend.pos.cashdrawer;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Cash drawer configuration and kick outcomes.
 *
 * <p>Reading drawers is for the till ({@code sales.pos}) or a device administrator
 * ({@code pos.devices}). Recording a kick outcome is a till operation. Adding, changing and
 * decommissioning a drawer is device administration: {@code pos.devices} create, edit or delete.
 * Every call is limited to drawers of a branch the caller may act on, judged on the stored
 * drawer, and on the requested branch for a write.
 *
 * <p>This controller never opens a drawer. The kick rides the receipt printer: the local print
 * agent, or {@code POST /api/pos/printers/{id}/print/escpos} for a network printer.
 */
@RestController
@RequestMapping("/api/pos/cash-drawers")
@CrossOrigin
public class PosCashDrawerController {

    static final String DEVICE_ADMIN = "pos.devices";
    private static final String LABEL = "Cash drawer";

    private final PosCashDrawerService service;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;

    public PosCashDrawerController(PosCashDrawerService service, ModulePermissionService modulePermissionService,
                                   BranchAccessService branchAccessService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
    }

    private void requireDrawerInScope(Long id) {
        branchAccessService.assertTransactionBranchAccessible(service.get(id).getBranchId(), LABEL);
    }

    private void requireRequestBranchInScope(PosCashDrawerService.UpsertRequest req) {
        branchAccessService.assertTransactionBranchAccessible(req != null ? req.branchId() : null, LABEL);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosCashDrawer> list(@RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanViewAny(PosTillPermission.MODULE, DEVICE_ADMIN);
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        return service.list(branchId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosCashDrawer get(@PathVariable Long id) {
        modulePermissionService.requireCanViewAny(PosTillPermission.MODULE, DEVICE_ADMIN);
        requireDrawerInScope(id);
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashDrawer> create(@RequestBody PosCashDrawerService.UpsertRequest req) {
        modulePermissionService.requireCanCreate(DEVICE_ADMIN);
        requireRequestBranchInScope(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosCashDrawer update(@PathVariable Long id, @RequestBody PosCashDrawerService.UpsertRequest req) {
        modulePermissionService.requireCanEdit(DEVICE_ADMIN);
        requireDrawerInScope(id);
        requireRequestBranchInScope(req);
        return service.update(id, req);
    }

    @PutMapping("/{id}/kick-result")
    @PreAuthorize("isAuthenticated()")
    public PosCashDrawer kickResult(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        requireDrawerInScope(id);
        return service.recordKickResult(id, Boolean.TRUE.equals(body.get("success")));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> decommission(@PathVariable Long id) {
        modulePermissionService.requireCanDelete(DEVICE_ADMIN);
        requireDrawerInScope(id);
        service.decommission(id);
        return ResponseEntity.noContent().build();
    }
}
