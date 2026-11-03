package com.billbull.backend.sales.pricing;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductLevelPriceRepository extends JpaRepository<ProductLevelPrice, Long> {
    List<ProductLevelPrice> findByProductId(Long productId);
    List<ProductLevelPrice> findByProductIdIn(Collection<Long> productIds);
    List<ProductLevelPrice> findByProductIdInAndPriceLevelId(Collection<Long> productIds, Long priceLevelId);
    long countByPriceLevelIdAndIsActiveTrue(Long priceLevelId);
}
