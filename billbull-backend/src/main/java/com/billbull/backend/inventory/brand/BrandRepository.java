package com.billbull.backend.inventory.brand;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BrandRepository extends JpaRepository<Brand, Long> {

    List<Brand> findByActiveTrue();

    boolean existsByCodeAndActiveTrue(String code);

    boolean existsByNameAndActiveTrue(String name);

    boolean existsByBarcode(String barcode);

    java.util.Optional<Brand> findByNameIgnoreCase(String name);

    java.util.Optional<Brand> findByCodeIgnoreCase(String code);

    // ===== Branch-Level Inventory Phase 6B — branch-scoped variants (toggle-on path only). =====
    @Query("SELECT b FROM Brand b WHERE b.active = true AND (b.branch.id IN :branchIds OR b.branch IS NULL)")
    List<Brand> findActiveInBranchScope(@Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT (count(b) > 0) FROM Brand b WHERE b.code = :code AND b.active = true AND (b.branch.id IN :branchIds OR b.branch IS NULL)")
    boolean existsActiveByCodeInBranchScope(@Param("code") String code,
                                            @Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT (count(b) > 0) FROM Brand b WHERE b.name = :name AND b.active = true AND (b.branch.id IN :branchIds OR b.branch IS NULL)")
    boolean existsActiveByNameInBranchScope(@Param("name") String name,
                                            @Param("branchIds") java.util.Collection<Long> branchIds);
}

