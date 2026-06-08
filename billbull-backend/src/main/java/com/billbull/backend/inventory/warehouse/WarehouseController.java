package com.billbull.backend.inventory.warehouse;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/warehouses")
public class WarehouseController {

    private final WarehouseService service;
    private final WarehouseStockService stockService;
    private final BinService binService;
    private final AuditLogService auditLogService;

    public WarehouseController(WarehouseService service, WarehouseStockService stockService,
            BinService binService, AuditLogService auditLogService) {
        this.service = service;
        this.stockService = stockService;
        this.binService = binService;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public List<WarehouseResponse> list(@RequestParam(required = false) Long branchId) {
        return service.list(branchId);
    }

    @GetMapping("/tree")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public WarehouseService.WarehouseTree tree(@RequestParam(required = false) Long branchId) {
        return service.getTree(branchId);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<WarehouseResponse> create(
            @Valid @RequestBody WarehouseRequestDto req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<WarehouseResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody WarehouseRequestDto req) {
        return ResponseEntity.ok(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{id}/bins")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public List<BinResponse> getBins(@PathVariable Long id) {
        return binService.getBinResponsesByWarehouse(id);
    }

    // --- STOCK ENDPOINTS (Moved from WarehouseStockController) ---

    @GetMapping("/{id}/stock")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public List<WarehouseStockResponse> stock(@PathVariable Long id) {
        return stockService.getStock(id);
    }

    @GetMapping("/stock/product/{productCode}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public List<WarehouseStockResponse> getStockByProduct(@PathVariable String productCode) {
        return stockService.getStockByProduct(productCode);
    }

    @GetMapping("/{id}/stock/summary")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public WarehouseStockSummary getStockSummary(@PathVariable Long id) {
        return stockService.getStockSummary(id);
    }

    @GetMapping("/{id}/stock/product/{productId}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public java.math.BigDecimal getProductStock(
            @PathVariable Long id,
            @PathVariable Long productId,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) Long locatorId,
            @RequestParam(required = false) Long binId) {
        return stockService.getAvailableStockWithFilters(id, productId, zoneId, locatorId, binId);
    }

    @GetMapping("/{id}/stock/aggregate")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public java.math.BigDecimal getAggregateLocationStock(
            @PathVariable Long id,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) Long locatorId,
            @RequestParam(required = false) Long binId) {
        return stockService.getAvailableStockWithFilters(id, null, zoneId, locatorId, binId);
    }

    /**
     * Returns all batches (batchNumber, expiryDate, availableQty) for a given
     * product in this warehouse, optionally filtered down to a specific bin.
     * Only batches with qty > 0 are returned.
     * Used by the Stock Transfer batch picker.
     */
    @GetMapping("/{id}/stock/product/{productId}/batches")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public List<BatchStockRow> getProductBatches(
            @PathVariable Long id,
            @PathVariable Long productId,
            @RequestParam(required = false) Long binId) {
        return stockService.getAvailableBatchesForProduct(id, productId, binId);
    }

    public record BatchStockRow(String batchNumber, String expiryDate, int availableQty) {}

    public record WarehouseStockSummary(
            int totalSkus,
            int totalQty,
            int fastMoving,
            int expiring,
            int reserved,
            int deadStock) {
    }
}
