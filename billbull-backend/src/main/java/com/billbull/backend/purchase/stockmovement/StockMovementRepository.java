package com.billbull.backend.purchase.stockmovement;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface StockMovementRepository
                extends JpaRepository<StockMovement, Long> {

        boolean existsBySourceTypeAndSourceIdAndProductId(
                        StockSourceType sourceType,
                        Long sourceId,
                        Long productId);

        // ✅ Warehouse stock summary (used by WarehouseStockService)
        @Query("""
                            SELECT sm.productId, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                            GROUP BY sm.productId
                        """)
        List<Object[]> findStockByWarehouse(
                        @Param("warehouseId") Long warehouseId);

        // ✅ Single product available stock (used by Delivery Note dispatch)
        @Query("""
                            SELECT COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                              AND sm.productId = :productId
                        """)
        BigDecimal getAvailableStock(
                        @Param("warehouseId") Long warehouseId,
                        @Param("productId") Long productId);

        // ✅ Single product available stock FOR UPDATE (used by Delivery Note final
        // delivery)
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("""
                            SELECT COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                              AND sm.productId = :productId
                        """)
        BigDecimal getAvailableStockForUpdate(
                        @Param("warehouseId") Long warehouseId,
                        @Param("productId") Long productId);

        // ✅ Product stock across ALL warehouses with warehouse details
        @Query("""
                            SELECT sm.productId, COALESCE(SUM(sm.quantity), 0), w.id, w.name, w.type
                            FROM StockMovement sm, Warehouse w
                            WHERE sm.warehouseId = w.id
                              AND sm.productId = :productId
                            GROUP BY sm.productId, w.id, w.name, w.type
                        """)
        List<Object[]> findStockByProductForAllWarehouses(@Param("productId") Long productId);

        // ✅ Total product stock across ALL warehouses
        @Query("""
                            SELECT COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.productId = :productId
                        """)
        BigDecimal getTotalAvailableStock(@Param("productId") Long productId);

        // ✅ Total product stock across ALL warehouses for multiple products
        @Query("""
                            SELECT sm.productId, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.productId IN :productIds
                            GROUP BY sm.productId
                        """)
        List<Object[]> getTotalAvailableStockForProducts(@Param("productIds") List<Long> productIds);

        @Query("""
                            SELECT sm.productId, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                              AND sm.productId IN :productIds
                            GROUP BY sm.productId
                        """)
        List<Object[]> getAvailableStockForProductsInWarehouse(
                        @Param("warehouseId") Long warehouseId,
                        @Param("productIds") List<Long> productIds);

        // ✅ Total product stock across all warehouses, grouped by warehouse and product
        @Query("""
                            SELECT sm.productId, sm.warehouseId, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            GROUP BY sm.productId, sm.warehouseId
                        """)
        List<Object[]> findAllStockGroupedByProductAndWarehouse();

        @Query("""
                            SELECT sm.productId, sm.warehouseId, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.productId IN :productIds
                            GROUP BY sm.productId, sm.warehouseId
                        """)
        List<Object[]> findStockByProductsForAllWarehouses(@Param("productIds") List<Long> productIds);

        @Query("""
                            SELECT sm.productId, sm.batchNumber, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                            GROUP BY sm.productId, sm.batchNumber
                        """)
        List<Object[]> findStockByWarehouseAndBatch(@Param("warehouseId") Long warehouseId);

        @Query("""
                            SELECT sm.productId, sm.warehouseId, sm.batchNumber, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            GROUP BY sm.productId, sm.warehouseId, sm.batchNumber
                        """)
        List<Object[]> findAllStockGroupedByProductWarehouseAndBatch();

        // ✅ Get Last Sold and Last Received dates for Out of Stock Report
        @Query(value = """
                            SELECT
                                product_id,
                                MAX(CASE WHEN source_type = 'SALES_INVOICE' THEN created_at END) as lastSold,
                                MAX(CASE WHEN source_type IN ('PURCHASE_INVOICE', 'GRN') THEN created_at END) as lastReceived
                            FROM stock_movements
                            WHERE product_id IN :productIds
                            GROUP BY product_id
                        """, nativeQuery = true)
        List<Object[]> findLastMovementDates(@Param("productIds") List<Long> productIds);

        // ✅ Bin stock - get all stock movements for a specific bin
        List<StockMovement> findByBinId(Long binId);

        // ✅ Bin stock summary - get stock by bin grouped by product
        @Query("""
                            SELECT sm.productId, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.binId = :binId
                            GROUP BY sm.productId
                        """)
        List<Object[]> findStockByBin(@Param("binId") Long binId);

        // ✅ Find bins that currently hold stock for a specific product in a warehouse
        // Used by stock-take approval to auto-resolve bin when item has no explicit bin assignment
        @Query("""
                            SELECT sm.binId, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                              AND sm.productId = :productId
                              AND sm.binId IS NOT NULL
                            GROUP BY sm.binId
                            HAVING SUM(sm.quantity) > 0
                            ORDER BY SUM(sm.quantity) DESC
                        """)
        List<Object[]> findActiveBinsByWarehouseAndProduct(
                        @Param("warehouseId") Long warehouseId,
                        @Param("productId") Long productId);

        // ✅ Per-bin stock snapshot: used by stock-take session creation to create one item per (product, bin)
        // Returns rows for both located (binId != null) and unlocated (binId = null) stock
        @Query("""
                            SELECT sm.productId, sm.binId, COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                            GROUP BY sm.productId, sm.binId
                            HAVING SUM(sm.quantity) > 0
                        """)
        List<Object[]> findStockByWarehouseAndBins(@Param("warehouseId") Long warehouseId);

        // ✅ Stock for a specific product in a specific bin (for per-bin system qty refresh)
        @Query("""
                            SELECT COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                              AND sm.productId = :productId
                              AND sm.binId = :binId
                        """)
        BigDecimal getStockByBin(
                        @Param("warehouseId") Long warehouseId,
                        @Param("productId") Long productId,
                        @Param("binId") Long binId);

        // ✅ Weighted average cost — uses unitCost from inbound movements (GRN / Purchase)
        // Returns null if no costed movements exist (caller should fallback to product pricing cost)
        @Query("""
                            SELECT CASE WHEN COALESCE(SUM(sm.quantity), 0) = 0 THEN null
                                        ELSE SUM(sm.unitCost * sm.quantity) / SUM(sm.quantity)
                                   END
                            FROM StockMovement sm
                            WHERE sm.productId = :productId
                              AND sm.warehouseId = :warehouseId
                              AND sm.quantity > 0
                              AND sm.unitCost IS NOT NULL
                              AND sm.unitCost > 0
                        """)
        BigDecimal getWeightedAverageCost(
                        @Param("productId") Long productId,
                        @Param("warehouseId") Long warehouseId);

        // ✅ Batch weighted-average cost per product for a specific warehouse
        // Returns rows: [productId, avgCost]
        @Query("""
                            SELECT sm.productId,
                                   CASE WHEN COALESCE(SUM(sm.quantity), 0) = 0 THEN null
                                        ELSE SUM(sm.unitCost * sm.quantity) / SUM(sm.quantity)
                                   END
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                              AND sm.quantity > 0
                              AND sm.unitCost IS NOT NULL
                              AND sm.unitCost > 0
                            GROUP BY sm.productId
                        """)
        List<Object[]> getBatchWeightedAvgCostByWarehouse(@Param("warehouseId") Long warehouseId);

        // ✅ Batch LIFO cost per product for a specific warehouse
        // "Last-In" = unit cost of the most recently received inbound movement (by movement_date DESC, id DESC)
        // Returns rows: [productId, lifoCost]
        @Query(value = """
                            SELECT t.product_id, t.unit_cost
                            FROM (
                                SELECT product_id, unit_cost,
                                       ROW_NUMBER() OVER (
                                           PARTITION BY product_id
                                           ORDER BY movement_date DESC, id DESC
                                       ) AS rn
                                FROM stock_movements
                                WHERE warehouse_id = :warehouseId
                                  AND quantity > 0
                                  AND unit_cost IS NOT NULL
                                  AND unit_cost > 0
                            ) t
                            WHERE t.rn = 1
                        """, nativeQuery = true)
        List<Object[]> getBatchLifoCostByWarehouse(@Param("warehouseId") Long warehouseId);

        // ✅ Batch FIFO cost per product for a specific warehouse
        // "First-In" = unit cost of the oldest received inbound movement (by movement_date ASC, id ASC)
        // Returns rows: [productId, fifoCost]
        @Query(value = """
                            SELECT t.product_id, t.unit_cost
                            FROM (
                                SELECT product_id, unit_cost,
                                       ROW_NUMBER() OVER (
                                           PARTITION BY product_id
                                           ORDER BY movement_date ASC, id ASC
                                       ) AS rn
                                FROM stock_movements
                                WHERE warehouse_id = :warehouseId
                                  AND quantity > 0
                                  AND unit_cost IS NOT NULL
                                  AND unit_cost > 0
                            ) t
                            WHERE t.rn = 1
                        """, nativeQuery = true)
        List<Object[]> getBatchFifoCostByWarehouse(@Param("warehouseId") Long warehouseId);

        // ✅ Unlocated stock (no bin assigned) for a product in a warehouse
        @Query("""
                            SELECT COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE sm.warehouseId = :warehouseId
                              AND sm.productId = :productId
                              AND sm.binId IS NULL
                        """)
        BigDecimal getUnlocatedStock(
                        @Param("warehouseId") Long warehouseId,
                        @Param("productId") Long productId);

        // ✅ Granular product stock with hierarchical filters
        @Query("""
                            SELECT COALESCE(SUM(sm.quantity), 0)
                            FROM StockMovement sm
                            WHERE (:productId IS NULL OR sm.productId = :productId)
                              AND sm.warehouseId = :warehouseId
                              AND (:binId IS NULL OR sm.binId = :binId)
                              AND (:locatorId IS NULL OR sm.locatorId = :locatorId)
                              AND (:zoneId IS NULL OR sm.zoneId = :zoneId)
                        """)
        BigDecimal getAvailableStockWithFilters(
                        @Param("warehouseId") Long warehouseId,
                        @Param("productId") Long productId,
                        @Param("zoneId") Long zoneId,
                        @Param("locatorId") Long locatorId,
                        @Param("binId") Long binId);
}
