package com.billbull.backend.inventory.units;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UnitRepository extends JpaRepository<Unit, Long> {

    List<Unit> findByIsActiveTrueOrderByNameAsc();

    Optional<Unit> findByNameIgnoreCaseAndIsActiveTrue(String name);

    Optional<Unit> findBySymbolIgnoreCaseAndIsActiveTrue(String symbol);

    boolean existsByNameIgnoreCaseAndIsActiveTrue(String name);

    boolean existsBySymbolIgnoreCaseAndIsActiveTrue(String symbol);

    // ===== Branch-Level Inventory Phase 6B — branch-scoped variants (toggle-on path only). Match
    // the existing case-insensitive semantics. =====
    @Query("SELECT u FROM Unit u WHERE u.isActive = true AND (u.branch.id IN :branchIds OR u.branch IS NULL) ORDER BY u.name ASC")
    List<Unit> findActiveInBranchScope(@Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT (count(u) > 0) FROM Unit u WHERE LOWER(u.name) = LOWER(:name) AND u.isActive = true AND (u.branch.id IN :branchIds OR u.branch IS NULL)")
    boolean existsActiveByNameInBranchScope(@Param("name") String name,
                                            @Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT (count(u) > 0) FROM Unit u WHERE LOWER(u.symbol) = LOWER(:symbol) AND u.isActive = true AND (u.branch.id IN :branchIds OR u.branch IS NULL)")
    boolean existsActiveBySymbolInBranchScope(@Param("symbol") String symbol,
                                              @Param("branchIds") java.util.Collection<Long> branchIds);
}
