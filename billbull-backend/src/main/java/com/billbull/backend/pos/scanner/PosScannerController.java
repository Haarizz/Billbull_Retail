package com.billbull.backend.pos.scanner;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/pos/scanners")
@CrossOrigin
public class PosScannerController {

    private final PosScannerService service;

    public PosScannerController(PosScannerService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosScanner> list(@RequestParam(required = false) Long branchId) {
        return service.list(branchId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosScanner get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosScanner> create(@RequestBody PosScannerService.UpsertRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosScanner update(@PathVariable Long id, @RequestBody PosScannerService.UpsertRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> decommission(@PathVariable Long id) {
        service.decommission(id);
        return ResponseEntity.noContent().build();
    }
}
