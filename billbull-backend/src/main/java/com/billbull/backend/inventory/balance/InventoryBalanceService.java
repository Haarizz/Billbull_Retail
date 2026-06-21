package com.billbull.backend.inventory.balance;

import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Maintains the pre-aggregated inventory_balances table (PDF §19 / F-19).
 *
 * Call {@link #refresh(Long, Long)} after every StockMovement write so the table
 * stays in sync. Reports query this table for O(1) lookups instead of scanning
 * the full stock_movements ledger.
 *
 * Uses REQUIRES_NEW so the balance row is committed in its own transaction —
 * a failure in the caller's transaction does NOT roll back the balance update
 * (consistent with the stock movement already being visible).
 */
@Service
@Slf4j
public class InventoryBalanceService {

    private final InventoryBalanceRepository balanceRepository;
    private final StockMovementRepository    movementRepository;
    private final ProductRepository          productRepository;
    private final WarehouseRepository        warehouseRepository;

    public InventoryBalanceService(
            InventoryBalanceRepository balanceRepository,
            StockMovementRepository    movementRepository,
            ProductRepository          productRepository,
            WarehouseRepository        warehouseRepository) {
        this.balanceRepository  = balanceRepository;
        this.movementRepository = movementRepository;
        this.productRepository  = productRepository;
        this.warehouseRepository = warehouseRepository;
    }

    /**
     * Re-derives and persists the balance row for the given (product, warehouse)
     * from the live stock_movements ledger.
     *
     * @param productId   the product whose balance changed
     * @param warehouseId the warehouse affected
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public InventoryBalance refresh(Long productId, Long warehouseId) {
        if (productId == null || warehouseId == null) return null;

        InventoryBalance balance = balanceRepository
                .findForUpdate(productId, warehouseId)
                .orElseGet(() -> {
                    InventoryBalance b = new InventoryBalance();
                    b.setProductId(productId);
                    b.setWarehouseId(warehouseId);
                    return b;
                });

        // Derive on-hand qty from ledger
        BigDecimal onHand = movementRepository.getAvailableStock(warehouseId, productId);
        if (onHand == null) onHand = BigDecimal.ZERO;

        // Derive WAC from positive (inbound) movements with unit cost
        BigDecimal wac = movementRepository.getWeightedAverageCost(productId, warehouseId);
        if (wac == null) wac = BigDecimal.ZERO;

        BigDecimal totalValue = wac.multiply(onHand.max(BigDecimal.ZERO))
                .setScale(2, java.math.RoundingMode.HALF_UP);

        balance.setOnHandQty(onHand);
        balance.setAvgCost(wac.setScale(4, java.math.RoundingMode.HALF_UP));
        balance.setTotalValue(totalValue);
        balance.setUpdatedAt(LocalDateTime.now());

        // Populate denormalized descriptors (one-time; cheap lookup, never null for valid IDs)
        if (balance.getProductName() == null) {
            productRepository.findById(productId).ifPresent(p -> {
                balance.setProductCode(p.getCode());
                balance.setProductName(p.getName());
            });
        }
        if (balance.getWarehouseName() == null) {
            warehouseRepository.findById(warehouseId).ifPresent(w ->
                    balance.setWarehouseName(w.getName()));
        }

        return balanceRepository.save(balance);
    }

    /**
     * Full rebuild: re-derives every (product, warehouse) row from stock_movements.
     * Use for initial data load or after bulk imports.
     */
    @Transactional
    public int rebuildAll() {
        // Fetch all distinct (product, warehouse) pairs that have movements
        List<Object[]> pairs = movementRepository.findAllDistinctProductWarehousePairs();
        int count = 0;
        for (Object[] row : pairs) {
            Long pid = ((Number) row[0]).longValue();
            Long wid = ((Number) row[1]).longValue();
            refresh(pid, wid);
            count++;
        }
        log.info("[InventoryBalance] Rebuilt {} balance rows.", count);
        return count;
    }

    public List<InventoryBalance> findAll() {
        return balanceRepository.findAllPositiveStock();
    }

    public List<InventoryBalance> findByWarehouse(Long warehouseId) {
        return balanceRepository.findByWarehouseId(warehouseId);
    }

    public BigDecimal totalInventoryValue() {
        return balanceRepository.sumTotalValue();
    }

    public BigDecimal totalInventoryValueByWarehouse(Long warehouseId) {
        return balanceRepository.sumTotalValueByWarehouse(warehouseId);
    }
}
