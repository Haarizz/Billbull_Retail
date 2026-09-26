package com.billbull.backend.hr.employees;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * THE shared salesperson resolver — the single door POS checkout, the barcode lookup and the
 * back-office invoice all go through.
 *
 * <p>The important property is that nothing the client sends about the employee is trusted: the
 * identity is always re-read from the employee row, and an arbitrary id cannot make somebody a
 * salesperson.
 */
@ExtendWith(MockitoExtension.class)
class SalespersonServiceTest {

    @Mock private EmployeeRepository employeeRepository;

    private SalespersonService service;

    @BeforeEach
    void setUp() {
        service = new SalespersonService(employeeRepository);
    }

    private static Employee employee(long id, String code, String first, String last,
                                     String status, String role) {
        Employee e = new Employee();
        e.setId(id);
        e.setEmployeeCode(code);
        e.setFirstName(first);
        e.setLastName(last);
        e.setStatus(status);
        e.setRole(role);
        return e;
    }

    // ── the roster ──────────────────────────────────────────────────────────

    /**
     * {@code findActiveSalespersons()} is a DEFAULT method on the repository interface, so a
     * Mockito mock never runs its body — stubbing {@code findActiveByRoleKeys} here would prove
     * nothing. It is stubbed directly instead. That the default method binds the one canonical
     * role-key list is covered structurally by {@link SalespersonEligibilityTest}.
     */
    @Test
    void theRosterIsWhateverTheEligibleQueryReturns() {
        Employee a = employee(1L, "EMP-001", "Sales", "One", "Active", "Salesperson");
        when(employeeRepository.findActiveSalespersons()).thenReturn(List.of(a));

        assertEquals(List.of(a), service.listEligible());
    }

    // ── by code (the barcode path) ─────────────────────────────────────────

    @Test
    void resolvesAnEligibleEmployeeByCode() {
        when(employeeRepository.findByEmployeeCodeIgnoreCase("EMP9664")).thenReturn(
                Optional.of(employee(7L, "EMP9664", "Manager", "One", "Active", "Salesperson")));

        Employee resolved = service.requireEligibleByCode("EMP9664");

        assertEquals(7L, resolved.getId());
    }

    @Test
    void codeLookupIsCaseInsensitiveAndTrimmed() {
        when(employeeRepository.findByEmployeeCodeIgnoreCase("emp9664")).thenReturn(
                Optional.of(employee(7L, "EMP9664", "Manager", "One", "Active", "Salesperson")));

        assertEquals(7L, service.requireEligibleByCode("  emp9664  ").getId());
    }

    @Test
    void rejectsAnUnknownBarcode() {
        when(employeeRepository.findByEmployeeCodeIgnoreCase("NOPE")).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.requireEligibleByCode("NOPE"));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(String.valueOf(ex.getReason()).contains("No employee found"));
    }

    @Test
    void rejectsABlankBarcodeWithoutQueryingAtAll() {
        assertThrows(ResponseStatusException.class, () -> service.requireEligibleByCode("   "));
        assertThrows(ResponseStatusException.class, () -> service.requireEligibleByCode(null));
        verify(employeeRepository, never()).findByEmployeeCodeIgnoreCase(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void rejectsAnIneligibleRoleWithAnActionableReason() {
        when(employeeRepository.findByEmployeeCodeIgnoreCase("EMP-005")).thenReturn(
                Optional.of(employee(5L, "EMP-005", "Plain", "Cashier", "Active", "Cashier")));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.requireEligibleByCode("EMP-005"));

        assertTrue(String.valueOf(ex.getReason()).contains("not an eligible salesperson"));
        // The message names what IS allowed, so the cashier knows who to fetch instead.
        assertTrue(String.valueOf(ex.getReason()).contains("Cashier + Salesperson"));
    }

    @Test
    void rejectsAnInactiveEmployee() {
        when(employeeRepository.findByEmployeeCodeIgnoreCase("EMP-009")).thenReturn(
                Optional.of(employee(9L, "EMP-009", "Gone", "Away", "Inactive", "Salesperson")));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.requireEligibleByCode("EMP-009"));

        assertTrue(String.valueOf(ex.getReason()).contains("active employee"));
    }

    // ── by id, with code fallback (the checkout path) ──────────────────────

    @Test
    void namingNobodyResolvesToNobodyRatherThanFailing() {
        // "No salesperson" is legitimate when the feature is off; whether it is ACCEPTABLE is the
        // caller's decision, not this resolver's.
        assertNull(service.resolveEligible(null, null));
        assertNull(service.resolveEligible(null, "  "));
    }

    @Test
    void theIdWinsOverTheCodeAndTheStoredCodeIsWhatCounts() {
        when(employeeRepository.findById(7L)).thenReturn(
                Optional.of(employee(7L, "EMP9664", "Manager", "One", "Active", "Salesperson")));

        Employee resolved = service.resolveEligible(7L, "A-CLIENT-SUPPLIED-LIE");

        assertEquals("EMP9664", resolved.getEmployeeCode());
        verify(employeeRepository, never()).findByEmployeeCodeIgnoreCase("A-CLIENT-SUPPLIED-LIE");
    }

    @Test
    void fallsBackToTheCodeWhenTheIdIsUnknown() {
        when(employeeRepository.findById(999L)).thenReturn(Optional.empty());
        when(employeeRepository.findByEmployeeCodeIgnoreCase("EMP9664")).thenReturn(
                Optional.of(employee(7L, "EMP9664", "Manager", "One", "Active", "Salesperson")));

        assertEquals(7L, service.resolveEligible(999L, "EMP9664").getId());
    }

    @Test
    void anArbitraryIdFromTheClientIsRejected() {
        when(employeeRepository.findById(999L)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.resolveEligible(999L, null));

        assertTrue(String.valueOf(ex.getReason()).contains("could not be found"));
    }

    @Test
    void anIneligibleEmployeeIsRejectedEvenWhenNamedById() {
        when(employeeRepository.findById(5L)).thenReturn(
                Optional.of(employee(5L, "EMP-005", "Store", "Keeper", "Active", "Storekeeper")));

        assertThrows(ResponseStatusException.class, () -> service.resolveEligible(5L, null));
    }

    // ── display name ────────────────────────────────────────────────────────

    @Test
    void buildsTheDisplayNameFromTheEmployeeRecord() {
        Employee e = employee(1L, "EMP-001", "Manager", "One", "Active", "Salesperson");
        assertEquals("Manager One", SalespersonService.fullName(e));

        e.setMiddleName("Bin");
        assertEquals("Manager Bin One", SalespersonService.fullName(e));
    }
}
