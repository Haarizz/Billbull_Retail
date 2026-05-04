package com.billbull.backend.inventory.stocktake;

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

    private final StockTakeService service;

    public StockTakeController(StockTakeService service) {
        this.service = service;
    }

    @PostMapping("/sessions")
    public ResponseEntity<?> createSession(@RequestBody StockTakeSessionRequest req) {
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
        return ResponseEntity.ok(service.getProductsForStockTake(
                stockTakeType, warehouseId, countType, categoryId, brandId, search, page, size));
    }

    @GetMapping("/sessions")
    public ResponseEntity<List<StockTakeSession>> getAllSessions() {
        return ResponseEntity.ok(service.getAllSessions());
    }

    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<StockTakeSession> getSession(@PathVariable String sessionId) {
        return ResponseEntity.ok(service.getSession(sessionId));
    }

    @PutMapping("/items/{itemId}/count")
    public ResponseEntity<StockTakeItem> updateItemCount(
            @PathVariable Long itemId,
            @RequestParam(required = false) Integer countedQty) {
        return ResponseEntity.ok(service.updateItemCount(itemId, countedQty));
    }

    @PatchMapping("/items/{itemId}/bin")
    public ResponseEntity<StockTakeItem> updateItemBin(
            @PathVariable Long itemId,
            @RequestParam(required = false) Long binId) {
        return ResponseEntity.ok(service.updateItemBin(itemId, binId));
    }

    @PostMapping("/sessions/{sessionId}/items")
    public ResponseEntity<StockTakeItem> addItemToSession(
            @PathVariable String sessionId,
            @RequestParam Long productId,
            @RequestParam(required = false, defaultValue = "1") Integer initialCount) {
        return ResponseEntity.ok(service.addItemToSession(sessionId, productId, initialCount));
    }

    @PostMapping("/sessions/{sessionId}/submit")
    public ResponseEntity<StockTakeSession> submitForApproval(@PathVariable String sessionId) {
        return ResponseEntity.ok(service.submitForApproval(sessionId));
    }

    @PostMapping("/sessions/{sessionId}/bulk-update")
    public ResponseEntity<List<StockTakeItem>> bulkUpdateItems(
            @PathVariable String sessionId,
            @RequestBody List<StockTakeItemUpdateDTO> updates) {
        return ResponseEntity.ok(service.bulkUpdateItems(sessionId, updates));
    }

    @PostMapping("/sessions/{sessionId}/approve")
    public ResponseEntity<StockTakeSession> approveSession(
            @PathVariable String sessionId,
            @RequestParam String approvedBy) {
        return ResponseEntity.ok(service.approveSession(sessionId, approvedBy));
    }

    @PostMapping("/sessions/{sessionId}/reject")
    public ResponseEntity<StockTakeSession> rejectSession(@PathVariable String sessionId) {
        return ResponseEntity.ok(service.rejectSession(sessionId));
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Void> deleteSession(@PathVariable String sessionId) {
        service.deleteSession(sessionId);
        return ResponseEntity.ok().build();
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/items/{itemId}")
    public ResponseEntity<Void> deleteItem(@PathVariable Long itemId) {
        service.deleteItem(itemId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/items/{itemId}/batches")
    public ResponseEntity<?> addBatch(@PathVariable Long itemId, @RequestBody BatchRequest req) {
        try {
            return ResponseEntity.ok(service.addBatch(itemId, req.batchNumber, req.expiryDate, req.quantity));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/batches/{batchId}")
    public ResponseEntity<?> updateBatch(@PathVariable Long batchId, @RequestBody BatchRequest req) {
        try {
            return ResponseEntity.ok(service.updateBatch(batchId, req.batchNumber, req.expiryDate, req.quantity));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/batches/{batchId}")
    public ResponseEntity<?> deleteBatch(@PathVariable Long batchId) {
        try {
            service.deleteBatch(batchId);
            return ResponseEntity.ok().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/items/{itemId}/batches/next-number")
    public ResponseEntity<?> previewNextBatchNumber(@PathVariable Long itemId) {
        return ResponseEntity.ok(java.util.Map.of("batchNumber", service.previewNextBatchNumber(itemId)));
    }

    public static class BatchRequest {
        public String batchNumber;
        public java.time.LocalDate expiryDate;
        public Integer quantity;
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
