package com.billbull.backend.settings.branch;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;

import java.util.List;

@RestController
@RequestMapping("/api/branches")
public class BranchController {

    private static final String MODULE = "userManagement";

    private final BranchService service;
    private final ModulePermissionService modulePermissionService;

    public BranchController(BranchService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
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
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> update(@PathVariable Long id, @RequestBody BranchRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(id, req));
    }

    @PutMapping("/{id}/default")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> setDefault(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.setDefault(id));
    }

    @PutMapping("/{id}/headquarters")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> setHeadquarters(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.setHeadquarters(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/logo")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> uploadLogo(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.uploadLogo(id, file));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{id}/stamp")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BranchResponse> uploadStamp(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.uploadStamp(id, file));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
