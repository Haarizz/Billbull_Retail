package com.billbull.backend.purchase.stockmovement;

import java.time.LocalDate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class StockMovementService {

    private final StockMovementRepository repository;

    public StockMovementService(StockMovementRepository repository) {
        this.repository = repository;
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

        repository.save(sm);
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

        if (productId == null)
            throw new IllegalArgumentException("Product ID is required for outbound stock");
        if (warehouseId == null)
            throw new IllegalArgumentException("Warehouse ID is required for outbound stock");
        if (qty == null || qty <= 0)
            throw new IllegalArgumentException("Outbound quantity must be positive; got: " + qty);

        // Anti-duplication guard
        boolean alreadyDecreased = repository.existsBySourceTypeAndSourceIdAndProductId(
                sourceType, sourceId, productId);

        if (alreadyDecreased)
            throw new IllegalStateException(
                    "Outbound stock already posted for " + sourceType + " #" + sourceId
                            + " product #" + productId + ". Duplicate deduction blocked.");

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

        repository.save(sm);
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

        repository.save(sm);
    }
}
