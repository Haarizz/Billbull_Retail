package com.billbull.backend.hr.salarypayments;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payroll")
public class SalaryPaymentController {

    private static final String MODULE = "hr";

    @Autowired
    private SalaryPaymentService service;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    // 1. Get List for Table - ACCOUNTANT can view for reconciliation
    @GetMapping("/list")
    @PreAuthorize("hasAnyRole('ADMIN', 'HR', 'ACCOUNTANT')")
    public ResponseEntity<List<SalaryPayment>> getPayrollList(
            @RequestParam(defaultValue = "10") int month,
            @RequestParam(defaultValue = "2025") int year,
            HttpServletRequest request) {
        modulePermissionService.requireCanView(MODULE);
        auditLogService.logAllowedAccess("/api/payroll/list", "GET", request);
        return ResponseEntity.ok(service.getPayrollList(month, year));
    }

    // 2. Get Dashboard Stats - ACCOUNTANT can view for reconciliation
    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'HR', 'ACCOUNTANT')")
    public ResponseEntity<PayrollStatsDTO> getPayrollStats(
            @RequestParam(defaultValue = "10") int month,
            @RequestParam(defaultValue = "2025") int year,
            HttpServletRequest request) {
        modulePermissionService.requireCanView(MODULE);
        auditLogService.logAllowedAccess("/api/payroll/stats", "GET", request);
        return ResponseEntity.ok(service.getPayrollStats(month, year));
    }

    // 3. Get Recent Transactions (History) - ADMIN/HR only
    @GetMapping("/transactions")
    @PreAuthorize("hasAnyRole('ADMIN', 'HR')")
    public ResponseEntity<List<SalaryPayment>> getTransactionHistory(HttpServletRequest request) {
        modulePermissionService.requireCanView(MODULE);
        auditLogService.logAllowedAccess("/api/payroll/transactions", "GET", request);
        return ResponseEntity.ok(service.getTransactionHistory());
    }

    // 4. Create New Payment Record (Manual Add) - ADMIN/HR only
    @PostMapping("/create-record")
    @PreAuthorize("hasAnyRole('ADMIN', 'HR')")
    public ResponseEntity<SalaryPayment> createPaymentRecord(@RequestBody SalaryPaymentRequest request,
            HttpServletRequest httpRequest) {
        modulePermissionService.requireCanCreate(MODULE);
        auditLogService.logAllowedAccess("/api/payroll/create-record", "POST", httpRequest);
        return ResponseEntity.ok(service.createPaymentRecord(request));
    }

    // 5. Process Single Payment - ADMIN/HR only
    @PostMapping("/pay")
    @PreAuthorize("hasAnyRole('ADMIN', 'HR')")
    public ResponseEntity<SalaryPayment> processPayment(@RequestBody ProcessPaymentRequest request,
            HttpServletRequest httpRequest) {
        modulePermissionService.requireCanCreate(MODULE);
        auditLogService.logAllowedAccess("/api/payroll/pay", "POST", httpRequest);
        return ResponseEntity.ok(service.processSinglePayment(request));
    }

    // 6. Process Bulk Payment - ADMIN/HR only
    @PostMapping("/pay/bulk")
    @PreAuthorize("hasAnyRole('ADMIN', 'HR')")
    public ResponseEntity<String> processBulkPayment(@RequestBody BulkPaymentRequest request,
            HttpServletRequest httpRequest) {
        modulePermissionService.requireCanCreate(MODULE);
        auditLogService.logAllowedAccess("/api/payroll/pay/bulk", "POST", httpRequest);
        service.processBulkPayment(request);
        return ResponseEntity.ok("Bulk payment processed successfully");
    }
}