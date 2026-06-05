package com.billbull.backend.settings.outlet;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings/outlets")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
public class OutletController {

    private final OutletService service;

    public OutletController(OutletService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<Outlet>> getAll() {
        return ResponseEntity.ok(service.getAll());
    }

    @GetMapping("/branch/{branchId}")
    public ResponseEntity<List<Outlet>> getByBranch(@PathVariable Long branchId) {
        return ResponseEntity.ok(service.getByBranch(branchId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Outlet> getById(@PathVariable Long id) {
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/branch/{branchId}")
    public ResponseEntity<Outlet> create(@PathVariable Long branchId, @RequestBody Outlet outlet) {
        return ResponseEntity.ok(service.create(branchId, outlet));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Outlet> update(@PathVariable Long id, @RequestBody Outlet outlet) {
        outlet.setId(id);
        return ResponseEntity.ok(service.save(outlet));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deactivate(@PathVariable Long id) {
        service.deactivate(id);
        return ResponseEntity.noContent().build();
    }
}
