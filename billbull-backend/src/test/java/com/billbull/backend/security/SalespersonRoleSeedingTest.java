package com.billbull.backend.security;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import com.billbull.backend.hr.employees.SalespersonEligibility;

/**
 * The two salesperson designations must be seeded as RBAC roles.
 *
 * <p>The Employees &amp; Roles Role/Designation dropdown is fed from {@code GET /api/roles} — the
 * same table {@code RBACInitializer} seeds — exactly as {@code DELIVERY_PERSON} already is. If the
 * rows are not seeded, the new designations simply never appear and no employee can be made
 * eligible, so this is the load-bearing bootstrap for the whole feature.
 *
 * <p>Asserted against the initializer's source rather than by booting Spring: {@code RBACInitializer}
 * is a {@code CommandLineRunner} over a live datasource, and every test in this project that boots
 * one needs a database (see BillbullBackendApplicationTests). This is a seeding-contract check, and
 * the source is where that contract lives.
 */
class SalespersonRoleSeedingTest {

    private static String read(String relativePath) {
        try {
            return Files.readString(Path.of("src/main/java/com/billbull/backend", relativePath),
                    StandardCharsets.UTF_8).replace("\r\n", "\n");
        } catch (Exception e) {
            throw new IllegalStateException("could not read " + relativePath, e);
        }
    }

    @Test
    void seedsBothSalespersonRoles() {
        String src = read("security/RBACInitializer.java");
        assertTrue(src.contains("createRoleIfNotExists(roleRepository, \"SALESPERSON\")"),
                "SALESPERSON role must be seeded");
        assertTrue(src.contains("createRoleIfNotExists(roleRepository, \"CASHIER_SALESPERSON\")"),
                "CASHIER_SALESPERSON role must be seeded");
    }

    @Test
    void doesNotDisturbTheExistingRoles() {
        String src = read("security/RBACInitializer.java");
        for (String role : new String[] {
                "ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR", "SALES",
                "INVENTORY_MANAGER", "ACCOUNTANT", "HR", "DELIVERY_PERSON" }) {
            assertTrue(src.contains("createRoleIfNotExists(roleRepository, \"" + role + "\")"),
                    "pre-existing role must still be seeded: " + role);
        }
    }

    @Test
    void theSeededRoleNamesAreThemselvesEligibleDesignations() {
        // An employee record saved by a client that stored the raw role key (rather than the
        // human-readable label) must still resolve as eligible.
        assertTrue(SalespersonEligibility.isEligibleRole("SALESPERSON"));
        assertTrue(SalespersonEligibility.isEligibleRole("CASHIER_SALESPERSON"));
    }

    @Test
    void bothRolesGetDefaultPermissionRows() {
        String src = read("security/RolePermissionInitializer.java");
        assertTrue(src.contains("roleRepository.findByName(\"SALESPERSON\")"));
        assertTrue(src.contains("roleRepository.findByName(\"CASHIER_SALESPERSON\")"));
    }

    @Test
    void theFrontendFallbackListCarriesThemToo() {
        // GET /api/roles is ADMIN-only, so a non-admin HR user never receives the live role list
        // and falls back to a hard-coded one. Omitting the new roles there would make them
        // invisible to exactly the users who maintain employee records.
        String employees;
        try {
            employees = Files.readString(
                    Path.of("../billbull-frontend/src/pages/HR/Emp_Role.jsx/Employees.jsx"),
                    StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("could not read Employees.jsx", e);
        }
        assertTrue(employees.contains("'SALESPERSON'"), "fallback role list must include SALESPERSON");
        assertTrue(employees.contains("'CASHIER_SALESPERSON'"),
                "fallback role list must include CASHIER_SALESPERSON");
        assertTrue(employees.contains("SALESPERSON: 'Salesperson'"),
                "raw role key must map to the human-readable designation");
        assertTrue(employees.contains("CASHIER_SALESPERSON: 'Cashier + Salesperson'"),
                "raw role key must map to the human-readable designation");
        assertTrue(employees.contains("DELIVERY_PERSON: 'Delivery Person'"),
                "the pre-existing Delivery Person mapping must not be lost");
    }
}
