package com.billbull.backend.inventory.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductMediaRepository extends JpaRepository<ProductMedia, Long> {
    List<ProductMedia> findByProductId(Long productId);

    List<ProductMedia> findByProductIdIn(List<Long> productIds);

    List<ProductMedia> findByProductIdInAndIsPrimaryTrue(List<Long> productIds);

    Optional<ProductMedia> findByProductIdAndIsPrimaryTrue(Long productId);

}
