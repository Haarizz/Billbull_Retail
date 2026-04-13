package com.billbull.backend.inventory.department;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DepartmentRepository extends JpaRepository<Department, Long> {

    boolean existsByCodeAndIsActiveTrue(String code);

    java.util.Optional<Department> findByCode(String code);

    boolean existsByCode(String code);

    List<Department> findByIsActiveTrue();

    java.util.Optional<Department> findByNameIgnoreCase(String name);
}