package com.billbull.backend.hr.salaryadvance;

import com.billbull.backend.security.AuditLogService;
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
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'HR')")
public class SalaryAdvanceController {

    @Autowired
    private SalaryAdvanceService service;

    @Autowired
    private AuditLogService auditLogService;

    // Get All Requests
    @GetMapping
    public ResponseEntity<List<SalaryAdvanceRequest>> getAllRequests() {
        return ResponseEntity.ok(service.getAllRequests());
    }

    // Create Request (with file)
    @PostMapping
    public ResponseEntity<SalaryAdvanceRequest> createRequest(
            @RequestPart("request") SalaryAdvanceRequest request,
            @RequestPart(value = "file", required = false) MultipartFile file) {
        return ResponseEntity.ok(service.createRequest(request, file));
    }

    // Approve
    @PutMapping("/{id}/approve")
    public ResponseEntity<?> approveRequest(@PathVariable Long id) {
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
        service.rejectRequest(id);
        return ResponseEntity.ok().build();
    }

    // Delete
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRequest(@PathVariable Long id) {
        service.deleteRequest(id);
        return ResponseEntity.ok().build();
    }

    // --- SCHEDULE ENDPOINTS ---

    // Get All Schedules
    @GetMapping("/schedules")
    public ResponseEntity<List<RepaymentSchedule>> getAllSchedules() {
        return ResponseEntity.ok(service.getAllSchedules());
    }

    // Mark Paid
    @PutMapping("/schedules/{id}/pay")
    public ResponseEntity<RepaymentSchedule> markInstallmentPaid(@PathVariable Long id) {
        return ResponseEntity.ok(service.markInstallmentPaid(id));
    }

    // Revoke Payment
    @PutMapping("/schedules/{id}/revoke")
    public ResponseEntity<RepaymentSchedule> revokePayment(@PathVariable Long id) {
        return ResponseEntity.ok(service.revokePayment(id));
    }

    // --- DASHBOARD STATS ---
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        return ResponseEntity.ok(service.getStats());
    }
}