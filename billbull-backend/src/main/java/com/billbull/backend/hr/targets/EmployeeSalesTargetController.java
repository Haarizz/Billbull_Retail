package com.billbull.backend.hr.targets;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.user.UserRepository;

/**
 * Employee monthly targets and performance.
 *
 * <p>Authorization reuses the existing HR module permissions rather than introducing a new module
 * key: reads require {@code canView("hr.employee")}, writes {@code canEdit("hr.employee")} — the
 * same gates the Employees &amp; Roles screen already applies to its Set Targets button.
 */
@RestController
@RequestMapping("/api/hr/targets")
@PreAuthorize("isAuthenticated()")
public class EmployeeSalesTargetController {

    private final EmployeeSalesTargetService targetService;
    private final EmployeePerformanceService performanceService;
    private final ModulePermissionService modulePermissionService;
    private final UserRepository userRepository;

    public EmployeeSalesTargetController(EmployeeSalesTargetService targetService,
                                         EmployeePerformanceService performanceService,
                                         ModulePermissionService modulePermissionService,
                                         UserRepository userRepository) {
        this.targetService = targetService;
        this.performanceService = performanceService;
        this.modulePermissionService = modulePermissionService;
        this.userRepository = userRepository;
    }

    /**
     * Admin Performance &amp; Targets grid.
     *
     * @param month    any date inside the month (the UI sends {@code yyyy-MM-01})
     * @param branchId null/absent = All Branches
     */
    @GetMapping
    public EmployeePerformanceResponse getPerformance(
            @RequestParam(name = "month", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month,
            @RequestParam(name = "branchId", required = false) Long branchId) {
        modulePermissionService.requireCanView("hr.employee");
        return performanceService.getPerformance(resolveMonth(month), branchId);
    }

    @PutMapping
    public EmployeeSalesTarget upsert(@RequestBody EmployeeSalesTargetUpsertRequest request) {
        modulePermissionService.requireCanEdit("hr.employee");
        return targetService.upsert(request.getEmployeeId(), request.getTargetMonth(),
                request.getTargetAmount(), request.getCommissionRate());
    }

    @PutMapping("/bulk")
    public List<EmployeeSalesTarget> upsertBulk(
            @RequestBody List<EmployeeSalesTargetUpsertRequest> requests) {
        modulePermissionService.requireCanEdit("hr.employee");
        return targetService.upsertAll(requests);
    }

    /**
     * The caller's own targets and performance.
     *
     * <p>The employee is resolved server-side from the authenticated principal's linked employee.
     * There is deliberately no {@code employeeId} parameter: an employee must not be able to read
     * a colleague's figures by editing a query string.
     *
     * <p>204 No Content when the caller has no linked employee — an empty state, not an error, so
     * the My Profile tabs can render a clean "not linked" message.
     */
    @GetMapping("/me")
    public ResponseEntity<EmployeePerformanceRow> getMyPerformance(
            @RequestParam(name = "month", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month,
            Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated.");
        }
        // Resolved by id (scalar query), and the Employee is then loaded inside the service's own
        // transaction. Not via User.linkedEmployee: that association is LAZY and open-in-view is
        // off, so its proxy is detached by the time this controller would read it.
        Long employeeId = userRepository.findLinkedEmployeeIdByUsername(authentication.getName())
                .orElse(null);
        if (employeeId == null) {
            return ResponseEntity.noContent().build();
        }
        // Self view is always consolidated across branches: the target is global, so the employee's
        // own achievement must be measured against all of their sales.
        EmployeePerformanceRow row =
                performanceService.getForEmployeeId(employeeId, resolveMonth(month), null);
        return row != null ? ResponseEntity.ok(row) : ResponseEntity.noContent().build();
    }

    /** Defaults to the current month when the client omits it. */
    private LocalDate resolveMonth(LocalDate month) {
        try {
            return month != null ? month : LocalDate.now().withDayOfMonth(1);
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid month.");
        }
    }
}
