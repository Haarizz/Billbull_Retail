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

    /**
     * Typeahead search for the global search modal.
     *
     * <p>Matches identification fields only — employee code, name (including the
     * "first last" form so a full name typed in one go still hits), designation
     * and department. Phone, email and document numbers are deliberately NOT
     * searchable: this endpoint must not double as a probe for an employee's
     * private contact details.
     *
     * <p>Returns {@link EmployeeSearchResponse} rather than entities, so a
     * keystroke never hydrates an Employee with its salary and document columns,
     * and the row cap is applied by the database via {@code Pageable}.
     *
     * <p>Branch-scoped server-side, unlike {@code getAll()} / {@code getActiveEmployees()}.
     * {@code allBranches = true} applies no branch predicate; otherwise an employee is in
     * scope when {@code branchEntity} is in {@code branchIds} or absent (legacy rows with
     * only the free-text {@code branch} label stay visible rather than disappearing from
     * search). The scope comes from {@code BranchAccessService.currentSearchScope()};
     * this query never tests a role name.
     *
     * <p>Note the parentheses around the match clause: without them the branch predicate
     * would bind to the last OR term only and scope nothing.
     */
    @Query("""
            select new com.billbull.backend.hr.employees.EmployeeSearchResponse(
                e.id, e.employeeCode, e.firstName, e.middleName, e.lastName,
                e.role, e.department, e.branch, e.status)
            from Employee e
            where (lower(e.employeeCode) like lower(concat('%', :q, '%'))
               or lower(e.firstName) like lower(concat('%', :q, '%'))
               or lower(e.middleName) like lower(concat('%', :q, '%'))
               or lower(e.lastName) like lower(concat('%', :q, '%'))
               or lower(concat(e.firstName, ' ', e.lastName)) like lower(concat('%', :q, '%'))
               or lower(e.role) like lower(concat('%', :q, '%'))
               or lower(e.department) like lower(concat('%', :q, '%')))
              and (:allBranches = true or e.branchEntity is null or e.branchEntity.id in :branchIds)
            order by e.firstName asc, e.lastName asc, e.employeeCode asc
            """)
    List<EmployeeSearchResponse> searchEmployees(@Param("q") String q,
            @Param("allBranches") boolean allBranches,
            @Param("branchIds") java.util.Collection<Long> branchIds,
            org.springframework.data.domain.Pageable pageable);

    /**
     * The first few employees, for the global search modal's empty-query preview.
     *
     * <p>Same projection — identity only, no payroll, attendance or leave — same branch
     * predicate and same ordering as {@link #searchEmployees}, with the match clause
     * dropped rather than matched against an empty string. The row cap is applied by the
     * database via {@code Pageable}.
     */
    @Query("""
            select new com.billbull.backend.hr.employees.EmployeeSearchResponse(
                e.id, e.employeeCode, e.firstName, e.middleName, e.lastName,
                e.role, e.department, e.branch, e.status)
            from Employee e
            where (:allBranches = true or e.branchEntity is null or e.branchEntity.id in :branchIds)
            order by e.firstName asc, e.lastName asc, e.employeeCode asc
            """)
    List<EmployeeSearchResponse> previewEmployees(@Param("allBranches") boolean allBranches,
            @Param("branchIds") java.util.Collection<Long> branchIds,
            org.springframework.data.domain.Pageable pageable);
}
