package com.billbull.backend.hr.salaryadvance;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/salary-advances")
@PreAuthorize("isAuthenticated()")
public class SalaryAdvanceController {

    private static final String MODULE = "hr.payroll";

    @Autowired
    private SalaryAdvanceService service;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    // Get All Requests
    @GetMapping
    public ResponseEntity<List<SalaryAdvanceRequest>> getAllRequests() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAllRequests());
    }

    // Create Request (with file)
    @PostMapping
    public ResponseEntity<SalaryAdvanceRequest> createRequest(
            @RequestPart("request") SalaryAdvanceRequest request,
            @RequestPart(value = "file", required = false) MultipartFile file) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.createRequest(request, file));
    }

    // Approve
    @PutMapping("/{id}/approve")
    public ResponseEntity<?> approveRequest(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            service.approveRequest(id);
            return ResponseEntity.ok().build();
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    // Reject
    @PutMapping("/{id}/reject")
    public ResponseEntity<Void> rejectRequest(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.rejectRequest(id);
        return ResponseEntity.ok().build();
    }

    // Delete
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRequest(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.deleteRequest(id);
        return ResponseEntity.ok().build();
    }

    // --- SCHEDULE ENDPOINTS ---

    // Get All Schedules
    @GetMapping("/schedules")
    public ResponseEntity<List<RepaymentSchedule>> getAllSchedules() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAllSchedules());
    }

    // Mark Paid
    @PutMapping("/schedules/{id}/pay")
    public ResponseEntity<RepaymentSchedule> markInstallmentPaid(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.markInstallmentPaid(id));
    }

    // Revoke Payment
    @PutMapping("/schedules/{id}/revoke")
    public ResponseEntity<RepaymentSchedule> revokePayment(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.revokePayment(id));
    }

    // --- DASHBOARD STATS ---
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getStats());
    }
}