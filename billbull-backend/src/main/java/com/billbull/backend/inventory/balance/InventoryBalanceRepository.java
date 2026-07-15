package com.billbull.backend.inventory.balance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface InventoryBalanceRepository extends JpaRepository<InventoryBalance, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM InventoryBalance b WHERE b.productId = :productId AND b.warehouseId = :warehouseId")
    Optional<InventoryBalance> findForUpdate(
            @Param("productId") Long productId,
            @Param("warehouseId") Long warehouseId);

    Optional<InventoryBalance> findByProductIdAndWarehouseId(Long productId, Long warehouseId);

    List<InventoryBalance> findByWarehouseId(Long warehouseId);

    List<InventoryBalance> findByProductId(Long productId);

    @Query("SELECT b FROM InventoryBalance b WHERE b.onHandQty > 0 ORDER BY b.productCode ASC")
    List<InventoryBalance> findAllPositiveStock();

    @Query("SELECT COALESCE(SUM(b.totalValue), 0) FROM InventoryBalance b WHERE b.warehouseId = :warehouseId")
    java.math.BigDecimal sumTotalValueByWarehouse(@Param("warehouseId") Long warehouseId);

    @Query("SELECT COALESCE(SUM(b.totalValue), 0) FROM InventoryBalance b")
    java.math.BigDecimal sumTotalValue();

    // =========================================================================================
    // Branch-Level Inventory Phase 4 — branch-scoped variants of the two cross-warehouse reads.
    // Used only when inventory.branch-scope.enabled is on AND a specific branch is active (via
    // InventoryBranchScopeResolver); the unscoped methods above remain the admin/All-Branches and
    // toggle-off path (byte-identical behaviour). Global rows (branch_id IS NULL) stay visible in
    // every branch. `branchIds` is never empty (ListScope -1 sentinel), so the IN clause is valid.
    // The per-warehouse reads (findByWarehouseId / sumTotalValueByWarehouse) need no variant — a
    // warehouse belongs to exactly one branch, so they are already branch-correct.
    // =========================================================================================

    /** Branch-scoped variant of {@link #findAllPositiveStock}. */
    @Query("""
            SELECT b FROM InventoryBalance b
            WHERE b.onHandQty > 0
              AND (b.branchId IN :branchIds OR b.branchId IS NULL)
            ORDER BY b.productCode ASC
            """)
    List<InventoryBalance> findAllPositiveStockByBranchIdIn(
            @Param("branchIds") java.util.Collection<Long> branchIds);

    /** Branch-scoped variant of {@link #sumTotalValue}. */
    @Query("""
            SELECT COALESCE(SUM(b.totalValue), 0) FROM InventoryBalance b
            WHERE (b.branchId IN :branchIds OR b.branchId IS NULL)
            """)
    java.math.BigDecimal sumTotalValueByBranchIdIn(
            @Param("branchIds") java.util.Collection<Long> branchIds);
}
