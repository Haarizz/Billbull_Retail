package com.billbull.backend.inventory.reports;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventory/reports")
@CrossOrigin(origins = "*")
public class InventoryReportController {

    private final InventoryReportService reportService;
    private final InventoryReportDataService reportDataService;

    public InventoryReportController(
            InventoryReportService reportService,
            InventoryReportDataService reportDataService) {
        this.reportService = reportService;
        this.reportDataService = reportDataService;
    }

    @GetMapping("/stock-on-hand")
    public ResponseEntity<List<StockReportResponse>> getStockOnHand(
            @RequestParam(required = false) Long warehouseId) {
        return ResponseEntity.ok(reportService.getStockOnHand(warehouseId));
    }

    @GetMapping("/low-stock")
    public ResponseEntity<List<StockReportResponse>> getLowStock(
            @RequestParam(required = false) Long warehouseId) {
        return ResponseEntity.ok(reportService.getLowStock(warehouseId));
    }

    @GetMapping("/out-of-stock")
    public ResponseEntity<List<StockReportResponse>> getOutOfStock(
            @RequestParam(required = false) Long warehouseId) {
        return ResponseEntity.ok(reportService.getOutOfStock(warehouseId));
    }

    @GetMapping("/stock-valuation")
    public ResponseEntity<List<StockReportResponse>> getStockValuation(
            @RequestParam(required = false) Long warehouseId) {
        return ResponseEntity.ok(reportService.getStockValuation(warehouseId));
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
