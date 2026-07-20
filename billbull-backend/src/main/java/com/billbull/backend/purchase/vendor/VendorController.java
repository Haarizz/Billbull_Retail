package com.billbull.backend.purchase.vendor;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/vendors")
@PreAuthorize("isAuthenticated()")
public class VendorController {

    private static final String MODULE = "purchases.vendor";

    private final VendorService service;
    private final VendorImportService importService;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public VendorController(VendorService service, VendorImportService importService,
                            AuditLogService auditLogService,
                            ModulePermissionService modulePermissionService) {
        this.service = service;
        this.importService = importService;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    @PostMapping
    public Vendor create(@RequestBody VendorRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.create(req, false);
    }

    @PostMapping("/draft")
    public Vendor saveDraft(@RequestBody VendorRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.create(req, true);
    }

    @PutMapping("/{id}")
    public Vendor update(@PathVariable Long id, @RequestBody VendorRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.update(id, req);
    }

    @GetMapping
    public List<VendorListResponse> list(@RequestParam(required = false) String branchName) {
        modulePermissionService.requireCanView(MODULE);
        return service.list(branchName);
    }

    @PostMapping(value = "/import/excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public String importFromExcel(@RequestParam("file") MultipartFile file) {
        modulePermissionService.requireCanCreate(MODULE);
        return importService.importVendors(file);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
    }
}
