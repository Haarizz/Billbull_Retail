package com.billbull.backend.hr.employees;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * THE single definition of "may this employee be a salesperson?".
 *
 * <p>Phase 2 business rule, locked: exactly two employee designations are salesperson-eligible —
 * {@value #DESIGNATION_SALESPERSON} and {@value #DESIGNATION_CASHIER_SALESPERSON} — and the
 * employee must be Active. Every caller (POS checkout resolution, the barcode lookup, the
 * salesperson list feed, back-office invoice resolution) routes through here rather than
 * re-implementing the predicate. {@code PosCheckoutController.isActiveDeliveryPerson} and
 * {@code EmployeeRepository.findActiveDeliveryPersons} are the cautionary example: the same
 * delivery-person rule is written twice, in two languages, and they can drift.
 *
 * <p>{@link Employee#getRole()} is free text whose dropdown borrows its option list from the RBAC
 * {@code roles} table (see {@code RBACInitializer}), so the stored value can be either the
 * human-readable designation ({@code "Cashier + Salesperson"}) or the raw role key
 * ({@code "CASHIER_SALESPERSON"}) depending on which client wrote it. {@link #ROLE_KEYS} therefore
 * enumerates both families, exactly as the delivery-person query already matches both
 * {@code 'delivery person'} and {@code 'delivery_person'}.
 *
 * <p>NOTE on {@link User} roles: this is deliberately independent of {@code User.roles}. Those are
 * login authorities; this is a business designation. An employee with no login at all can be a
 * salesperson, and a user holding {@code ROLE_ADMIN} is not one unless their employee record says
 * so.
 */
public final class SalespersonEligibility {

    /** RBAC role name seeded by {@code RBACInitializer}. */
    public static final String ROLE_SALESPERSON = "SALESPERSON";
    /** RBAC role name seeded by {@code RBACInitializer}. */
    public static final String ROLE_CASHIER_SALESPERSON = "CASHIER_SALESPERSON";

    /** Canonical human-readable designation stored in {@code employees.role}. */
    public static final String DESIGNATION_SALESPERSON = "Salesperson";
    /** Canonical human-readable designation stored in {@code employees.role}. */
    public static final String DESIGNATION_CASHIER_SALESPERSON = "Cashier + Salesperson";

    /**
     * Every accepted spelling, already normalised by {@link #normalizeRole(String)}.
     *
     * <p>Ordered (LinkedHashSet) purely so test failures read predictably. This set is also the
     * bound parameter of {@code EmployeeRepository.findActiveEligibleSalespersons()}, which is what
     * keeps the JPQL list and the Java predicate from diverging — there is one list, not two.
     */
    public static final Set<String> ROLE_KEYS = Set.copyOf(new LinkedHashSet<>(java.util.List.of(
            "salesperson",
            "sales person",
            "cashier + salesperson",
            "cashier + sales person",
            "cashier+salesperson",
            "cashier+sales person",
            "cashier_salesperson",
            "cashier_sales_person")));

    private SalespersonEligibility() {
    }

    /**
     * Lower-cases, trims and collapses internal whitespace so {@code "Cashier  +  Salesperson"}
     * and {@code "cashier + salesperson"} compare equal.
     *
     * <p>The JPQL query can only do {@code lower(trim(...))} — it cannot collapse internal runs of
     * whitespace. That is an accepted, documented gap: role values come from a fixed dropdown, so
     * irregular internal spacing is pathological, and the authoritative single-employee validation
     * (which every checkout goes through) normalises properly here.
     */
    public static String normalizeRole(String role) {
        if (role == null) return "";
        return role.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    /** Role-only check. Says nothing about employment status. */
    public static boolean isEligibleRole(String role) {
        return ROLE_KEYS.contains(normalizeRole(role));
    }

    /**
     * Status-only check, matching the spelling the rest of the codebase uses
     * ({@code PosCheckoutController.isActiveEmployee}, {@code EmployeePerformanceService}).
     */
    public static boolean isActive(Employee employee) {
        return employee != null
                && employee.getStatus() != null
                && "active".equalsIgnoreCase(employee.getStatus().trim());
    }

    /** The full rule: Active AND one of the two eligible designations. */
    public static boolean isActiveEligibleSalesperson(Employee employee) {
        return isActive(employee) && employee != null && isEligibleRole(employee.getRole());
    }

    /** The bound parameter for the repository query. Never null, never empty. */
    public static Collection<String> roleKeys() {
        return ROLE_KEYS;
    }
}
