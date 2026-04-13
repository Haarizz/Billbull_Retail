package com.billbull.backend.inventory.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductTaxRepository extends JpaRepository<ProductTax, Long> {
    Optional<ProductTax> findByProductId(Long productId);

    List<ProductTax> findByProductIdIn(List<Long> productIds);
}
