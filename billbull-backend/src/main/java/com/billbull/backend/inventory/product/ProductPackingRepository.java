package com.billbull.backend.inventory.product;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProductPackingRepository extends JpaRepository<ProductPacking, Long> {
    List<ProductPacking> findByProductId(Long productId);

    List<ProductPacking> findByProductIdIn(List<Long> productIds);

    void deleteByProductId(Long productId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(DISTINCT p.product.id) FROM ProductPacking p WHERE p.unit.id = :unitId AND p.isActive = true")
    long countDistinctProductIdByUnitIdAndIsActiveTrue(Long unitId);
}