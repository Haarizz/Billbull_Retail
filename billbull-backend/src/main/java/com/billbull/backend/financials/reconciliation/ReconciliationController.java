package com.billbull.backend.financials.reconciliation;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/reconciliation")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class ReconciliationController {

    private static final String MODULE = "finance";

    private final ReconciliationService reconciliationService;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public ReconciliationController(ReconciliationService reconciliationService, AuditLogService auditLogService, ModulePermissionService modulePermissionService) {
        this.reconciliationService = reconciliationService;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    @PostMapping("/finalize")
    public ResponseEntity<ReconciliationSession> finalizeReconciliation(@RequestBody ReconciliationRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(reconciliationService.finalizeReconciliation(request));
    }

    /**
     * Auto-post a GL journal for an unmatched bank statement line (PDF §17 / Phase 7.2).
     * Body: { "sessionId": 1, "lineId": 5, "category": "BANK_CHARGE", "amount": 25.00, "description": "Monthly fee" }
     */
    @PostMapping("/auto-post")
    public ResponseEntity<Void> autoPost(@RequestBody java.util.Map<String, Object> body) {
        modulePermissionService.requireCanEdit(MODULE);
        Long sessionId  = Long.valueOf(body.get("sessionId").toString());
        Long lineId     = Long.valueOf(body.get("lineId").toString());
        String category = body.get("category").toString();
        java.math.BigDecimal amount = new java.math.BigDecimal(body.get("amount").toString());
        String desc     = body.containsKey("description") ? body.get("description").toString() : category;
        reconciliationService.autoPostStatementLine(sessionId, lineId, category, amount, desc);
        return ResponseEntity.ok().build();
    }
}
