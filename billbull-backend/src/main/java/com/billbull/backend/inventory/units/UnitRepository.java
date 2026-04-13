package com.billbull.backend.inventory.units;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UnitRepository extends JpaRepository<Unit, Long> {

    List<Unit> findByIsActiveTrueOrderByNameAsc();

    Optional<Unit> findByNameIgnoreCaseAndIsActiveTrue(String name);

    Optional<Unit> findBySymbolIgnoreCaseAndIsActiveTrue(String symbol);

    boolean existsByNameIgnoreCaseAndIsActiveTrue(String name);

    boolean existsBySymbolIgnoreCaseAndIsActiveTrue(String symbol);
}
