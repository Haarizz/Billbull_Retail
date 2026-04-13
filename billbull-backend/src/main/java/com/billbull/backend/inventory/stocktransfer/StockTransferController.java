package com.billbull.backend.inventory.stocktransfer;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/stock-transfers")
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
public class StockTransferController {

    private final StockTransferService service;
    private final AuditLogService auditLogService;

    public StockTransferController(StockTransferService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<StockTransferResponse> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public StockTransferResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public StockTransferResponse create(@RequestBody StockTransferRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public StockTransferResponse update(@PathVariable Long id, @RequestBody StockTransferRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/request-approval")
    public StockTransferResponse requestApproval(@PathVariable Long id) {
        return service.requestApproval(id);
    }

    @PostMapping("/{id}/cancel")
    public StockTransferResponse cancel(@PathVariable Long id) {
        return service.cancel(id);
    }

    @PostMapping("/{id}/send")
    public StockTransferResponse markSent(@PathVariable Long id) {
        return service.markSent(id);
    }

    @PostMapping("/{id}/receive")
    public StockTransferResponse markReceived(@PathVariable Long id) {
        return service.markReceived(id);
    }
}
