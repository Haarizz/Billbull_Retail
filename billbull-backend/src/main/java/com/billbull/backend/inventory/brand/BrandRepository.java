package com.billbull.backend.inventory.brand;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BrandRepository extends JpaRepository<Brand, Long> {

    // `deleted` (not `active`) is the visibility flag: an INACTIVE brand is a live brand with a
    // status of Inactive and must still be listed, otherwise the list's "Inactive" filter can
    // never match anything.
    List<Brand> findByDeletedFalse();

    boolean existsByCodeAndDeletedFalse(String code);

    boolean existsByNameAndDeletedFalse(String name);

    boolean existsByBarcode(String barcode);

    // Soft-deleted rows still occupy the DB-level unique indexes on brands(name)/brands(code)
    // (V37's partial indexes key on the branch tier only, not on `deleted`), so creating a brand
    // that reuses a deleted name has to find and revive that row instead of inserting a new one.
    List<Brand> findByDeletedTrueAndNameIgnoreCase(String name);

    List<Brand> findByDeletedTrueAndCodeIgnoreCase(String code);

    java.util.Optional<Brand> findByNameIgnoreCase(String name);

    java.util.Optional<Brand> findByCodeIgnoreCase(String code);

    // ===== Branch-Level Inventory Phase 6B — branch-scoped variants (toggle-on path only). =====
    @Query("SELECT b FROM Brand b WHERE b.deleted = false AND (b.branch.id IN :branchIds OR b.branch IS NULL)")
    List<Brand> findLiveInBranchScope(@Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT (count(b) > 0) FROM Brand b WHERE b.code = :code AND b.deleted = false AND (b.branch.id IN :branchIds OR b.branch IS NULL)")
    boolean existsLiveByCodeInBranchScope(@Param("code") String code,
                                          @Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT (count(b) > 0) FROM Brand b WHERE b.name = :name AND b.deleted = false AND (b.branch.id IN :branchIds OR b.branch IS NULL)")
    boolean existsLiveByNameInBranchScope(@Param("name") String name,
                                          @Param("branchIds") java.util.Collection<Long> branchIds);
}
