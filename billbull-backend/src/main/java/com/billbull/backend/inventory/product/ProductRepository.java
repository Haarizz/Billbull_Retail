package com.billbull.backend.inventory.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProductRepository extends JpaRepository<Product, Long> {
        boolean existsByCodeAndIsActiveTrue(String code);

        boolean existsByCodeAndStatusNot(String code, ProductStatus status);

        boolean existsBySkuAndIsActiveTrue(String sku);

        boolean existsBySkuAndIdNotAndIsActiveTrue(String sku, Long id);

        Optional<Product> findByCode(String code);

        Optional<Product> findByIdAndIsActiveTrue(Long id);

        List<Product> findAllByIsActiveTrue();

        Optional<Product> findByCodeAndIsActiveTrue(String code);

        @org.springframework.data.jpa.repository.Query("SELECT COUNT(p) FROM Product p WHERE p.department.id = :departmentId AND p.isActive = true")
        long countByDepartmentIdAndIsActiveTrue(Long departmentId);

        @org.springframework.data.jpa.repository.Query("SELECT COUNT(p) FROM Product p WHERE p.subDepartment.id = :subDepartmentId AND p.isActive = true")
        long countBySubDepartmentIdAndIsActiveTrue(Long subDepartmentId);

        @org.springframework.data.jpa.repository.Query("SELECT COUNT(p) FROM Product p WHERE p.brand.id = :brandId AND p.isActive = true")
        long countByBrandIdAndIsActiveTrue(Long brandId);

        @org.springframework.data.jpa.repository.Query("SELECT COUNT(DISTINCT p.brand.id) FROM Product p WHERE p.subDepartment.id = :subDepartmentId AND p.isActive = true")
        long countDistinctBrandBySubDepartmentIdAndIsActiveTrue(Long subDepartmentId);

        /**
         * Paginated list for the product list view. JOIN FETCH avoids lazy-load N+1 for
         * brand and department.
         */
        @Query("SELECT p FROM Product p LEFT JOIN FETCH p.brand LEFT JOIN FETCH p.department WHERE p.isActive = true ORDER BY p.name ASC")
        Page<Product> findAllActiveForList(Pageable pageable);

        /** Paginated search — filters on name, code, SKU, brand name, or any of the product's barcodes. */
        @Query("SELECT p FROM Product p LEFT JOIN FETCH p.brand LEFT JOIN FETCH p.department " +
                        "WHERE p.isActive = true AND (" +
                        "  LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                        "  LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                        "  LOWER(p.sku)  LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                        "  LOWER(p.brand.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                        "  EXISTS (SELECT 1 FROM ProductBarcode pb WHERE pb.product = p AND LOWER(pb.barcode) LIKE LOWER(CONCAT('%', :search, '%')))" +
                        ") ORDER BY p.name ASC")
        Page<Product> findAllActiveBySearch(@org.springframework.data.repository.query.Param("search") String search,
                        Pageable pageable);

        /** Count query needed alongside the paginated fetch above. */
        @Query("SELECT COUNT(p) FROM Product p WHERE p.isActive = true")
        long countAllActive();

        /**
         * Status totals across the whole non-deleted set (respecting the same
         * search/department/brand filters as findAllActiveFiltered), grouped by
         * ProductStatus. Drives the "Active Products" / "Draft Items" cards so they
         * reflect the full catalog instead of just the current page.
         */
        @Query("SELECT p.status, COUNT(p) FROM Product p " +
                        "WHERE p.isActive = true " +
                        "AND (:search = '' OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.sku)  LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.brand.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR EXISTS (SELECT 1 FROM ProductBarcode pb WHERE pb.product = p AND LOWER(pb.barcode) LIKE LOWER(CONCAT('%', :search, '%')))) " +
                        "AND (:departmentId IS NULL OR p.department.id = :departmentId) " +
                        "AND (:brandId IS NULL OR p.brand.id = :brandId) " +
                        "GROUP BY p.status")
        List<Object[]> countByStatusFiltered(
                        @org.springframework.data.repository.query.Param("search") String search,
                        @org.springframework.data.repository.query.Param("departmentId") Long departmentId,
                        @org.springframework.data.repository.query.Param("brandId") Long brandId);

        /**
         * Paginated list of products that have stock movements in the given warehouse.
         */
        @Query("SELECT DISTINCT p FROM Product p LEFT JOIN FETCH p.brand LEFT JOIN FETCH p.department " +
                        "WHERE p.isActive = true AND p.id IN (" +
                        "  SELECT sm.productId FROM StockMovement sm WHERE sm.warehouseId = :warehouseId" +
                        ") ORDER BY p.name ASC")
        Page<Product> findAllActiveForListByWarehouse(
                        @org.springframework.data.repository.query.Param("warehouseId") Long warehouseId,
                        Pageable pageable);

        /**
         * Paginated search filtered by warehouse (products with stock movements in that
         * warehouse).
         */
        @Query("SELECT DISTINCT p FROM Product p LEFT JOIN FETCH p.brand LEFT JOIN FETCH p.department " +
                        "WHERE p.isActive = true AND p.id IN (" +
                        "  SELECT sm.productId FROM StockMovement sm WHERE sm.warehouseId = :warehouseId" +
                        ") AND (" +
                        "  LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                        "  LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                        "  LOWER(p.sku)  LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                        "  LOWER(p.brand.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                        "  EXISTS (SELECT 1 FROM ProductBarcode pb WHERE pb.product = p AND LOWER(pb.barcode) LIKE LOWER(CONCAT('%', :search, '%')))" +
                        ") ORDER BY p.name ASC")
        Page<Product> findAllActiveBySearchAndWarehouse(
                        @org.springframework.data.repository.query.Param("search") String search,
                        @org.springframework.data.repository.query.Param("warehouseId") Long warehouseId,
                        Pageable pageable);

        /**
         * Unified filtered list — handles search + optional department + optional brand.
         * Null parameters are treated as "no filter".
         */
        @Query("SELECT p FROM Product p LEFT JOIN FETCH p.brand LEFT JOIN FETCH p.department " +
                        "WHERE p.isActive = true " +
                        "AND (:search = '' OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.sku)  LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.brand.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR EXISTS (SELECT 1 FROM ProductBarcode pb WHERE pb.product = p AND LOWER(pb.barcode) LIKE LOWER(CONCAT('%', :search, '%')))) " +
                        "AND (:departmentId IS NULL OR p.department.id = :departmentId) " +
                        "AND (:brandId IS NULL OR p.brand.id = :brandId) " +
                        "ORDER BY p.name ASC")
        Page<Product> findAllActiveFiltered(
                        @org.springframework.data.repository.query.Param("search") String search,
                        @org.springframework.data.repository.query.Param("departmentId") Long departmentId,
                        @org.springframework.data.repository.query.Param("brandId") Long brandId,
                        Pageable pageable);

        /**
         * Unified stock-take product query.
         * - warehouseId = null  → Opening Inventory (global, no warehouse restriction)
         * - warehouseId = X     → Inventory Counting (only products with stock movements in warehouse X)
         * - categoryId / brandId = null → no filter on that dimension
         * All six matrix cases are covered by passing the right combination of nulls.
         */
        @Query("SELECT DISTINCT p FROM Product p LEFT JOIN FETCH p.brand LEFT JOIN FETCH p.department " +
                        "WHERE p.isActive = true " +
                        "AND (:warehouseId IS NULL OR p.id IN (" +
                        "  SELECT sm.productId FROM StockMovement sm WHERE sm.warehouseId = :warehouseId)) " +
                        "AND (:categoryId IS NULL OR p.department.id = :categoryId) " +
                        "AND (:brandId IS NULL OR p.brand.id = :brandId) " +
                        "AND (:search = '' OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.code) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.sku)  LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR LOWER(p.brand.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
                        "  OR EXISTS (SELECT 1 FROM ProductBarcode pb WHERE pb.product = p AND LOWER(pb.barcode) LIKE LOWER(CONCAT('%', :search, '%')))) " +
                        "ORDER BY p.name ASC")
        org.springframework.data.domain.Page<Product> findForStockTake(
                        @org.springframework.data.repository.query.Param("warehouseId") Long warehouseId,
                        @org.springframework.data.repository.query.Param("categoryId") Long categoryId,
                        @org.springframework.data.repository.query.Param("brandId") Long brandId,
                        @org.springframework.data.repository.query.Param("search") String search,
                        org.springframework.data.domain.Pageable pageable);

        @Query("SELECT DISTINCT p FROM Product p LEFT JOIN FETCH p.brand LEFT JOIN FETCH p.department " +
                        "WHERE p.isActive = true " +
                        "AND p.id IN (SELECT sm.productId FROM StockMovement sm WHERE sm.warehouseId = :warehouseId) " +
                        "AND (:categoryId IS NULL OR p.department.id = :categoryId) " +
                        "AND (:brandId IS NULL OR p.brand.id = :brandId) " +
                        "ORDER BY p.name ASC")
        List<Product> findForStockTakeSnapshot(
                        @org.springframework.data.repository.query.Param("warehouseId") Long warehouseId,
                        @org.springframework.data.repository.query.Param("categoryId") Long categoryId,
                        @org.springframework.data.repository.query.Param("brandId") Long brandId);

        /** projection query replacing N+1 fetching for reports */
        @Query("""
                            SELECT
                                p.id,
                                p.sku,
                                p.name,
                                p.category,
                                pr.cost,
                                pr.retailPrice,
                                uom.name,
                                inv.minStock,
                                inv.maxStock,
                                inv.reorderQty,
                                v.name
                            FROM Product p
                            LEFT JOIN p.pricing pr
                            LEFT JOIN p.inventory inv
                            LEFT JOIN inv.defaultUnit uom
                            LEFT JOIN inv.defaultVendor v
                            WHERE p.id IN :productIds
                        """)
        List<Object[]> getProductReportDetails(
                        @org.springframework.data.repository.query.Param("productIds") List<Long> productIds);

        /**
         * Fetches only basic fields for active products to avoid loading full entities
         */
        @Query("SELECT p.id, p.sku, p.name FROM Product p WHERE p.isActive = true")
        List<Object[]> findActiveProductBasics();

        /**
         * Fetches basic fields including department and brand for out of stock report
         * to avoid N+1 full entity loads.
         *
         * QA-001: excludes SERVICE products — they have no inventory by definition,
         * so they must not appear in any stock report (SOH, Low-Stock, Out-of-Stock,
         * Valuation). SOH/Low-Stock/Valuation are naturally filtered because they
         * source from stock_movements (services never produce one), but
         * Out-of-Stock iterates *all* active products, so we filter here.
         */
        @Query("SELECT p.id, p.sku, p.code, p.name, p.category, d.name, b.name " +
                "FROM Product p LEFT JOIN p.department d LEFT JOIN p.brand b " +
                "WHERE p.isActive = true " +
                "AND (p.productType IS NULL OR p.productType <> com.billbull.backend.inventory.product.ProductType.SERVICE)")
        List<Object[]> findActiveProductReportBasics();
}
