package com.billbull.backend.inventory.warehouse;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Service;

@Service
public class WarehouseSourceResolutionService {

    private final WarehouseRepository warehouseRepository;
    private final WarehouseStockService warehouseStockService;

    public WarehouseSourceResolutionService(WarehouseRepository warehouseRepository,
                                            WarehouseStockService warehouseStockService) {
        this.warehouseRepository = warehouseRepository;
        this.warehouseStockService = warehouseStockService;
    }

    /**
     * Resolves exactly ONE source warehouse for an entire transaction (cart-level).
     *
     * @param branchId             The branch ID of the transaction.
     * @param items                The items in the transaction with their required base quantities.
     * @param preferredWarehouseId The preferred warehouse (e.g. user-selected or branch default).
     * @return A WarehouseResolutionResult containing the selected warehouse.
     */
    public WarehouseResolutionResult resolveSourceWarehouseForTransaction(Long branchId,
                                                                          List<WarehouseResolutionItem> items,
                                                                          Long preferredWarehouseId,
                                                                          boolean enforceStockAvailability) {
        return resolveSourceWarehouseForTransaction(branchId, items, preferredWarehouseId,
                enforceStockAvailability, true);
    }

    /**
     * Same as {@link #resolveSourceWarehouseForTransaction(Long, List, Long, boolean)}, but lets the
     * caller opt out of step 2 (scanning the branch's other active warehouses).
     *
     * <p>POS is single-warehouse by design: it sells only from the branch's default warehouse, so it
     * passes {@code allowAutomaticFallback = false} and gets {@code null} back rather than a silent
     * switch to another warehouse. Every other flow (standard/B2B sales, layaway) keeps the default
     * {@code true} behaviour.
     */
    public WarehouseResolutionResult resolveSourceWarehouseForTransaction(Long branchId,
                                                                          List<WarehouseResolutionItem> items,
                                                                          Long preferredWarehouseId,
                                                                          boolean enforceStockAvailability,
                                                                          boolean allowAutomaticFallback) {
        if (items == null || items.isEmpty()) {
            throw new IllegalStateException("Cannot resolve warehouse for empty transaction items.");
        }

        // 1. Try preferred warehouse first
        if (preferredWarehouseId != null) {
            Warehouse preferred = warehouseRepository.findById(preferredWarehouseId).orElse(null);
            if (preferred != null && preferred.isActive() && preferred.getBranch() != null
                    && preferred.getBranch().getId().equals(branchId)) {
                
                if (!enforceStockAvailability || canFulfillAll(items, preferredWarehouseId)) {
                    return new WarehouseResolutionResult(preferredWarehouseId, preferred.getName(), "PREFERRED_SUFFICIENT");
                }
            }
        }
        
        if (!allowAutomaticFallback) {
            return null;
        }

        // 2. Fetch fallback candidates in same branch
        List<Warehouse> candidates = warehouseRepository.findByBranch_IdAndStatusOrderByIdAsc(branchId, "Active");

        for (Warehouse candidate : candidates) {
            // Skip if it was already evaluated as preferred
            if (preferredWarehouseId != null && candidate.getId().equals(preferredWarehouseId)) {
                continue;
            }

            if (!enforceStockAvailability || canFulfillAll(items, candidate.getId())) {
                return new WarehouseResolutionResult(candidate.getId(), candidate.getName(), "FALLBACK_SELECTED");
            }
        }

        return null;
    }

    private boolean canFulfillAll(List<WarehouseResolutionItem> items, Long warehouseId) {
        java.util.Map<Long, Integer> productTotals = new java.util.HashMap<>();
        for (WarehouseResolutionItem item : items) {
            if (item.getProductId() != null && item.getBaseRequestedQuantity() > 0) {
                productTotals.merge(item.getProductId(), item.getBaseRequestedQuantity(), Integer::sum);
            }
        }

        for (java.util.Map.Entry<Long, Integer> entry : productTotals.entrySet()) {
            Long productId = entry.getKey();
            int totalRequested = entry.getValue();

            BigDecimal netAvailable = warehouseStockService.getAvailableStock(warehouseId, productId);
            if (netAvailable == null || netAvailable.compareTo(BigDecimal.valueOf(totalRequested)) < 0) {
                return false; // Fails for this warehouse if any product total is short
            }
        }
        return true;
    }
}
