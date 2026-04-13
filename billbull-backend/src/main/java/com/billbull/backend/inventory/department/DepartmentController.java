package com.billbull.backend.inventory.department;

import com.billbull.backend.security.AuditLogService;
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

    private final DepartmentService service;
    private final DepartmentExportService exportService;
    private final AuditLogService auditLogService;

    public DepartmentController(DepartmentService service, DepartmentExportService exportService, AuditLogService auditLogService) {
        this.service = service;
        this.exportService = exportService;
        this.auditLogService = auditLogService;
    }

    // ================= DEPARTMENTS =================

    @GetMapping("/departments")
    @PreAuthorize("hasAnyRole('ADMIN', 'INVENTORY_MANAGER')")
    public List<DepartmentResponse> getDepartments() {
        return service.getAll();
    }

    @GetMapping("/departments/export/excel")
    @PreAuthorize("hasAnyRole('ADMIN', 'INVENTORY_MANAGER')")
    public ResponseEntity<InputStreamResource> exportDepartmentsToExcel() {
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
    @PreAuthorize("hasAnyRole('ADMIN', 'INVENTORY_MANAGER')")
    public DepartmentResponse createDepartment(
            @RequestBody DepartmentRequest request) {
        return service.create(request);
    }

    @PutMapping("/departments/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'INVENTORY_MANAGER')")
    public DepartmentResponse updateDepartment(
            @PathVariable Long id,
            @RequestBody DepartmentRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/departments/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteDepartment(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/departments/bulk-delete")
    @PreAuthorize("hasRole('ADMIN')")
    public void bulkDeleteDepartments(@RequestBody List<Long> ids) {
        service.bulkDelete(ids);
    }
}
