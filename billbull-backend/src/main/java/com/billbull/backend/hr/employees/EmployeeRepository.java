package com.billbull.backend.hr.employees;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    List<Employee> findByStatus(String status);

    long countByStatus(String status);

    List<Employee> findByStatusIn(List<String> statuses);
}
