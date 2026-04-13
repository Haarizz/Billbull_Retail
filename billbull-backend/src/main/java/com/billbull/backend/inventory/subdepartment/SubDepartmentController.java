package com.billbull.backend.inventory.subdepartment;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.InputStreamResource;
import java.io.ByteArrayInputStream;

@RestController
@RequestMapping("/api/sub-departments")
public class SubDepartmentController {

    private final SubDepartmentService service;
    private final SubDepartmentExportService exportService;
    private final AuditLogService auditLogService;

    public SubDepartmentController(SubDepartmentService service, SubDepartmentExportService exportService, AuditLogService auditLogService) {
        this.service = service;
        this.exportService = exportService;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public List<SubDepartmentResponse> list() {
        return service.list();
    }

    @GetMapping("/export/excel")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<InputStreamResource> exportSubDepartmentsToExcel() {
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
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<SubDepartmentResponse> create(
            @Valid @RequestBody SubDepartmentRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<SubDepartmentResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody SubDepartmentRequest req) {
        return ResponseEntity.ok(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}
