package com.billbull.backend.inventory.category;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductCategoryRepository extends JpaRepository<ProductCategory, Long> {

    List<ProductCategory> findByIsActiveTrueOrderByNameAsc();

    /** Any row (active or not) with this name — used to restore a soft-deleted category. */
    Optional<ProductCategory> findFirstByNameIgnoreCase(String name);

    Optional<ProductCategory> findFirstByNameIgnoreCaseAndIsActiveTrue(String name);
}
