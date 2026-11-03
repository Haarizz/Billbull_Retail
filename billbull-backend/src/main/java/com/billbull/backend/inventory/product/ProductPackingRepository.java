package com.billbull.backend.inventory.product;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProductPackingRepository extends JpaRepository<ProductPacking, Long> {
    List<ProductPacking> findByProductId(Long productId);

    List<ProductPacking> findByProductIdIn(List<Long> productIds);

    void deleteByProductId(Long productId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(DISTINCT p.product.id) FROM ProductPacking p WHERE p.unit.id = :unitId AND p.isActive = true")
    long countDistinctProductIdByUnitIdAndIsActiveTrue(Long unitId);

    /**
     * Every active packing as {@code [productCode, unitName, conversion]} — one query, for reports
     * that turn a line quantity in its selling unit into base units. Keyed by code because report
     * rows carry the item code, not the product id.
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT pp.product.code, pp.unit.name, pp.conversion FROM ProductPacking pp "
            + "WHERE pp.isActive = true AND pp.conversion IS NOT NULL")
    List<Object[]> findActiveConversionsByProductCode();

    @org.springframework.data.jpa.repository.Query(
        "SELECT pp FROM ProductPacking pp WHERE pp.product.id = :productId AND LOWER(pp.unit.name) = LOWER(:unitName) AND pp.isActive = true")
    java.util.Optional<ProductPacking> findByProductIdAndUnitName(
        @org.springframework.data.repository.query.Param("productId") Long productId,
        @org.springframework.data.repository.query.Param("unitName") String unitName);
}