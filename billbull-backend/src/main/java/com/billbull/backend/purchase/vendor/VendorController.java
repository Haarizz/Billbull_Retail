package com.billbull.backend.purchase.vendor;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/vendors")
@CrossOrigin
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
public class VendorController {

    private final VendorService service;
    private final VendorImportService importService;
    private final AuditLogService auditLogService;

    public VendorController(VendorService service, VendorImportService importService, AuditLogService auditLogService) {
        this.service = service;
        this.importService = importService;
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

    @PostMapping(value = "/import/excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public String importFromExcel(@RequestParam("file") MultipartFile file) {
        return importService.importVendors(file);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
