package com.billbull.backend.inventory.department;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DepartmentRepository extends JpaRepository<Department, Long> {

    boolean existsByCodeAndIsActiveTrue(String code);

    java.util.Optional<Department> findByCode(String code);

    boolean existsByCode(String code);

    List<Department> findByIsActiveTrue();

    java.util.Optional<Department> findByNameIgnoreCase(String name);

    // ===== Branch-Level Inventory Phase 6B — branch-scoped variants. Used ONLY when the toggle is
    // on + a branch is active; the methods above remain the toggle-off / admin path (byte-identical
    // to today). Global (branch IS NULL) rows are always visible. branchIds never empty (sentinel).
    @Query("SELECT d FROM Department d WHERE d.isActive = true AND (d.branch.id IN :branchIds OR d.branch IS NULL)")
    List<Department> findActiveInBranchScope(@Param("branchIds") java.util.Collection<Long> branchIds);

    // Not active-filtered — mirrors existsByCode (autogen must avoid ANY row's code in scope,
    // matching the partial unique index which ignores the active flag).
    @Query("SELECT (count(d) > 0) FROM Department d WHERE d.code = :code AND (d.branch.id IN :branchIds OR d.branch IS NULL)")
    boolean existsByCodeInBranchScope(@Param("code") String code,
                                      @Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT d FROM Department d WHERE d.code = :code AND (d.branch.id IN :branchIds OR d.branch IS NULL)")
    java.util.List<Department> findByCodeInBranchScope(@Param("code") String code,
                                                       @Param("branchIds") java.util.Collection<Long> branchIds);
}