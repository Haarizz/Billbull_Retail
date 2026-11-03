package com.billbull.backend.sales.pricing;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PriceLevelRepository extends JpaRepository<PriceLevel, Long> {
    List<PriceLevel> findAllByOrderBySortOrderAscNameAsc();
    Optional<PriceLevel> findFirstBySystemDefaultTrue();
    Optional<PriceLevel> findFirstByNameIgnoreCase(String name);
    Optional<PriceLevel> findFirstByCodeIgnoreCase(String code);
}
