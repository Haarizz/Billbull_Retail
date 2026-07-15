package com.billbull.backend.inventory.barcode;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BarcodeTemplateRepository extends JpaRepository<BarcodeTemplate, Long> {
    Optional<BarcodeTemplate> findBySystemKey(String systemKey);

    // Branch-Level Inventory Phase 9A — branch-scoped template list. Returns the active branch's
    // templates PLUS all global (branch_id IS NULL) templates — which includes the seeded SYSTEM
    // templates, so barcode printing keeps working in every branch. Used only when the toggle is on
    // + a branch is active; the plain findAll(Sort) remains the toggle-off / admin path (byte-
    // identical). branchIds never empty (ListScope -1 sentinel). Ordered by id ASC to match today.
    @Query("SELECT t FROM BarcodeTemplate t WHERE t.branchId IN :branchIds OR t.branchId IS NULL ORDER BY t.id ASC")
    List<BarcodeTemplate> findInBranchScope(@Param("branchIds") java.util.Collection<Long> branchIds);
}
