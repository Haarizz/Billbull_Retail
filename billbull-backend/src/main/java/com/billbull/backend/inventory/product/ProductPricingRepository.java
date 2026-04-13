package com.billbull.backend.inventory.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductPricingRepository extends JpaRepository<ProductPricing, Long> {
    Optional<ProductPricing> findByProductId(Long productId);

    List<ProductPricing> findByProductIdIn(List<Long> productIds);
}
