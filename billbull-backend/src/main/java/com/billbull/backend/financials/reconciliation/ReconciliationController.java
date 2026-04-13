package com.billbull.backend.financials.reconciliation;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/reconciliation")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class ReconciliationController {

    private final ReconciliationService reconciliationService;
    private final AuditLogService auditLogService;

    public ReconciliationController(ReconciliationService reconciliationService, AuditLogService auditLogService) {
        this.reconciliationService = reconciliationService;
        this.auditLogService = auditLogService;
    }

    @PostMapping("/finalize")
    public ResponseEntity<ReconciliationSession> finalizeReconciliation(@RequestBody ReconciliationRequest request) {
        return ResponseEntity.ok(reconciliationService.finalizeReconciliation(request));
    }
}
