package com.billbull.backend.inventory.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductMediaRepository extends JpaRepository<ProductMedia, Long> {
    List<ProductMedia> findByProductId(Long productId);

    List<ProductMedia> findByProductIdIn(List<Long> productIds);

    List<ProductMedia> findByProductIdInAndIsPrimaryTrue(List<Long> productIds);

    Optional<ProductMedia> findByProductIdAndIsPrimaryTrue(Long productId);

    /** Bulk lookup of primary images by product code — used when only itemCode is available. */
    @Query("SELECT m FROM ProductMedia m WHERE m.product.code IN :codes AND m.isPrimary = true")
    List<ProductMedia> findPrimaryByProductCodesIn(@Param("codes") List<String> codes);
}
