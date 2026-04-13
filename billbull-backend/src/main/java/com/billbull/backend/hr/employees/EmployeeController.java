package com.billbull.backend.hr.employees;

import com.billbull.backend.security.AuditLogService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/employees")
@PreAuthorize("hasAnyRole('ADMIN', 'HR')")
public class EmployeeController {

    private final EmployeeService service;
    private final ObjectMapper mapper;
    private final AuditLogService auditLogService;

    public EmployeeController(EmployeeService service, ObjectMapper mapper, AuditLogService auditLogService) {
        this.service = service;
        this.mapper = mapper;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<Employee> getAll() {
        return service.getAll();
    }

    @GetMapping("/{id}")
    public Employee getById(@PathVariable Long id, HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/employees/" + id, "GET", request);
        return service.getById(id);
    }

    @GetMapping("/active")
    public List<Employee> activeEmployees() {
        return service.getActiveEmployees();
    }

    @GetMapping("/pending")
    public List<Employee> pendingEmployees() {
        return service.getPendingEmployees();
    }

    @PostMapping
    public ResponseEntity<Employee> create(
            @RequestPart("employee") String employeeJson,
            @RequestPart(value = "avatar", required = false) MultipartFile avatar) throws Exception {
        Employee employee = mapper.readValue(employeeJson, Employee.class);
        return ResponseEntity.ok(service.createEmployee(employee, avatar));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Employee> update(
            @PathVariable Long id,
            @RequestPart("employee") String employeeJson,
            @RequestPart(value = "avatar", required = false) MultipartFile avatar) throws Exception {
        Employee employee = mapper.readValue(employeeJson, Employee.class);
        return ResponseEntity.ok(service.updateEmployee(id, employee, avatar));
    }

    @PutMapping("/{id}/deactivate")
    public ResponseEntity<Employee> deactivate(@PathVariable Long id) {
        return ResponseEntity.ok(service.deactivateEmployee(id));
    }

    @PutMapping("/{id}/activate")
    public ResponseEntity<Employee> activate(@PathVariable Long id) {
        return ResponseEntity.ok(service.activateEmployee(id));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<Employee> approve(@PathVariable Long id) {
        return ResponseEntity.ok(service.approve(id));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<Employee> reject(@PathVariable Long id) {
        return ResponseEntity.ok(service.reject(id));
    }
}
