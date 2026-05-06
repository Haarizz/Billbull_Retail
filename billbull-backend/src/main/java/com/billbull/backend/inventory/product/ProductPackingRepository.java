package com.billbull.backend.inventory.product;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProductPackingRepository extends JpaRepository<ProductPacking, Long> {
    List<ProductPacking> findByProductId(Long productId);

    List<ProductPacking> findByProductIdIn(List<Long> productIds);

    void deleteByProductId(Long productId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(DISTINCT p.product.id) FROM ProductPacking p WHERE p.unit.id = :unitId AND p.isActive = true")
    long countDistinctProductIdByUnitIdAndIsActiveTrue(Long unitId);

    @org.springframework.data.jpa.repository.Query(
        "SELECT pp FROM ProductPacking pp WHERE pp.product.id = :productId AND LOWER(pp.unit.name) = LOWER(:unitName) AND pp.isActive = true")
    java.util.Optional<ProductPacking> findByProductIdAndUnitName(
        @org.springframework.data.repository.query.Param("productId") Long productId,
        @org.springframework.data.repository.query.Param("unitName") String unitName);
}