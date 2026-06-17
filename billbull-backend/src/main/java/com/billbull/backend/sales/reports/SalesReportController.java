package com.billbull.backend.sales.reports;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/sales/reports")
public class SalesReportController {

    private static final String MODULE = "sales";

    private final SalesReportDataService reportDataService;
    private final ModulePermissionService modulePermissionService;

    public SalesReportController(SalesReportDataService reportDataService,
                                 ModulePermissionService modulePermissionService) {
        this.reportDataService = reportDataService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/salespersons")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<String>> getSalespersons() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(reportDataService.getDistinctSalespersons());
    }

    @GetMapping("/data/{reportId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SalesReportDataResponse> getReportData(
            @PathVariable String reportId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String salesChannel,
            @RequestParam(required = false) String salesperson,
            @RequestParam(required = false) String valuationMethod,
            @RequestParam(required = false) String search) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(reportDataService.getReport(
                reportId,
                dateFrom,
                dateTo,
                branchId,
                salesChannel,
                salesperson,
                valuationMethod,
                search));
    }
}
