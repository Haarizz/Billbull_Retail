package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.hr.employees.SalespersonService;

/**
 * Back-office salesperson attribution on a Sales Invoice.
 *
 * <p>Exercises {@code resolveBackOfficeSalesperson} through the real {@link SalespersonService},
 * so the back office is proved to use the SAME eligibility rule as POS checkout rather than a
 * laxer one. The rest of {@code SalesInvoiceService.save} is not in play here — the method under
 * test is invoked directly, the way {@code preserveFinalizedSalespersonAttribution} already is.
 */
@ExtendWith(MockitoExtension.class)
class SalesInvoiceBackOfficeSalespersonTest {

    @Mock private EmployeeRepository employeeRepository;

    private SalespersonService salespersonService;
    /** A bare instance: only the private resolver and its one collaborator are exercised. */
    private SalesInvoiceService service;

    @BeforeEach
    void setUp() {
        salespersonService = new SalespersonService(employeeRepository);
        service = org.mockito.Mockito.mock(SalesInvoiceService.class,
                org.mockito.Mockito.withSettings().defaultAnswer(org.mockito.Mockito.CALLS_REAL_METHODS));
        ReflectionTestUtils.setField(service, "salespersonService", salespersonService);
    }

    private void resolve(SalesInvoice invoice) {
        ReflectionTestUtils.invokeMethod(service, "resolveBackOfficeSalesperson", invoice);
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

    private static SalesInvoice invoice() {
        SalesInvoice inv = new SalesInvoice();
        inv.setSalesperson("admin@billbull.test"); // the LEGACY free-text field
        return inv;
    }

    // ── attribution ─────────────────────────────────────────────────────────

    @Test
    void writesTheCanonicalIdCodeAndNameFromTheEmployeeRecord() {
        when(employeeRepository.findById(7L)).thenReturn(Optional.of(
                employee(7L, "EMP9664", "Manager", "One", "Active", "Salesperson")));

        SalesInvoice inv = invoice();
        inv.setSalespersonEmployeeId(7L);
        // A deliberately wrong name/code from the client: neither is trusted.
        inv.setSalespersonEmployeeCode("CLIENT-LIE");
        inv.setSalespersonName("Somebody Else");

        resolve(inv);

        assertEquals(7L, inv.getSalespersonEmployeeId());
        assertEquals("EMP9664", inv.getSalespersonEmployeeCode());
        assertEquals("Manager One", inv.getSalespersonName());
    }

    @Test
    void acceptsACashierSalesperson() {
        when(employeeRepository.findById(8L)).thenReturn(Optional.of(
                employee(8L, "EMP-008", "Cashier", "One", "Active", "Cashier + Salesperson")));

        SalesInvoice inv = invoice();
        inv.setSalespersonEmployeeId(8L);
        resolve(inv);

        assertEquals("Cashier One", inv.getSalespersonName());
    }

    // ── the legacy field ────────────────────────────────────────────────────

    @Test
    void neverTouchesTheLegacySalespersonString() {
        when(employeeRepository.findById(7L)).thenReturn(Optional.of(
                employee(7L, "EMP9664", "Manager", "One", "Active", "Salesperson")));

        SalesInvoice inv = invoice();
        inv.setSalespersonEmployeeId(7L);
        resolve(inv);

        // Existing reports read this. It keeps its exact current behaviour.
        assertEquals("admin@billbull.test", inv.getSalesperson());
    }

    // ── not attributed ──────────────────────────────────────────────────────

    @Test
    void anInvoiceWithNoSalespersonIsLeftAloneAndQueriesNothing() {
        SalesInvoice inv = invoice();

        resolve(inv);

        assertNull(inv.getSalespersonEmployeeId());
        assertNull(inv.getSalespersonName());
        assertEquals("admin@billbull.test", inv.getSalesperson());
        verify(employeeRepository, never()).findById(org.mockito.ArgumentMatchers.anyLong());
    }

    // ── eligibility is the same rule as POS ─────────────────────────────────

    @Test
    void rejectsAnIneligibleEmployee() {
        when(employeeRepository.findById(5L)).thenReturn(Optional.of(
                employee(5L, "EMP-005", "Plain", "Cashier", "Active", "Cashier")));

        SalesInvoice inv = invoice();
        inv.setSalespersonEmployeeId(5L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> resolve(inv));
        assertTrue(String.valueOf(ex.getReason()).contains("not an eligible salesperson"));
    }

    @Test
    void rejectsAnInactiveEmployee() {
        when(employeeRepository.findById(9L)).thenReturn(Optional.of(
                employee(9L, "EMP-009", "Gone", "Away", "Inactive", "Salesperson")));

        SalesInvoice inv = invoice();
        inv.setSalespersonEmployeeId(9L);

        assertThrows(ResponseStatusException.class, () -> resolve(inv));
    }

    @Test
    void rejectsAnArbitraryEmployeeIdFromTheClient() {
        when(employeeRepository.findById(999L)).thenReturn(Optional.empty());

        SalesInvoice inv = invoice();
        inv.setSalespersonEmployeeId(999L);

        assertThrows(ResponseStatusException.class, () -> resolve(inv));
    }

    // ── immutability on a finalized invoice still wins ──────────────────────

    @Test
    void aFinalizedInvoicesAttributionStillCannotBeRewritten() {
        // resolveBackOfficeSalesperson runs FIRST, then preserveFinalizedSalespersonAttribution
        // restores the persisted values over it — commission history stays immutable.
        SalesInvoice persisted = new SalesInvoice();
        persisted.setId(1L);
        persisted.setStatus(SalesInvoiceStatus.PAID);
        persisted.setSalespersonEmployeeId(7L);
        persisted.setSalespersonEmployeeCode("EMP9664");
        persisted.setSalespersonName("Manager One");

        SalesInvoice edit = invoice();
        edit.setSalespersonEmployeeId(9L);
        edit.setSalespersonEmployeeCode("EMP-009");
        edit.setSalespersonName("Sales Two");

        SalesInvoiceService.preserveFinalizedSalespersonAttribution(edit, persisted);

        assertEquals(7L, edit.getSalespersonEmployeeId());
        assertEquals("EMP9664", edit.getSalespersonEmployeeCode());
        assertEquals("Manager One", edit.getSalespersonName());
    }
}
