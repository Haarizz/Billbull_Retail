package com.billbull.backend.purchase.reports;

import java.time.LocalDate;
import java.util.List;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/purchase/reports")
public class PurchaseReportController {

    private static final String MODULE = "purchases.reports";

    private final PurchaseReportDataService reportDataService;
    private final ModulePermissionService modulePermissionService;

    public PurchaseReportController(PurchaseReportDataService reportDataService,
                                    ModulePermissionService modulePermissionService) {
        this.reportDataService = reportDataService;
        this.modulePermissionService = modulePermissionService;
    }

    /**
     * Typeahead source for the "Item / SKU Search" filter — items the user can pick to
     * filter the report on an exact code.
     */
    @GetMapping("/filter-suggestions")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PurchaseReportFilterSuggestion>> getFilterSuggestions(
            @RequestParam(required = false) String q,
            @RequestParam(required = false, defaultValue = "8") int limit) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(reportDataService.getFilterSuggestions(q, limit));
    }

    @GetMapping("/data/{reportId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseReportDataResponse> getReportData(
            @PathVariable String reportId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(required = false) String vendor,
            @RequestParam(required = false) String branch,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String itemCode) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(
                reportDataService.getReport(reportId, dateFrom, dateTo, vendor, branch, search, itemCode));
    }
}
