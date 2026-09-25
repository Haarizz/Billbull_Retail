package com.billbull.backend.hr.employees;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
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
     * Candidates for the POS salesperson selector: Active employees whose designation is one of
     * the two salesperson-eligible roles.
     *
     * <p>Deliberately NOT {@code getActiveEmployees()}, which returns Active AND Inactive. Phase 2
     * narrowed this from "every Active employee" to the eligible designations — a deliberate
     * behaviour change (and a net reduction in what this authenticated-but-unprivileged feed
     * exposes), driven by {@link SalespersonEligibility}.
     *
     * <p>The role list is the bound {@code roleKeys} parameter rather than literals in the JPQL,
     * so this query and {@link SalespersonEligibility#isEligibleRole(String)} read from ONE list
     * and cannot drift. See that class for the {@code lower(trim(...))} vs. whitespace-collapse
     * caveat.
     */
    @Query("""
            select e from Employee e
            where lower(e.status) = 'active'
              and lower(trim(e.role)) in :roleKeys
            order by e.firstName asc, e.lastName asc, e.employeeCode asc
            """)
    List<Employee> findActiveByRoleKeys(@Param("roleKeys") Collection<String> roleKeys);

    /** {@link #findActiveByRoleKeys} bound to the one canonical eligible-role list. */
    default List<Employee> findActiveSalespersons() {
        return findActiveByRoleKeys(SalespersonEligibility.roleKeys());
    }
}
