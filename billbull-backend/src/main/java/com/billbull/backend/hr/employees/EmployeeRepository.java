package com.billbull.backend.hr.employees;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    List<Employee> findByStatus(String status);

    long countByStatus(String status);

    List<Employee> findByStatusIn(List<String> statuses);

    Optional<Employee> findByEmployeeCodeIgnoreCase(String employeeCode);

    @Query("""
            select e from Employee e
            where lower(e.status) = 'active'
              and (lower(e.role) = 'delivery person' or lower(e.role) = 'delivery_person')
            order by e.firstName asc, e.lastName asc, e.employeeCode asc
            """)
    List<Employee> findActiveDeliveryPersons();
}
