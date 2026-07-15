package com.billbull.backend.purchase.stockmovement;

import java.time.LocalDate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class StockMovementService {

    private final StockMovementRepository repository;
    private final com.billbull.backend.inventory.product.ProductRepository productRepository;
    private final com.billbull.backend.notification.NotificationEventPublisher notifPublisher;
    private final com.billbull.backend.inventory.balance.InventoryBalanceService inventoryBalanceService;
    private final com.billbull.backend.inventory.warehouse.WarehouseRepository warehouseRepository;

    public StockMovementService(
            StockMovementRepository repository,
            com.billbull.backend.inventory.product.ProductRepository productRepository,
            com.billbull.backend.notification.NotificationEventPublisher notifPublisher,
            com.billbull.backend.inventory.balance.InventoryBalanceService inventoryBalanceService,
            com.billbull.backend.inventory.warehouse.WarehouseRepository warehouseRepository) {
        this.repository = repository;
        this.productRepository = productRepository;
        this.notifPublisher = notifPublisher;
        this.inventoryBalanceService = inventoryBalanceService;
        this.warehouseRepository = warehouseRepository;
    }

    // =========================================================
    // Branch-Level Inventory Phase 2 — centralized write-path branch stamping.
    // Every StockMovement (created here OR by StockTakeService / StockTransferService)
    // is stamped with the branch derived from its warehouse via stampBranch(...), the
    // single stamping mechanism. Read paths are unchanged; nothing filters on branch_id
    // yet. The column stays NULL for global/branchless warehouses (visible to all).
    // =========================================================

    /**
     * Resolve the branch a warehouse belongs to. Returns null when the warehouse has no branch
     * (global), does not exist (orphan), or the id is null — stamping is always null-safe and
     * never throws, so no existing write path can be broken by this.
     */
    @Transactional(readOnly = true)
    public Long resolveBranchIdForWarehouse(Long warehouseId) {
        if (warehouseId == null) {
            return null;
        }
        return warehouseRepository.findBranchIdByWarehouseId(warehouseId);
    }

    /**
     * Stamp a movement's branch from its warehouse, unless a branch is already set (idempotent —
     * a caller that already knows the branch, e.g. a cross-branch transfer leg, is preserved).
     * This is THE single stamping mechanism for the whole codebase; call it immediately before
     * persisting any StockMovement.
     */
    public void stampBranch(StockMovement sm) {
        if (sm == null || sm.getBranchId() != null) {
            return;
        }
        sm.setBranchId(resolveBranchIdForWarehouse(sm.getWarehouseId()));
    }

    public java.math.BigDecimal getAvailableStock(Long warehouseId, Long productId) {
        return repository.getAvailableStock(warehouseId, productId);
    }

    @Transactional
    public java.math.BigDecimal getAvailableStockForUpdate(Long warehouseId, Long productId) {
        return repository.getAvailableStockForUpdate(warehouseId, productId);
    }

    /**
     * Returns the unit cost to use for outbound stock (COGS calculation).
     * Priority: weighted average cost from actual inbound movements (GRN/Purchase)
     *           → fallbackCost (typically product.getPricing().getCost()).
     * Returns null if neither source has a valid cost — caller must reject.
     */
    @Transactional(readOnly = true)
    public java.math.BigDecimal getCostForOutbound(Long productId, Long warehouseId,
            java.math.BigDecimal fallbackCost) {
        java.math.BigDecimal wac = repository.getWeightedAverageCost(productId, warehouseId);
        if (wac != null && wac.compareTo(java.math.BigDecimal.ZERO) > 0) {
            return wac;
        }
        return fallbackCost; // may be null if product cost is not configured
    }

    // =========================================================
    // SINGLE SOURCE OF TRUTH: Full hierarchy inbound stock post
    // Called by GrnService and PurchaseInvoiceService ONLY.
    // =========================================================
    public void postInboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long zoneId, // nullable
            Long locatorId, // nullable
            Long binId, // nullable
            Integer qty,
            String ref) {

        if (productId == null)
            throw new IllegalArgumentException("Product ID is required for stock posting");

        if (warehouseId == null)
            throw new IllegalArgumentException("Warehouse ID is required for stock posting");

        if (qty == null || qty <= 0)
            throw new IllegalArgumentException("Quantity must be positive; got: " + qty);

        // Anti-duplication guard: same source document + same product = already posted
        boolean alreadyPosted = repository.existsBySourceTypeAndSourceIdAndProductId(
                sourceType, sourceId, productId);

        if (alreadyPosted)
            throw new IllegalStateException(
                    "Stock already posted for " + sourceType + " #" + sourceId
                            + " product #" + productId + ". Duplicate posting blocked.");

        StockMovement sm = new StockMovement();
        sm.setSourceType(sourceType);
        sm.setSourceId(sourceId);
        sm.setProductId(productId);
        sm.setWarehouseId(warehouseId);
        sm.setZoneId(zoneId);
        sm.setLocatorId(locatorId);
        sm.setBinId(binId);
        sm.setQuantity(qty);
        sm.setReferenceNo(ref);
        sm.setMovementDate(LocalDate.now());

        stampBranch(sm);
        repository.save(sm);
        refreshBalance(productId, warehouseId);
    }

    public void postInboundSerializedStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long zoneId,
            Long locatorId,
            Long binId,
            String serialNumber,
            LocalDate expiryDate,
            java.math.BigDecimal unitCost,
            String ref) {

        if (productId == null)
            throw new IllegalArgumentException("Product ID is required for serialized stock posting");

        if (warehouseId == null)
            throw new IllegalArgumentException("Warehouse ID is required for serialized stock posting");

        String normalizedSerialNumber = normalizeSerialNumber(serialNumber);
        if (normalizedSerialNumber == null)
            throw new IllegalArgumentException("Serial number is required for serialized inbound stock posting");

        boolean alreadyPosted = repository.existsInboundSerialIdentity(
                sourceType.name(), sourceId, productId, warehouseId, normalizedSerialNumber);

        if (alreadyPosted)
            throw new IllegalStateException(
                    "Inbound serialized stock already posted for " + sourceType + " #" + sourceId
                            + " product #" + productId + " serial '" + normalizedSerialNumber + "'.");

        StockMovement sm = new StockMovement();
        sm.setSourceType(sourceType);
        sm.setSourceId(sourceId);
        sm.setProductId(productId);
        sm.setWarehouseId(warehouseId);
        sm.setZoneId(zoneId);
        sm.setLocatorId(locatorId);
        sm.setBinId(binId);
        sm.setQuantity(1);
        sm.setReferenceNo(ref);
        sm.setMovementDate(LocalDate.now());
        sm.setSerialNumber(normalizedSerialNumber);
        sm.setExpiryDate(expiryDate);
        sm.setUnitCost(unitCost);

        stampBranch(sm);
        repository.save(sm);
        refreshBalance(productId, warehouseId);
    }

    /** Full hierarchy inbound post with exact batch/expiry identity. */
    public void postInboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long zoneId,
            Long locatorId,
            Long binId,
            String batchNumber,
            LocalDate expiryDate,
            java.math.BigDecimal unitCost,
            Integer qty,
            String ref) {

        if (productId == null)
            throw new IllegalArgumentException("Product ID is required for stock posting");

        if (warehouseId == null)
            throw new IllegalArgumentException("Warehouse ID is required for stock posting");

        if (qty == null || qty <= 0)
            throw new IllegalArgumentException("Quantity must be positive; got: " + qty);

        String normalizedBatchNumber = normalizeBatchNumber(batchNumber);
        if (normalizedBatchNumber == null)
            throw new IllegalArgumentException("Batch number is required for batch-aware inbound stock posting");

        boolean alreadyPosted = repository.existsInboundIdentity(
                sourceType.name(), sourceId, productId, warehouseId, binId, normalizedBatchNumber, expiryDate);

        if (alreadyPosted)
            throw new IllegalStateException(
                    "Inbound stock already posted for " + sourceType + " #" + sourceId
                            + " product #" + productId + " in the same stock identity. Duplicate posting blocked.");

        StockMovement sm = new StockMovement();
        sm.setSourceType(sourceType);
        sm.setSourceId(sourceId);
        sm.setProductId(productId);
        sm.setWarehouseId(warehouseId);
        sm.setZoneId(zoneId);
        sm.setLocatorId(locatorId);
        sm.setBinId(binId);
        sm.setQuantity(qty);
        sm.setReferenceNo(ref);
        sm.setMovementDate(LocalDate.now());
        sm.setBatchNumber(normalizedBatchNumber);
        sm.setExpiryDate(expiryDate);
        sm.setUnitCost(unitCost);

        stampBranch(sm);
        repository.save(sm);
        refreshBalance(productId, warehouseId);
    }

    // =========================================================
    // BACKWARD-COMPATIBLE OVERLOADS (delegates to postInboundStock)
    // =========================================================

    /** Without bin (warehouse-level only) */
    public void inward(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Integer qty,
            String ref) {
        postInboundStock(sourceType, sourceId, productId, warehouseId, null, null, null, qty, ref);
    }

    /** With bin but without zone/locator (legacy) */
    public void inward(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long binId,
            Integer qty,
            String ref) {
        postInboundStock(sourceType, sourceId, productId, warehouseId, null, null, binId, qty, ref);
    }

    // =========================================================
    // OUTBOUND STOCK POSTING
    // Called by DeliveryNoteService, SalesInvoiceService (Direct Sale)
    // =========================================================

    /** Backward-compatible outbound post (warehouse-level only) */
    public void postOutboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Integer qty,
            String ref) {
        postOutboundStock(sourceType, sourceId, productId, warehouseId, null, null, null, qty, ref);
    }

    /** Full hierarchy outbound post */
    public void postOutboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long binId,
            Long zoneId,
            Long locatorId,
            Integer qty,
            String ref) {
        postOutboundStock(sourceType, sourceId, productId, warehouseId, binId, zoneId, locatorId, null, null, qty, ref);
    }

    /** Full hierarchy outbound post with exact batch/expiry identity */
    public void postOutboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long binId,
            Long zoneId,
            Long locatorId,
            String batchNumber,
            LocalDate expiryDate,
            Integer qty,
            String ref) {
        postOutboundStock(sourceType, sourceId, productId, warehouseId, binId, zoneId, locatorId,
                batchNumber, expiryDate, qty, ref, false);
    }

    /** Full hierarchy outbound post — negativeOverride=true stamps the movement for audit. */
    public void postOutboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long binId,
            Long zoneId,
            Long locatorId,
            String batchNumber,
            LocalDate expiryDate,
            Integer qty,
            String ref,
            boolean negativeOverride) {

        if (productId == null)
            throw new IllegalArgumentException("Product ID is required for outbound stock");
        if (warehouseId == null)
            throw new IllegalArgumentException("Warehouse ID is required for outbound stock");
        if (qty == null || qty <= 0)
            throw new IllegalArgumentException("Outbound quantity must be positive; got: " + qty);

        String normalizedBatchNumber = normalizeBatchNumber(batchNumber);

        // Anti-duplication guard per stock identity. A single delivery can legitimately
        // split one product across multiple batch/bin rows.
        boolean alreadyDecreased = repository.existsOutboundIdentity(
                sourceType.name(), sourceId, productId, warehouseId, binId, normalizedBatchNumber, expiryDate);

        if (alreadyDecreased)
            throw new IllegalStateException(
                    "Outbound stock already posted for " + sourceType + " #" + sourceId
                            + " product #" + productId + " in the same stock identity. Duplicate deduction blocked.");

        StockMovement sm = new StockMovement();
        sm.setSourceType(sourceType);
        sm.setSourceId(sourceId);
        sm.setProductId(productId);
        sm.setWarehouseId(warehouseId);
        sm.setBinId(binId);
        sm.setZoneId(zoneId);
        sm.setLocatorId(locatorId);
        sm.setQuantity(-qty); // negative for outbound
        sm.setMovementDate(LocalDate.now());
        sm.setReferenceNo(ref);
        sm.setBatchNumber(normalizedBatchNumber);
        sm.setExpiryDate(expiryDate);
        sm.setNegativeOverride(negativeOverride);

        stampBranch(sm);
        repository.save(sm);
        refreshBalance(productId, warehouseId);

        // Low stock check
        try {
            productRepository.findById(productId).ifPresent(p -> {
                int reorderLevel = p.getInventory() != null && p.getInventory().getReorderLevel() != null ? p.getInventory().getReorderLevel() : 0;
                if (reorderLevel > 0) {
                    java.math.BigDecimal available = repository.getAvailableStock(warehouseId, productId);
                    if (available != null && available.compareTo(java.math.BigDecimal.valueOf(reorderLevel)) <= 0) {
                        notifPublisher.lowStockAlert(
                                p.getName(),
                                p.getCode() != null ? p.getCode() : "P-" + productId,
                                available.intValue(),
                                reorderLevel
                        );
                    }
                }
            });
        } catch (Exception e) {
            // Ignore notification errors to not block transaction
        }
    }

    // =========================================================
    // STOCK REVERSAL (CANCELLATION)
    // Bypasses duplication checks since it offsets an existing post
    // =========================================================
    /** Backward-compatible reversal (warehouse-level only) */
    public void reverseOutboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Integer qty,
            String ref) {
        reverseOutboundStock(sourceType, sourceId, productId, warehouseId, null, null, null, qty, ref);
    }

    /** Full hierarchy reversal */
    public void reverseOutboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long binId,
            Long zoneId,
            Long locatorId,
            Integer qty,
            String ref) {
        reverseOutboundStock(sourceType, sourceId, productId, warehouseId, binId, zoneId, locatorId,
                null, null, qty, ref);
    }

    /** Full hierarchy reversal with exact batch/expiry identity */
    public void reverseOutboundStock(
            StockSourceType sourceType,
            Long sourceId,
            Long productId,
            Long warehouseId,
            Long binId,
            Long zoneId,
            Long locatorId,
            String batchNumber,
            LocalDate expiryDate,
            Integer qty,
            String ref) {

        if (productId == null)
            throw new IllegalArgumentException("Product ID is required for stock reversal");
        if (warehouseId == null)
            throw new IllegalArgumentException("Warehouse ID is required for stock reversal");
        if (qty == null || qty <= 0)
            throw new IllegalArgumentException("Reversal quantity must be positive; got: " + qty);

        StockMovement sm = new StockMovement();
        sm.setSourceType(sourceType);
        sm.setSourceId(sourceId);
        sm.setProductId(productId);
        sm.setWarehouseId(warehouseId);
        sm.setBinId(binId);
        sm.setZoneId(zoneId);
        sm.setLocatorId(locatorId);
        sm.setQuantity(qty); // positive for returning outbound stock
        sm.setMovementDate(LocalDate.now());
        sm.setReferenceNo(ref);
        sm.setBatchNumber(normalizeBatchNumber(batchNumber));
        sm.setExpiryDate(expiryDate);

        stampBranch(sm);
        repository.save(sm);
        refreshBalance(productId, warehouseId);
    }

    private void refreshBalance(Long productId, Long warehouseId) {
        try {
            inventoryBalanceService.refresh(productId, warehouseId);
        } catch (Exception e) {
            // Never block stock posting due to balance refresh failure; log for investigation.
            org.slf4j.LoggerFactory.getLogger(StockMovementService.class)
                    .error("[InventoryBalance] Failed to refresh balance for product={} warehouse={}: {}",
                            productId, warehouseId, e.getMessage());
        }
    }

    private String normalizeBatchNumber(String batchNumber) {
        if (batchNumber == null) {
            return null;
        }
        String trimmed = batchNumber.trim();
        return trimmed.isEmpty() || "-".equals(trimmed) ? null : trimmed;
    }

    private String normalizeSerialNumber(String serialNumber) {
        if (serialNumber == null) {
            return null;
        }
        String trimmed = serialNumber.trim();
        return trimmed.isEmpty() || "-".equals(trimmed) ? null : trimmed.toUpperCase(java.util.Locale.ROOT);
    }
}
