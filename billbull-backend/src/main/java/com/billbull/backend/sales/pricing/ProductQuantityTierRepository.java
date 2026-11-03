package com.billbull.backend.sales.pricing;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface ProductQuantityTierRepository extends JpaRepository<ProductQuantityTier, Long> {

    /** The resolver's lookup: one query for every product of a cart under one level. */
    List<ProductQuantityTier> findByProductIdInAndPriceLevelIdAndIsActiveTrue(Collection<Long> productIds, Long priceLevelId);

    List<ProductQuantityTier> findByProductIdAndIsActiveTrue(Long productId);

    List<ProductQuantityTier> findByProductIdInAndIsActiveTrue(Collection<Long> productIds);

    /** Rows of one product and level, locked while a tier is written (duplicate-threshold check). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from ProductQuantityTier t where t.productId = :productId and t.priceLevelId = :levelId and t.isActive = true")
    List<ProductQuantityTier> lockLive(@Param("productId") Long productId, @Param("levelId") Long levelId);

    long countByPriceLevelIdAndIsActiveTrue(Long priceLevelId);
}
