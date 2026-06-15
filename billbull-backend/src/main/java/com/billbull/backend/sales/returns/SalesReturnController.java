package com.billbull.backend.sales.returns;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/returns")
@PreAuthorize("isAuthenticated()")
public class SalesReturnController {

    private static final String MODULE = "sales";
    private static final Logger logger = LoggerFactory.getLogger(SalesReturnController.class);

    @Autowired
    private SalesReturnService salesReturnService;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    @GetMapping
    public List<SalesReturn> getAllReturns() {
        modulePermissionService.requireCanView(MODULE);
        logger.info("GET /api/sales/returns requested");
        return salesReturnService.getAllReturns();
    }

    @GetMapping("/page")
    public com.billbull.backend.util.PageResponse<SalesReturn> getReturnsPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        modulePermissionService.requireCanView(MODULE);
        java.util.List<SalesReturn> all = (fromDate != null || toDate != null)
                ? salesReturnService.getAllByDateRange(
                        fromDate != null ? java.time.LocalDate.parse(fromDate) : java.time.LocalDate.of(2000, 1, 1),
                        toDate != null ? java.time.LocalDate.parse(toDate) : java.time.LocalDate.now())
                : salesReturnService.getAllReturns();
        return com.billbull.backend.util.PaginationUtil.paginate(all, page, size, search, status);
    }

    @GetMapping("/{id}")
    public SalesReturn getReturnById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return salesReturnService.getReturnById(id);
    }

    @PostMapping
    public SalesReturn saveReturn(@RequestBody SalesReturn salesReturn) {
        modulePermissionService.requireCanCreate(MODULE);
        logger.info("POST /api/sales/returns received: {}", salesReturn.getReturnNumber());
        return salesReturnService.saveReturn(salesReturn);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteReturn(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        salesReturnService.deleteReturn(id);
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextReturnNumber() {
        modulePermissionService.requireCanView(MODULE);
        return Map.of("returnNumber", salesReturnService.generateReturnNumber());
    }

    @GetMapping("/stats")
    public Map<String, Object> getReturnStats() {
        modulePermissionService.requireCanView(MODULE);
        return salesReturnService.getReturnStats();
    }

    @PutMapping("/{id}/status")
    public SalesReturn updateStatus(@PathVariable Long id, @RequestParam SalesReturnStatus status) {
        modulePermissionService.requireCanEdit(MODULE);
        return salesReturnService.updateStatus(id, status);
    }

    @GetMapping("/returnable-batches")
    public List<ReturnableBatchResponse> getReturnableBatches(@RequestParam String invoiceNumber) {
        modulePermissionService.requireCanView(MODULE);
        return salesReturnService.getReturnableBatchesForInvoice(invoiceNumber);
    }
}
