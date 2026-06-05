package com.billbull.backend.inventory.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductBranchPricingRepository extends JpaRepository<ProductBranchPricing, Long> {
    List<ProductBranchPricing> findByProductId(Long productId);
    List<ProductBranchPricing> findByProductIdIn(List<Long> productIds);
    Optional<ProductBranchPricing> findByProductIdAndBranchId(Long productId, Long branchId);
}
