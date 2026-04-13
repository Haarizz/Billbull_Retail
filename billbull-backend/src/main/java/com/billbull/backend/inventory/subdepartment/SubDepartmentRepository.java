package com.billbull.backend.inventory.subdepartment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SubDepartmentRepository extends JpaRepository<SubDepartment, Long> {

    List<SubDepartment> findByActiveTrue();

    boolean existsByCodeAndActiveTrue(String code);

    boolean existsByNameAndDepartmentIdAndActiveTrue(String name, Long departmentId);
}
