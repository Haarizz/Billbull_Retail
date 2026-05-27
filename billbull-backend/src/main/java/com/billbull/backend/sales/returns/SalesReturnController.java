package com.billbull.backend.sales.returns;

import com.billbull.backend.security.AuditLogService;
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
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
public class SalesReturnController {

    private static final Logger logger = LoggerFactory.getLogger(SalesReturnController.class);

    @Autowired
    private SalesReturnService salesReturnService;

    @Autowired
    private AuditLogService auditLogService;

    @GetMapping
    public List<SalesReturn> getAllReturns() {
        logger.info("GET /api/sales/returns requested");
        return salesReturnService.getAllReturns();
    }

    @GetMapping("/page")
    public com.billbull.backend.util.PageResponse<SalesReturn> getReturnsPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        return com.billbull.backend.util.PaginationUtil.paginate(
                salesReturnService.getAllReturns(), page, size, search, status);
    }

    @GetMapping("/{id}")
    public SalesReturn getReturnById(@PathVariable Long id) {
        return salesReturnService.getReturnById(id);
    }

    @PostMapping
    public SalesReturn saveReturn(@RequestBody SalesReturn salesReturn) {
        logger.info("POST /api/sales/returns received: {}", salesReturn.getReturnNumber());
        return salesReturnService.saveReturn(salesReturn);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteReturn(@PathVariable Long id) {
        salesReturnService.deleteReturn(id);
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextReturnNumber() {
        return Map.of("returnNumber", salesReturnService.generateReturnNumber());
    }

    @GetMapping("/stats")
    public Map<String, Object> getReturnStats() {
        return salesReturnService.getReturnStats();
    }

    @PutMapping("/{id}/status")
    public SalesReturn updateStatus(@PathVariable Long id, @RequestParam SalesReturnStatus status) {
        return salesReturnService.updateStatus(id, status);
    }

    @GetMapping("/returnable-batches")
    public List<ReturnableBatchResponse> getReturnableBatches(@RequestParam String invoiceNumber) {
        return salesReturnService.getReturnableBatchesForInvoice(invoiceNumber);
    }
}
