package com.billbull.backend.purchase.vendor;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vendors")
@CrossOrigin
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
public class VendorController {

    private final VendorService service;
    private final AuditLogService auditLogService;

    public VendorController(VendorService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @PostMapping
    public Vendor create(@RequestBody VendorRequest req) {
        return service.create(req, false);
    }

    @PostMapping("/draft")
    public Vendor saveDraft(@RequestBody VendorRequest req) {
        return service.create(req, true);
    }

    @PutMapping("/{id}")
    public Vendor update(@PathVariable Long id, @RequestBody VendorRequest req) {
        return service.update(id, req);
    }

    @GetMapping
    public List<VendorListResponse> list() {
        return service.list();
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
