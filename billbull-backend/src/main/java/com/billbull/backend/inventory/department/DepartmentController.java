package com.billbull.backend.inventory.department;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.InputStreamResource;
import java.io.ByteArrayInputStream;

@RestController
@RequestMapping("/api")
public class DepartmentController {

    private static final String MODULE = "inventory";

    private final DepartmentService service;
    private final DepartmentExportService exportService;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public DepartmentController(DepartmentService service, DepartmentExportService exportService, AuditLogService auditLogService, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.exportService = exportService;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    // ================= DEPARTMENTS =================

    @GetMapping("/departments")
    @PreAuthorize("isAuthenticated()")
    public List<DepartmentResponse> getDepartments() {
        modulePermissionService.requireCanView(MODULE);
        return service.getAll();
    }

    @GetMapping("/departments/export/excel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<InputStreamResource> exportDepartmentsToExcel() {
        modulePermissionService.requireCanExport(MODULE);
        List<DepartmentResponse> departments = service.getAll();
        ByteArrayInputStream in = exportService.export(departments);

        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Disposition", "attachment; filename=departments.xlsx");

        return ResponseEntity
                .ok()
                .headers(headers)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(new InputStreamResource(in));
    }

    @PostMapping("/departments")
    @PreAuthorize("isAuthenticated()")
    public DepartmentResponse createDepartment(
            @RequestBody DepartmentRequest request) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.create(request);
    }

    @PutMapping("/departments/{id}")
    @PreAuthorize("isAuthenticated()")
    public DepartmentResponse updateDepartment(
            @PathVariable Long id,
            @RequestBody DepartmentRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.update(id, request);
    }

    @DeleteMapping("/departments/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteDepartment(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
    }

    @PostMapping("/departments/bulk-delete")
    @PreAuthorize("hasRole('ADMIN')")
    public void bulkDeleteDepartments(@RequestBody List<Long> ids) {
        modulePermissionService.requireCanEdit(MODULE);
        service.bulkDelete(ids);
    }
}
