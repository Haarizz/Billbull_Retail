package com.billbull.backend.inventory.stocktake;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventory/stock-take")
public class StockTakeController {

    private static final String MODULE = "inventory.stock";

    private final StockTakeService service;
    private final ModulePermissionService modulePermissionService;

    public StockTakeController(StockTakeService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @PostMapping("/sessions")
    public ResponseEntity<?> createSession(@RequestBody StockTakeSessionRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        try {
            Long categoryId = (req.selectedCategoryIds != null && !req.selectedCategoryIds.isEmpty())
                    ? req.selectedCategoryIds.get(0) : null;
            Long brandId = (req.selectedBrandIds != null && !req.selectedBrandIds.isEmpty())
                    ? req.selectedBrandIds.get(0) : null;
            return ResponseEntity.ok(service.createSession(
                req.warehouseName, req.warehouseId, req.type, req.countType, req.createdBy, categoryId, brandId));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/products")
    public ResponseEntity<?> getProductsForStockTake(
            @RequestParam String stockTakeType,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(defaultValue = "Full Stock Take (All Items)") String countType,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) Long brandId,
            @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "15") int size) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getProductsForStockTake(
                stockTakeType, warehouseId, countType, categoryId, brandId, search, page, size));
    }

    @GetMapping("/sessions")
    public ResponseEntity<List<StockTakeSession>> getAllSessions() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAllSessions());
    }

    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<StockTakeSession> getSession(@PathVariable String sessionId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getSession(sessionId));
    }

    @PostMapping("/sessions/{sessionId}/unit-scans")
    public ResponseEntity<?> scanUnitBarcode(
            @PathVariable String sessionId,
            @RequestBody StockTakeUnitScanRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.scanUnitBarcode(sessionId, req));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/sessions/{sessionId}/coverage")
    public ResponseEntity<StockTakeCoverageResponse> getCoverage(@PathVariable String sessionId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getCoverage(sessionId));
    }

    @PatchMapping("/unit-scans/{scanId}/resolve")
    public ResponseEntity<?> resolveUnitScan(
            @PathVariable Long scanId,
            @RequestBody StockTakeUnitScanResolveRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.resolveUnitScan(scanId, req));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/items/{itemId}/count")
    public ResponseEntity<StockTakeItem> updateItemCount(
            @PathVariable Long itemId,
            @RequestParam(required = false) Integer countedQty) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.updateItemCount(itemId, countedQty));
    }

    @PatchMapping("/items/{itemId}/bin")
    public ResponseEntity<StockTakeItem> updateItemBin(
            @PathVariable Long itemId,
            @RequestParam(required = false) Long binId) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.updateItemBin(itemId, binId));
    }

    @PostMapping("/sessions/{sessionId}/items")
    public ResponseEntity<?> addItemToSession(
            @PathVariable String sessionId,
            @RequestParam Long productId,
            @RequestParam(required = false, defaultValue = "1") Integer initialCount,
            @RequestParam(required = false) Long binId) {
        modulePermissionService.requireCanCreate(MODULE);
        try {
            return ResponseEntity.ok(service.addItemToSession(sessionId, productId, initialCount, binId));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/sessions/{sessionId}/submit")
    public ResponseEntity<StockTakeSession> submitForApproval(@PathVariable String sessionId) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.submitForApproval(sessionId));
    }

    @PostMapping("/sessions/{sessionId}/bulk-update")
    public ResponseEntity<List<StockTakeItem>> bulkUpdateItems(
            @PathVariable String sessionId,
            @RequestBody List<StockTakeItemUpdateDTO> updates) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.bulkUpdateItems(sessionId, updates));
    }

    @PostMapping("/sessions/{sessionId}/approve")
    public ResponseEntity<StockTakeSession> approveSession(
            @PathVariable String sessionId,
            @RequestParam String approvedBy) {
        // Approving posts stock adjustments — governed by the APPROVE vertical.
        // Roles that should approve stock takes need Approve granted on inventory
        // in the role matrix (ADMIN has it by default).
        modulePermissionService.requireCanApprove(MODULE);
        return ResponseEntity.ok(service.approveSession(sessionId, approvedBy));
    }

    @PostMapping("/sessions/{sessionId}/reject")
    public ResponseEntity<StockTakeSession> rejectSession(@PathVariable String sessionId) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.rejectSession(sessionId));
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Void> deleteSession(@PathVariable String sessionId) {
        modulePermissionService.requireCanEdit(MODULE);
        service.deleteSession(sessionId);
        return ResponseEntity.ok().build();
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/items/{itemId}")
    public ResponseEntity<Void> deleteItem(@PathVariable Long itemId) {
        modulePermissionService.requireCanEdit(MODULE);
        service.deleteItem(itemId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/items/{itemId}/batches")
    public ResponseEntity<?> addBatch(@PathVariable Long itemId, @RequestBody BatchRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        try {
            // Returns N unit rows for a lot of qty=N. Each row shares the lot prefix
            // and differs only in its trailing -{unitIndex}.
            return ResponseEntity.ok(service.addBatch(itemId, req.batchNumber, req.expiryDate, req.quantity));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/batches/{batchId}")
    public ResponseEntity<?> updateBatch(@PathVariable Long batchId, @RequestBody BatchRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.updateBatch(batchId, req.batchNumber, req.expiryDate, req.quantity));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/batches/{batchId}")
    public ResponseEntity<?> deleteBatch(@PathVariable Long batchId) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            service.deleteBatch(batchId);
            return ResponseEntity.ok().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/items/{itemId}/batches/next-number")
    public ResponseEntity<?> previewNextBatchNumber(@PathVariable Long itemId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(java.util.Map.of("batchNumber", service.previewNextBatchNumber(itemId)));
    }

    @PutMapping("/items/{itemId}/lots")
    public ResponseEntity<?> updateLot(@PathVariable Long itemId, @RequestBody LotUpdateRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.updateLot(
                    itemId,
                    req.lotPrefix,
                    req.matchExpiry,
                    req.seeded != null && req.seeded,
                    req.newBatchNumber,
                    req.newExpiryDate,
                    req.newQuantity));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/items/{itemId}/lots")
    public ResponseEntity<?> deleteLot(
            @PathVariable Long itemId,
            @RequestParam String lotPrefix,
            @RequestParam(required = false) java.time.LocalDate matchExpiry,
            @RequestParam(required = false, defaultValue = "false") boolean seeded) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            service.deleteLot(itemId, lotPrefix, matchExpiry, seeded);
            return ResponseEntity.ok().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    public static class BatchRequest {
        public String batchNumber;
        public java.time.LocalDate expiryDate;
        public Integer quantity;
    }

    public static class LotUpdateRequest {
        public String lotPrefix;                       // current lot prefix to locate the rows
        public java.time.LocalDate matchExpiry;        // current expiry date (may be null)
        public Boolean seeded;                          // current seeded flag (defaults false)
        public String newBatchNumber;                  // optional rename
        public java.time.LocalDate newExpiryDate;      // optional new expiry
        public Integer newQuantity;                    // optional unit-row count to grow/shrink to
    }

    public static class StockTakeSessionRequest {
        public String warehouseName;
        public Long warehouseId;
        public String type;
        public String countType;
        public String createdBy;
        public java.util.List<Long> selectedCategoryIds;
        public java.util.List<Long> selectedBrandIds;
    }
}
