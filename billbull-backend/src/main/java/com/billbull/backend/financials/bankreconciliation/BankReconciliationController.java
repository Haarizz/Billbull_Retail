package com.billbull.backend.financials.bankreconciliation;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Bank Reconciliation REST API (PDF §15).
 *
 * Workflow:
 *  1. POST /statements           — create statement header
 *  2. POST /statements/{id}/lines — import statement lines
 *  3. POST /statements/{id}/auto-match — system attempts to match by amount+date
 *  4. POST /lines/{id}/match?journalLineId= — manual match
 *  5. POST /lines/{id}/post-bank-charge — post Dr Bank Charges / Cr Bank
 *  6. POST /lines/{id}/post-bank-interest — post Dr Bank / Cr Interest Income
 *  7. GET  /statements/{id}/summary — show reconciled vs unreconciled
 *  8. POST /statements/{id}/mark-reconciled — finalize
 */
@RestController
@RequestMapping("/api/financials/bank-reconciliation")
public class BankReconciliationController {

    private static final String MODULE = "finance";

    private final BankReconciliationService service;
    private final ModulePermissionService modulePermissionService;

    public BankReconciliationController(BankReconciliationService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/statements")
    public List<BankStatement> getStatements(@RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return service.findAllStatements(branchId);
    }

    @PostMapping("/statements")
    public ResponseEntity<BankStatement> createStatement(@RequestBody BankStatement statement) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.createStatement(statement));
    }

    @PostMapping("/statements/{id}/lines")
    public ResponseEntity<List<BankStatementLine>> importLines(
            @PathVariable Long id,
            @RequestBody List<BankStatementLine> lines) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.importLines(id, lines));
    }

    @PostMapping("/statements/{id}/auto-match")
    public ResponseEntity<Map<String, Integer>> autoMatch(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        int count = service.autoMatch(id);
        return ResponseEntity.ok(Map.of("autoMatchedLines", count));
    }

    @PostMapping("/lines/{id}/match")
    public ResponseEntity<BankStatementLine> matchLine(
            @PathVariable Long id,
            @RequestParam Long journalLineId) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.matchLine(id, journalLineId));
    }

    @PostMapping("/lines/{id}/post-bank-charge")
    public ResponseEntity<BankStatementLine> postBankCharge(
            @PathVariable Long id,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.postBankCharge(id, branchId));
    }

    @PostMapping("/lines/{id}/post-bank-interest")
    public ResponseEntity<BankStatementLine> postBankInterest(
            @PathVariable Long id,
            @RequestParam(required = false) Long branchId) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.postBankInterest(id, branchId));
    }

    @GetMapping("/statements/{id}/summary")
    public ResponseEntity<Map<String, Object>> getSummary(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getReconciliationSummary(id));
    }

    @PostMapping("/statements/{id}/mark-reconciled")
    public ResponseEntity<BankStatement> markReconciled(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.markReconciled(id));
    }
}
