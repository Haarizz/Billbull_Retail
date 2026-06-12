package com.billbull.backend.financials.period;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/financials/fiscal-years")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class FiscalYearController {

    private static final String MODULE = "finance";

    private final FiscalYearService service;
    private final ModulePermissionService modulePermissionService;

    public FiscalYearController(FiscalYearService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<List<FiscalYear>> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<FiscalYear> getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<FiscalYear> create(@RequestBody FiscalYear fy) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(fy));
    }

    @PostMapping("/{id}/begin-close")
    public ResponseEntity<FiscalYear> beginClose(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        modulePermissionService.requireCanEdit(MODULE);
        String by = payload != null ? payload.getOrDefault("by", "System") : "System";
        return ResponseEntity.ok(service.beginClose(id, by));
    }

    @PostMapping("/{id}/finalise-close")
    public ResponseEntity<FiscalYear> finaliseClose(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        modulePermissionService.requireCanEdit(MODULE);
        String by = payload != null ? payload.getOrDefault("by", "System") : "System";
        return ResponseEntity.ok(service.finaliseClose(id, by));
    }
}
