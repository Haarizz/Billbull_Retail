package com.billbull.backend.hr.employees;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The one salesperson-eligibility rule, in isolation.
 *
 * <p>Locked Phase 2 business rule: exactly two designations are eligible, and only while the
 * employee is Active. Everything else — Cashier, Storekeeper, Manager, Delivery Person, Supervisor,
 * Branch Admin — is not, no matter what login roles the person holds.
 */
class SalespersonEligibilityTest {

    private static Employee employee(String role, String status) {
        Employee e = new Employee();
        e.setId(1L);
        e.setEmployeeCode("EMP0001");
        e.setFirstName("Test");
        e.setLastName("Employee");
        e.setRole(role);
        e.setStatus(status);
        return e;
    }

    // ── eligible designations ───────────────────────────────────────────────

    @ParameterizedTest
    @ValueSource(strings = {
            "Salesperson", "salesperson", "SALESPERSON", "  Salesperson  ",
            "Sales Person", "sales person",
            "Cashier + Salesperson", "cashier + salesperson", "CASHIER + SALESPERSON",
            "Cashier+Salesperson", "cashier_salesperson", "CASHIER_SALESPERSON",
            "Cashier + Sales Person",
            // whitespace is collapsed, not just trimmed
            "Cashier   +   Salesperson",
    })
    void acceptsEveryEligibleSpelling(String role) {
        assertTrue(SalespersonEligibility.isEligibleRole(role), role);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Cashier", "cashier", "Storekeeper", "Manager", "Delivery Person", "delivery_person",
            "Supervisor", "Branch Admin", "ADMIN", "SALES", "INVENTORY_MANAGER", "ACCOUNTANT", "HR",
            // near-misses that must NOT slip through
            "Salespersons", "Senior Salesperson", "Cashier + Manager", "",
    })
    void rejectsEveryIneligibleRole(String role) {
        assertFalse(SalespersonEligibility.isEligibleRole(role), role);
    }

    @Test
    void rejectsNullRole() {
        assertFalse(SalespersonEligibility.isEligibleRole(null));
    }

    // ── status ──────────────────────────────────────────────────────────────

    @Test
    void activeEligibleEmployeeIsEligible() {
        assertTrue(SalespersonEligibility.isActiveEligibleSalesperson(
                employee("Salesperson", "Active")));
        assertTrue(SalespersonEligibility.isActiveEligibleSalesperson(
                employee("Cashier + Salesperson", "active")));
    }

    @Test
    void inactiveEligibleEmployeeIsNotEligible() {
        assertFalse(SalespersonEligibility.isActiveEligibleSalesperson(
                employee("Salesperson", "Inactive")));
        assertFalse(SalespersonEligibility.isActiveEligibleSalesperson(
                employee("Cashier + Salesperson", "Pending")));
        assertFalse(SalespersonEligibility.isActiveEligibleSalesperson(
                employee("Salesperson", "Rejected")));
        assertFalse(SalespersonEligibility.isActiveEligibleSalesperson(
                employee("Salesperson", null)));
    }

    @Test
    void activeIneligibleEmployeeIsNotEligible() {
        assertFalse(SalespersonEligibility.isActiveEligibleSalesperson(
                employee("Cashier", "Active")));
        assertFalse(SalespersonEligibility.isActiveEligibleSalesperson(
                employee("Storekeeper", "Active")));
    }

    @Test
    void nullEmployeeIsNotEligible() {
        assertFalse(SalespersonEligibility.isActiveEligibleSalesperson(null));
    }

    // ── the list that backs the repository query ────────────────────────────

    @Test
    void roleKeysAreAlreadyNormalisedSoTheJpqlLowerTrimMatchesThem() {
        for (String key : SalespersonEligibility.roleKeys()) {
            assertEquals(key, SalespersonEligibility.normalizeRole(key),
                    "role key must be stored pre-normalised: " + key);
            assertTrue(SalespersonEligibility.isEligibleRole(key), key);
        }
    }

    @Test
    void bothCanonicalDesignationsAreThemselvesEligible() {
        assertTrue(SalespersonEligibility.isEligibleRole(
                SalespersonEligibility.DESIGNATION_SALESPERSON));
        assertTrue(SalespersonEligibility.isEligibleRole(
                SalespersonEligibility.DESIGNATION_CASHIER_SALESPERSON));
        assertTrue(SalespersonEligibility.isEligibleRole(
                SalespersonEligibility.ROLE_SALESPERSON));
        assertTrue(SalespersonEligibility.isEligibleRole(
                SalespersonEligibility.ROLE_CASHIER_SALESPERSON));
    }
}
