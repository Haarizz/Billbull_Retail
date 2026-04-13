package com.billbull.backend.inventory.brand;

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

    private final BrandService service;
    private final BrandExportService exportService;

    public BrandController(BrandService service, BrandExportService exportService) {
        this.service = service;
        this.exportService = exportService;
    }

    // ---------------------------
    // LIST (ONLY ONE GET)
    // ---------------------------
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','SALES','ACCOUNTANT','PURCHASE_MANAGER')")
    public List<BrandResponse> list() {
        return service.list();
    }

    @GetMapping("/export/excel")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<InputStreamResource> exportBrandsToExcel() {
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
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<BrandResponse> create(
            @RequestPart("data") BrandRequest req,
            @RequestPart(value = "logo", required = false) MultipartFile logo) {
        return ResponseEntity.ok(service.create(req, logo));
    }

    // ---------------------------
    // UPDATE
    // ---------------------------
    @PutMapping(value = "/{id}", consumes = "multipart/form-data")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<BrandResponse> update(
            @PathVariable Long id,
            @RequestPart("data") BrandRequest req,
            @RequestPart(value = "logo", required = false) MultipartFile logo) {
        return ResponseEntity.ok(service.update(id, req, logo));
    }

    // ---------------------------
    // DELETE (ADMIN ONLY)
    // ---------------------------
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}
