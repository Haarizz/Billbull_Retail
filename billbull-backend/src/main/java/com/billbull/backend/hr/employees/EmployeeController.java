package com.billbull.backend.hr.employees;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
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

    // ── PUBLIC TO ALL AUTHENTICATED USERS (for dropdowns) ───────────────────

    @GetMapping("/names")
    @PreAuthorize("isAuthenticated()")
    public List<Map<String, Object>> getEmployeeNames() {
        return service.getActiveEmployees().stream()
                .map(emp -> {
                    String fullName = (emp.getFirstName() + " " +
                            (emp.getMiddleName() != null ? emp.getMiddleName() + " " : "") +
                            emp.getLastName()).trim().replaceAll("\\s+", " ");
                    return Map.<String, Object>of("id", emp.getId(), "name", fullName);
                })
                .collect(Collectors.toList());
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
            @RequestPart(value = "avatar", required = false) MultipartFile avatar,
            Authentication authentication) throws Exception {
        modulePermissionService.requireCanCreate("hr");
        EmployeeUpsertRequest request = mapper.readValue(employeeJson, EmployeeUpsertRequest.class);
        validateAdminLoginProvisioning(request, authentication);
        return ResponseEntity.ok(service.createEmployee(request, avatar));
    }

    // ── VERTICAL: canEdit('hr') ──────────────────────────────────────────────

    @PutMapping("/{id}")
    public ResponseEntity<Employee> update(
            @PathVariable Long id,
            @RequestPart("employee") String employeeJson,
            @RequestPart(value = "avatar", required = false) MultipartFile avatar) throws Exception {
        modulePermissionService.requireCanEdit("hr");
        EmployeeUpsertRequest request = mapper.readValue(employeeJson, EmployeeUpsertRequest.class);
        rejectLoginProvisioningOnUpdate(request);
        return ResponseEntity.ok(service.updateEmployee(id, request, avatar));
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
            dto.setPendingEmployeeActivation(user.isPendingEmployeeActivation());
            dto.setAssignedRoles(
                user.getRoles().stream()
                    .map(r -> r.getName())
                    .collect(Collectors.toList())
            );
            if (user.getPrimaryRole() != null) {
                dto.setPrimaryRoleName(user.getPrimaryRole().getName());
            }
            if (user.getBranch() != null) {
                dto.setBranchId(user.getBranch().getId());
                dto.setBranchName(user.getBranch().getName());
                dto.setBranchCode(user.getBranch().getCode());
                dto.setPrimaryBranchId(user.getBranch().getId());
                dto.setPrimaryBranchName(user.getBranch().getName());
            }
            // PDF §2.3 — surface the additional branches so the UI can pre-check them.
            if (user.getAdditionalBranches() != null) {
                dto.setAdditionalBranchIds(
                    user.getAdditionalBranches().stream()
                        .filter(b -> b != null && b.getId() != null)
                        .map(b -> b.getId())
                        .collect(Collectors.toList())
                );
            }
        }, () -> {
            dto.setHasLinkedUser(false);
        });

        return ResponseEntity.ok(dto);
    }

    private void validateAdminLoginProvisioning(EmployeeUpsertRequest request, Authentication authentication) {
        if (!request.hasLoginAccessRequest()) {
            return;
        }

        boolean isAdmin = authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));

        if (!isAdmin) {
            throw new AccessDeniedException("Only ADMIN can provision employee login access.");
        }
    }

    private void rejectLoginProvisioningOnUpdate(EmployeeUpsertRequest request) {
        if (request.hasLoginAccessRequest()) {
            throw new RuntimeException("Login access can only be provisioned during employee creation.");
        }
    }
}
