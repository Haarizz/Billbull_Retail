package com.billbull.backend.pos.held;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * POS Hold endpoints: park the current cart, list the session's held carts, and
 * recall one (which removes it from the held list and returns its cart payload).
 * All three are till operations and require the till permission.
 */
@RestController
@RequestMapping("/api/pos/held-sales")
@CrossOrigin
public class PosHeldSaleController {

    private final PosHeldSaleService service;
    private final ModulePermissionService modulePermissionService;

    public PosHeldSaleController(PosHeldSaleService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosHeldSale> hold(@RequestBody PosHeldSaleRequest request) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        return ResponseEntity.ok(service.hold(request));
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosHeldSale>> list(@RequestParam Long sessionId) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        return ResponseEntity.ok(service.listForSession(sessionId));
    }

    @PostMapping("/{id}/recall")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosHeldSale> recall(@PathVariable Long id) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        return ResponseEntity.ok(service.recall(id));
    }
}
