package com.billbull.backend.settings.branch;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/branches")
public class BranchController {

    private final BranchService service;

    public BranchController(BranchService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<BranchResponse>> list() {
        return ResponseEntity.ok(service.listAll());
    }

    @GetMapping("/default")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BranchResponse> getDefault() {
        BranchResponse def = service.getDefault();
        return def != null ? ResponseEntity.ok(def) : ResponseEntity.noContent().build();
    }

    @GetMapping("/headquarters")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BranchResponse> getHeadquarters() {
        BranchResponse hq = service.getHeadquarters();
        return hq != null ? ResponseEntity.ok(hq) : ResponseEntity.noContent().build();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> create(@RequestBody BranchRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> update(@PathVariable Long id, @RequestBody BranchRequest req) {
        return ResponseEntity.ok(service.update(id, req));
    }

    @PutMapping("/{id}/default")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> setDefault(@PathVariable Long id) {
        return ResponseEntity.ok(service.setDefault(id));
    }

    @PutMapping("/{id}/headquarters")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> setHeadquarters(@PathVariable Long id) {
        return ResponseEntity.ok(service.setHeadquarters(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
