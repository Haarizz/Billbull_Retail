package com.billbull.backend.settings.outlet;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings/outlets")
@PreAuthorize("isAuthenticated()")
public class OutletController {

    private static final String MODULE = "userManagement";

    private final OutletService service;
    private final ModulePermissionService modulePermissionService;

    public OutletController(OutletService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<List<Outlet>> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAll());
    }

    @GetMapping("/branch/{branchId}")
    public ResponseEntity<List<Outlet>> getByBranch(@PathVariable Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getByBranch(branchId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Outlet> getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/branch/{branchId}")
    public ResponseEntity<Outlet> create(@PathVariable Long branchId, @RequestBody Outlet outlet) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(branchId, outlet));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Outlet> update(@PathVariable Long id, @RequestBody Outlet outlet) {
        modulePermissionService.requireCanEdit(MODULE);
        outlet.setId(id);
        return ResponseEntity.ok(service.save(outlet));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deactivate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.deactivate(id);
        return ResponseEntity.noContent().build();
    }
}
