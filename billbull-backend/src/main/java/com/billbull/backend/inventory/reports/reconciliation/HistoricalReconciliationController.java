package com.billbull.backend.inventory.reports.reconciliation;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/inventory/reconciliation")
public class HistoricalReconciliationController {

    private final HistoricalReconciliationService service;

    public HistoricalReconciliationController(HistoricalReconciliationService service) {
        this.service = service;
    }

    @GetMapping("/negative-stock-dry-run")
    @PreAuthorize("hasAuthority('INVENTORY_REPORTS_VIEW')")
    public List<Map<String, Object>> getNegativeStockDiscrepancies() {
        return service.identifyMissingNegativeStockMovements();
    }
}
