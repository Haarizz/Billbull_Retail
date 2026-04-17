package com.billbull.backend.hr.employees;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/employees")
@PreAuthorize("hasAnyRole('ADMIN', 'HR')")
public class EmployeeController {

    private final EmployeeService service;
    private final ObjectMapper mapper;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;
    private final ModulePermissionService modulePermissionService;

    public EmployeeController(
            EmployeeService service,
            ObjectMapper mapper,
            AuditLogService auditLogService,
            UserRepository userRepository,
            ModulePermissionService modulePermissionService) {
        this.service = service;
        this.mapper = mapper;
        this.auditLogService = auditLogService;
        this.userRepository = userRepository;
        this.modulePermissionService = modulePermissionService;
    }

    // ── HORIZONTAL: canView('hr') ────────────────────────────────────────────

    @GetMapping
    public List<Employee> getAll() {
        modulePermissionService.requireCanView("hr");
        return service.getAll();
    }

    @GetMapping("/{id}")
    public Employee getById(@PathVariable Long id, HttpServletRequest request) {
        modulePermissionService.requireCanView("hr");
        auditLogService.logAllowedAccess("/api/employees/" + id, "GET", request);
        return service.getById(id);
    }

    @GetMapping("/active")
    public List<Employee> activeEmployees() {
        modulePermissionService.requireCanView("hr");
        return service.getActiveEmployees();
    }

    @GetMapping("/pending")
    public List<Employee> pendingEmployees() {
        modulePermissionService.requireCanView("hr");
        return service.getPendingEmployees();
    }

    // ── VERTICAL: canCreate('hr') ────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<Employee> create(
            @RequestPart("employee") String employeeJson,
            @RequestPart(value = "avatar", required = false) MultipartFile avatar) throws Exception {
        modulePermissionService.requireCanCreate("hr");
        Employee employee = mapper.readValue(employeeJson, Employee.class);
        return ResponseEntity.ok(service.createEmployee(employee, avatar));
    }

    // ── VERTICAL: canEdit('hr') ──────────────────────────────────────────────

    @PutMapping("/{id}")
    public ResponseEntity<Employee> update(
            @PathVariable Long id,
            @RequestPart("employee") String employeeJson,
            @RequestPart(value = "avatar", required = false) MultipartFile avatar) throws Exception {
        modulePermissionService.requireCanEdit("hr");
        Employee employee = mapper.readValue(employeeJson, Employee.class);
        return ResponseEntity.ok(service.updateEmployee(id, employee, avatar));
    }

    @PutMapping("/{id}/deactivate")
    public ResponseEntity<Employee> deactivate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit("hr");
        return ResponseEntity.ok(service.deactivateEmployee(id));
    }

    @PutMapping("/{id}/activate")
    public ResponseEntity<Employee> activate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit("hr");
        return ResponseEntity.ok(service.activateEmployee(id));
    }

    // ── VERTICAL: canApprove('hr') ───────────────────────────────────────────

    @PostMapping("/{id}/approve")
    public ResponseEntity<Employee> approve(@PathVariable Long id) {
        modulePermissionService.requireCanApprove("hr");
        return ResponseEntity.ok(service.approve(id));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<Employee> reject(@PathVariable Long id) {
        modulePermissionService.requireCanApprove("hr");
        return ResponseEntity.ok(service.reject(id));
    }

    /**
     * Get linked user access info for an employee.
     * ADMIN only — method-level annotation overrides class-level hasAnyRole.
     */
    @GetMapping("/{id}/access")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EmployeeAccessDto> getEmployeeAccess(
            @PathVariable Long id, HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/employees/" + id + "/access", "GET", request);

        Employee emp = service.getById(id);

        EmployeeAccessDto dto = new EmployeeAccessDto();
        dto.setEmployeeId(emp.getId());
        dto.setEmployeeCode(emp.getEmployeeCode());
        dto.setEmployeeFullName(emp.getFirstName() + " " + emp.getLastName());

        userRepository.findByLinkedEmployee_Id(id).ifPresentOrElse(user -> {
            dto.setHasLinkedUser(true);
            dto.setLinkedUserId(user.getId());
            dto.setLinkedUsername(user.getUsername());
            dto.setLinkedEmail(user.getEmail());
            dto.setUserActive(user.isActive());
            dto.setAssignedRoles(
                user.getRoles().stream()
                    .map(r -> r.getName())
                    .collect(Collectors.toList())
            );
        }, () -> {
            dto.setHasLinkedUser(false);
        });

        return ResponseEntity.ok(dto);
    }
}
