package com.billbull.backend.purchase.returns;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/purchase/returns")
public class PurchaseReturnController {

    private static final String MODULE = "purchases";

    private final PurchaseReturnService purchaseReturnService;
    private final ModulePermissionService modulePermissionService;

    public PurchaseReturnController(PurchaseReturnService purchaseReturnService,
                                    ModulePermissionService modulePermissionService) {
        this.purchaseReturnService = purchaseReturnService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<PurchaseReturn> list(@RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        if (branchId != null) {
            return purchaseReturnService.findByBranch(branchId);
        }
        return purchaseReturnService.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<PurchaseReturn> get(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(purchaseReturnService.findById(id));
    }

    @PostMapping
    public ResponseEntity<PurchaseReturn> create(@RequestBody PurchaseReturn purchaseReturn) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(purchaseReturnService.create(purchaseReturn));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<PurchaseReturn> approve(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(purchaseReturnService.approve(id));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<PurchaseReturn> cancel(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(purchaseReturnService.cancel(id));
    }
}
