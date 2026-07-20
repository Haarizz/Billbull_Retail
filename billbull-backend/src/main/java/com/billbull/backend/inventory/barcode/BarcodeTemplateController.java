package com.billbull.backend.inventory.barcode;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/barcode-templates")
public class BarcodeTemplateController {

    private static final String MODULE = "inventory.barcode";

    private final BarcodeTemplateService service;
    private final ModulePermissionService modulePermissionService;

    public BarcodeTemplateController(BarcodeTemplateService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<BarcodeTemplate>> list() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAll());
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BarcodeTemplate> create(@RequestBody BarcodeTemplate template) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(template));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BarcodeTemplate> update(@PathVariable Long id, @RequestBody BarcodeTemplate template) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(id, template));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}
