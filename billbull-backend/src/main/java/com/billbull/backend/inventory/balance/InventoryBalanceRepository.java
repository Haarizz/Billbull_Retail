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
}
