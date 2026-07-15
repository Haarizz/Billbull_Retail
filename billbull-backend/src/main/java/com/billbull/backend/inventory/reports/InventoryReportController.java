package com.billbull.backend.inventory.reports;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventory/reports")
public class InventoryReportController {

    private static final String MODULE = "inventory";

    private final InventoryReportService reportService;
    private final InventoryReportDataService reportDataService;
    private final ModulePermissionService modulePermissionService;

    public InventoryReportController(
            InventoryReportService reportService,
            InventoryReportDataService reportDataService,
            ModulePermissionService modulePermissionService) {
        this.reportService = reportService;
        this.reportDataService = reportDataService;
        this.modulePermissionService = modulePermissionService;
    }

    // Phase 10: branchScope=active (default) scopes an all-warehouses report to the active branch
    // (when the toggle is on); branchScope=all forces the consolidated company-wide view (admins).
    // A specific warehouseId is already branch-correct and unaffected by branchScope.
    private static boolean allBranches(String branchScope) {
        return "all".equalsIgnoreCase(branchScope);
    }

    @GetMapping("/stock-on-hand")
    public ResponseEntity<List<StockReportResponse>> getStockOnHand(
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) String branchScope) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(reportService.getStockOnHand(warehouseId, allBranches(branchScope)));
    }

    @GetMapping("/low-stock")
    public ResponseEntity<List<StockReportResponse>> getLowStock(
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) String branchScope) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(reportService.getLowStock(warehouseId, allBranches(branchScope)));
    }

    @GetMapping("/out-of-stock")
    public ResponseEntity<List<StockReportResponse>> getOutOfStock(
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) String branchScope) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(reportService.getOutOfStock(warehouseId, allBranches(branchScope)));
    }

    @GetMapping("/stock-valuation")
    public ResponseEntity<List<StockReportResponse>> getStockValuation(
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) String branchScope) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(reportService.getStockValuation(warehouseId, allBranches(branchScope)));
    }

    @GetMapping("/data/{reportId}")
    public ResponseEntity<InventoryReportDataResponse> getReportData(
            @org.springframework.web.bind.annotation.PathVariable String reportId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate dateTo,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String stockCondition) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(reportDataService.getReport(
                reportId,
                warehouseId,
                dateFrom,
                dateTo,
                department,
                brand,
                search,
                stockCondition));
    }
}
