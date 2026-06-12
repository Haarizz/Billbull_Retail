package com.billbull.backend.financials.audit;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/financials/audit")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class FinancialAuditController {

    private static final String MODULE = "finance";

    private final FinancialAuditService auditService;
    private final ModulePermissionService modulePermissionService;

    public FinancialAuditController(FinancialAuditService auditService, ModulePermissionService modulePermissionService) {
        this.auditService = auditService;
        this.modulePermissionService = modulePermissionService;
    }

    /**
     * Get audit trail for a specific financial record.
     * e.g. GET /api/financials/audit/JOURNAL_VOUCHER/JV-0001
     */
    @GetMapping("/{entityType}/{entityId}")
    public ResponseEntity<List<FinancialAuditLog>> getAuditTrail(
            @PathVariable String entityType,
            @PathVariable String entityId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(auditService.getAuditTrail(entityType, entityId));
    }

    /**
     * Get all audit logs — admin only.
     */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<FinancialAuditLog>> getAllLogs() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(auditService.getAllLogs());
    }

    /**
     * Get all audit logs for a given entity type.
     * e.g. GET /api/financials/audit/type/JOURNAL_VOUCHER
     */
    @GetMapping("/type/{entityType}")
    public ResponseEntity<List<FinancialAuditLog>> getByEntityType(@PathVariable String entityType) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(auditService.getByEntityType(entityType));
    }
}
