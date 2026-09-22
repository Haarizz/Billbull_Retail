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

    /**
     * Candidates for the POS salesperson selector: every genuinely Active employee.
     *
     * <p>Deliberately NOT {@code getActiveEmployees()}, which returns Active AND Inactive. Phase 1
     * has no sales-eligibility flag and {@code Employee.role} is free text, so there is no reliable
     * "is a salesperson" predicate to narrow this further.
     */
    @Query("""
            select e from Employee e
            where lower(e.status) = 'active'
            order by e.firstName asc, e.lastName asc, e.employeeCode asc
            """)
    List<Employee> findActiveSalespersons();
}
