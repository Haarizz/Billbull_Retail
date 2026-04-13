package com.billbull.backend.inventory.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductInventoryPolicyRepository extends JpaRepository<ProductInventoryPolicy, Long> {
    Optional<ProductInventoryPolicy> findByProductId(Long productId);

    List<ProductInventoryPolicy> findByProductIdIn(List<Long> productIds);
}