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
@PreAuthorize("isAuthenticated()")
public class EmployeeController {

    private final EmployeeService service;
    private final ObjectMapper mapper;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;
    private final ModulePermissionService modulePermissionService;
    private final SalespersonService salespersonService;
    private final com.billbull.backend.hr.targets.EmployeeSalesTargetService targetService;

    public EmployeeController(
            EmployeeService service,
            ObjectMapper mapper,
            AuditLogService auditLogService,
            UserRepository userRepository,
            ModulePermissionService modulePermissionService,
            SalespersonService salespersonService,
            com.billbull.backend.hr.targets.EmployeeSalesTargetService targetService) {
        this.service = service;
        this.mapper = mapper;
        this.auditLogService = auditLogService;
        this.userRepository = userRepository;
        this.modulePermissionService = modulePermissionService;
        this.salespersonService = salespersonService;
        this.targetService = targetService;
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

    @GetMapping("/delivery-persons")
    @PreAuthorize("isAuthenticated()")
    public List<Map<String, Object>> getDeliveryPersons() {
        return service.getActiveDeliveryPersons().stream()
                .map(emp -> {
                    String fullName = (emp.getFirstName() + " " +
                            (emp.getMiddleName() != null ? emp.getMiddleName() + " " : "") +
                            emp.getLastName()).trim().replaceAll("\\s+", " ");
                    return Map.<String, Object>of(
                            "id", emp.getId(),
                            "employeeCode", emp.getEmployeeCode(),
                            "name", fullName,
                            "phone", emp.getPhone() != null ? emp.getPhone() : ""
                    );
                })
                .collect(Collectors.toList());
    }

    /**
     * Candidates for the POS salesperson selector, plus the caller's own linked employee so the
     * POS can preselect it without a second round-trip.
     *
     * <p>Open to any authenticated user for the same reason {@code /names} and
     * {@code /delivery-persons} are: it is a dropdown feed, and it projects to id/code/name
     * rather than returning the Employee entity. {@code defaultEmployeeId} is null when the caller
     * has no linked employee, or when that employee is not Active — the POS then starts blank
     * rather than guessing.
     *
     * <p>Business rule (confirmed, unchanged): any authenticated POS user may attribute a sale to
     * any ELIGIBLE active employee, because the cashier is not necessarily the salesperson. There
     * is intentionally no salesperson-assignment permission. Phase 2 narrowed "any active
     * employee" to the two salesperson designations — see {@link SalespersonEligibility}.
     */
    @GetMapping("/salespersons")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> getSalespersons(Authentication authentication) {
        // id/code/name/role only. Deliberately no phone or other personal data: this feed is
        // readable by every authenticated user (not just HR), so it carries only what the picker
        // needs. Since Phase 2 the roster is narrowed to the two salesperson-eligible designations
        // (SalespersonEligibility), which both implements the business rule and reduces what this
        // unprivileged feed exposes.
        List<Map<String, Object>> options = service.getActiveSalespersons().stream()
                .map(emp -> {
                    Map<String, Object> option = new java.util.HashMap<>();
                    option.put("id", emp.getId());
                    option.put("employeeCode", emp.getEmployeeCode());
                    option.put("name", fullName(emp));
                    option.put("role", emp.getRole());
                    return option;
                })
                .collect(Collectors.toList());

        // The caller's linked employee is the default only when it is in the Active roster above —
        // which is exactly the "linked AND Active" rule, with no second employee lookup. Resolved by
        // id (scalar query) rather than through User.linkedEmployee: that association is LAZY and,
        // with open-in-view off, its proxy is already detached here.
        Long defaultEmployeeId = null;
        if (authentication != null && authentication.getName() != null) {
            Long linkedId = userRepository.findLinkedEmployeeIdByUsername(authentication.getName())
                    .orElse(null);
            if (linkedId != null && options.stream().anyMatch(o -> linkedId.equals(o.get("id")))) {
                defaultEmployeeId = linkedId;
            }
        }

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("options", options);
        body.put("defaultEmployeeId", defaultEmployeeId);
        return body;
    }

    /**
     * Barcode lookup for the POS salesperson verification modal.
     *
     * <p>The barcode value IS {@code Employee.employeeCode} — there is deliberately no second
     * employee identifier. Resolution and eligibility are enforced by {@link SalespersonService};
     * an unknown, inactive or ineligible code comes back as a 400 with a specific reason, never as
     * a rendered employee the client could then submit anyway.
     *
     * <p>Authenticated, with no new permission: the locked Phase 2 rule is that any authenticated
     * POS user may verify any active eligible salesperson. The barcode is an interaction
     * convenience, not an authentication factor — which is exactly why the SERVER, not the scan,
     * decides eligibility.
     *
     * <p>Target/commission for the current month are included so the modal can render them without
     * a second round-trip. A null commission means "not configured", not 0%.
     */
    @GetMapping("/salespersons/by-code/{employeeCode}")
    @PreAuthorize("isAuthenticated()")
    public SalespersonLookupResponse lookupSalespersonByCode(
            @PathVariable String employeeCode,
            @RequestParam(name = "month", required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate month) {
        Employee employee = salespersonService.requireEligibleByCode(employeeCode);

        java.time.LocalDate targetMonth = month != null
                ? month.withDayOfMonth(1)
                : java.time.LocalDate.now().withDayOfMonth(1);
        com.billbull.backend.hr.targets.EmployeeSalesTarget target =
                targetService.findForEmployeeAndMonth(employee.getId(), targetMonth);

        SalespersonLookupResponse response = new SalespersonLookupResponse();
        response.setId(employee.getId());
        response.setEmployeeCode(employee.getEmployeeCode());
        response.setName(fullName(employee));
        response.setRole(employee.getRole());
        response.setStatus(employee.getStatus());
        response.setTargetMonth(targetMonth);
        response.setTargetAmount(target != null ? target.getTargetAmount() : null);
        response.setCommissionRate(target != null ? target.getCommissionRate() : null);
        return response;
    }

    private String fullName(Employee emp) {
        return (emp.getFirstName() + " " +
                (emp.getMiddleName() != null ? emp.getMiddleName() + " " : "") +
                emp.getLastName()).trim().replaceAll("\\s+", " ");
    }

    @GetMapping
    public List<Employee> getAll() {
        modulePermissionService.requireCanView("hr.employee");
        return service.getAll();
    }

    @GetMapping("/{id}")
    public Employee getById(@PathVariable Long id, HttpServletRequest request) {
        modulePermissionService.requireCanView("hr.employee");
        auditLogService.logAllowedAccess("/api/employees/" + id, "GET", request);
        return service.getById(id);
    }

    @GetMapping("/active")
    public List<Employee> activeEmployees() {
        modulePermissionService.requireCanView("hr.employee");
        return service.getActiveEmployees();
    }

    @GetMapping("/pending")
    public List<Employee> pendingEmployees() {
        modulePermissionService.requireCanView("hr.employee");
        return service.getPendingEmployees();
    }

    // ── VERTICAL: canCreate('hr') ────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<Employee> create(
            @RequestPart("employee") String employeeJson,
            @RequestPart(value = "avatar", required = false) MultipartFile avatar,
            Authentication authentication) throws Exception {
        modulePermissionService.requireCanCreate("hr.employee");
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
        modulePermissionService.requireCanEdit("hr.employee");
        EmployeeUpsertRequest request = mapper.readValue(employeeJson, EmployeeUpsertRequest.class);
        rejectLoginProvisioningOnUpdate(request);
        return ResponseEntity.ok(service.updateEmployee(id, request, avatar));
    }

    @PutMapping("/{id}/deactivate")
    public ResponseEntity<Employee> deactivate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit("hr.employee");
        return ResponseEntity.ok(service.deactivateEmployee(id));
    }

    @PutMapping("/{id}/activate")
    public ResponseEntity<Employee> activate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit("hr.employee");
        return ResponseEntity.ok(service.activateEmployee(id));
    }

    // ── VERTICAL: canApprove('hr') ───────────────────────────────────────────

    @PostMapping("/{id}/approve")
    public ResponseEntity<Employee> approve(@PathVariable Long id) {
        modulePermissionService.requireCanApprove("hr.employee");
        return ResponseEntity.ok(service.approve(id));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<Employee> reject(@PathVariable Long id) {
        modulePermissionService.requireCanApprove("hr.employee");
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
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority())
                        || "ROLE_BRANCH_ADMIN".equals(authority.getAuthority()));

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
