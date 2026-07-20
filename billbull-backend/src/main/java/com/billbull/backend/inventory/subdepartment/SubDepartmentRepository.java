package com.billbull.backend.inventory.subdepartment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SubDepartmentRepository extends JpaRepository<SubDepartment, Long> {

    List<SubDepartment> findByActiveTrue();

    boolean existsByCodeAndActiveTrue(String code);

    boolean existsByNameAndDepartmentIdAndActiveTrue(String name, Long departmentId);

    // ===== Branch-Level Inventory Phase 6B — branch-scoped variants (toggle-on path only). =====
    @Query("SELECT s FROM SubDepartment s WHERE s.active = true AND (s.branch.id IN :branchIds OR s.branch IS NULL)")
    List<SubDepartment> findActiveInBranchScope(@Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT (count(s) > 0) FROM SubDepartment s WHERE s.code = :code AND s.active = true AND (s.branch.id IN :branchIds OR s.branch IS NULL)")
    boolean existsActiveByCodeInBranchScope(@Param("code") String code,
                                            @Param("branchIds") java.util.Collection<Long> branchIds);

    @Query("SELECT (count(s) > 0) FROM SubDepartment s WHERE s.name = :name AND s.department.id = :departmentId AND s.active = true AND (s.branch.id IN :branchIds OR s.branch IS NULL)")
    boolean existsActiveByNameAndDepartmentInBranchScope(@Param("name") String name,
                                                         @Param("departmentId") Long departmentId,
                                                         @Param("branchIds") java.util.Collection<Long> branchIds);
}
