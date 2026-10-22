package com.billbull.backend.pos.scanner;

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

/**
 * Barcode scanner configuration.
 *
 * <p>Reading scanners is for the till ({@code sales.pos}, whose console lists them) or a scanner
 * administrator ({@code pos.scanners} view). Adding, changing and decommissioning a scanner is
 * administration: {@code pos.scanners} create, edit or delete. Every call is limited to scanners
 * of a branch the caller may act on, judged on the stored scanner, and on the requested branch
 * for a write.
 */
@RestController
@RequestMapping("/api/pos/scanners")
@CrossOrigin
public class PosScannerController {

    static final String SCANNER_ADMIN = "pos.scanners";
    private static final String LABEL = "Scanner";

    private final PosScannerService service;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;

    public PosScannerController(PosScannerService service, ModulePermissionService modulePermissionService,
                                BranchAccessService branchAccessService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
    }

    private void requireScannerInScope(Long id) {
        branchAccessService.assertTransactionBranchAccessible(service.get(id).getBranchId(), LABEL);
    }

    private void requireRequestBranchInScope(PosScannerService.UpsertRequest req) {
        branchAccessService.assertTransactionBranchAccessible(req != null ? req.branchId() : null, LABEL);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosScanner> list(@RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanViewAny(PosTillPermission.MODULE, SCANNER_ADMIN);
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        return service.list(branchId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosScanner get(@PathVariable Long id) {
        modulePermissionService.requireCanViewAny(PosTillPermission.MODULE, SCANNER_ADMIN);
        requireScannerInScope(id);
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosScanner> create(@RequestBody PosScannerService.UpsertRequest req) {
        modulePermissionService.requireCanCreate(SCANNER_ADMIN);
        requireRequestBranchInScope(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosScanner update(@PathVariable Long id, @RequestBody PosScannerService.UpsertRequest req) {
        modulePermissionService.requireCanEdit(SCANNER_ADMIN);
        requireScannerInScope(id);
        requireRequestBranchInScope(req);
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> decommission(@PathVariable Long id) {
        modulePermissionService.requireCanDelete(SCANNER_ADMIN);
        requireScannerInScope(id);
        service.decommission(id);
        return ResponseEntity.noContent().build();
    }
}
