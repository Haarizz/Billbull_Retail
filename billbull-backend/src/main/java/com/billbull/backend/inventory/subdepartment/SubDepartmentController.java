package com.billbull.backend.inventory.subdepartment;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.core.io.InputStreamResource;
import java.io.ByteArrayInputStream;

@RestController
@RequestMapping("/api/sub-departments")
public class SubDepartmentController {

    private static final String MODULE = "inventory";

    private final SubDepartmentService service;
    private final SubDepartmentExportService exportService;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public SubDepartmentController(SubDepartmentService service, SubDepartmentExportService exportService, AuditLogService auditLogService, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.exportService = exportService;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<SubDepartmentResponse> list() {
        modulePermissionService.requireCanView(MODULE);
        return service.list();
    }

    @GetMapping("/export/excel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<InputStreamResource> exportSubDepartmentsToExcel() {
        modulePermissionService.requireCanExport(MODULE);
        List<SubDepartmentResponse> subDepartments = service.list();
        ByteArrayInputStream in = exportService.export(subDepartments);

        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Disposition", "attachment; filename=sub_departments.xlsx");

        return ResponseEntity
                .ok()
                .headers(headers)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(new InputStreamResource(in));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SubDepartmentResponse> create(
            @Valid @RequestBody SubDepartmentRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SubDepartmentResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody SubDepartmentRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}
