package com.billbull.backend.inventory.stocktransfer;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/stock-transfers")
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
public class StockTransferController {

    private static final String MODULE = "inventory";

    private final StockTransferService service;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public StockTransferController(StockTransferService service, AuditLogService auditLogService, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<StockTransferResponse> list() {
        modulePermissionService.requireCanView(MODULE);
        return service.list();
    }

    @GetMapping("/cost-preview")
    public StockTransferCostPreviewResponse getCostPreview(
            @RequestParam Long warehouseId,
            @RequestParam List<Long> productIds) {
        modulePermissionService.requireCanView(MODULE);
        return service.getCostPreview(warehouseId, productIds);
    }

    @GetMapping("/{id}")
    public StockTransferResponse get(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.get(id);
    }

    @PostMapping
    public StockTransferResponse create(@RequestBody StockTransferRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.create(req);
    }

    @PutMapping("/{id}")
    public StockTransferResponse update(@PathVariable Long id, @RequestBody StockTransferRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
    }

    @PostMapping("/{id}/request-approval")
    public StockTransferResponse requestApproval(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.requestApproval(id);
    }

    @PostMapping("/{id}/cancel")
    public StockTransferResponse cancel(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.cancel(id);
    }

    @PostMapping("/{id}/send")
    public StockTransferResponse markSent(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.markSent(id);
    }

    @PostMapping("/{id}/receive")
    public StockTransferResponse markReceived(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.markReceived(id);
    }
}
