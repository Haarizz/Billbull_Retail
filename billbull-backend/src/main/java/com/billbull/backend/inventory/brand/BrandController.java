package com.billbull.backend.inventory.brand;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.core.io.InputStreamResource;
import java.io.ByteArrayInputStream;
import java.util.List;

@RestController
@RequestMapping("/api/brands")
public class BrandController {

    private static final String MODULE = "inventory.category";

    private final BrandService service;
    private final BrandExportService exportService;
    private final ModulePermissionService modulePermissionService;

    public BrandController(BrandService service, BrandExportService exportService, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.exportService = exportService;
        this.modulePermissionService = modulePermissionService;
    }

    // ---------------------------
    // LIST (ONLY ONE GET)
    // ---------------------------
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<BrandResponse> list() {
        modulePermissionService.requireCanView(MODULE);
        return service.list();
    }

    @GetMapping("/export/excel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<InputStreamResource> exportBrandsToExcel() {
        modulePermissionService.requireCanExport(MODULE);
        List<BrandResponse> brands = service.list(); // Changed from getAll() to list() to match existing method
        ByteArrayInputStream in = exportService.export(brands);

        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Disposition", "attachment; filename=brands.xlsx");

        return ResponseEntity
                .ok()
                .headers(headers)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(new InputStreamResource(in));
    }

    // ---------------------------
    // CREATE
    // ---------------------------
    @PostMapping(consumes = "multipart/form-data")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BrandResponse> create(
            @RequestPart("data") BrandRequest req,
            @RequestPart(value = "logo", required = false) MultipartFile logo) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(req, logo));
    }

    // ---------------------------
    // UPDATE
    // ---------------------------
    @PutMapping(value = "/{id}", consumes = "multipart/form-data")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BrandResponse> update(
            @PathVariable Long id,
            @RequestPart("data") BrandRequest req,
            @RequestPart(value = "logo", required = false) MultipartFile logo) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(id, req, logo));
    }

    // ---------------------------
    // DELETE (ADMIN ONLY)
    // ---------------------------
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}
