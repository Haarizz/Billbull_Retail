package com.billbull.backend.inventory.units;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import org.springframework.core.io.InputStreamResource;
import java.io.ByteArrayInputStream;
import java.util.List;

@RestController
@RequestMapping("/api/units")
public class UnitController {

    private final UnitService service;
    private final UnitExportService exportService;

    public UnitController(UnitService service, UnitExportService exportService) {
        this.service = service;
        this.exportService = exportService;
    }

    // ------------------------
    // LIST
    // ------------------------
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<UnitResponse> list() {
        return service.list();
    }

    @GetMapping("/export/excel")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<InputStreamResource> exportUnitsToExcel() {
        List<UnitResponse> units = service.list();
        ByteArrayInputStream in = exportService.export(units);

        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Disposition", "attachment; filename=units.xlsx");

        return ResponseEntity
                .ok()
                .headers(headers)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(new InputStreamResource(in));
    }

    // ------------------------
    // CREATE
    // ------------------------
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UnitResponse> create(
            @Valid @RequestBody UnitRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    // ------------------------
    // UPDATE
    // ------------------------
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UnitResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody UnitRequest req) {
        return ResponseEntity.ok(service.update(id, req));
    }

    // ------------------------
    // DELETE
    // ------------------------
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
