package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;

/**
 * Server-side salesperson resolution for the back-office invoice path, plus the regression guard
 * that the new fields cannot perturb invoice totals.
 *
 * <p>{@code finalizeInvoiceTotals} is covered end-to-end by {@link SalesInvoiceTotalsTest}; the
 * check here is narrower and specific to this feature — that attribution is inert arithmetic-wise.
 */
@ExtendWith(MockitoExtension.class)
class SalesInvoiceSalespersonAttributionTest {

    @Mock private EmployeeRepository employeeRepository;

    private SalespersonAttributionService service;

    @BeforeEach
    void setUp() {
        service = new SalespersonAttributionService(employeeRepository);
    }

    private static Employee employee(long id, String code, String first, String last, String status) {
        Employee e = new Employee();
        e.setId(id);
        e.setEmployeeCode(code);
        e.setFirstName(first);
        e.setLastName(last);
        e.setStatus(status);
        return e;
    }

    @Test
    void resolvesByIdAndOverwritesAnyClientSuppliedCodeAndName() {
        when(employeeRepository.findById(7L))
                .thenReturn(Optional.of(employee(7L, "EMP-007", "Manager", "One", "Active")));

        SalesInvoice invoice = new SalesInvoice();
        invoice.setSalespersonEmployeeId(7L);
        invoice.setSalespersonEmployeeCode("CLIENT-JUNK");
        invoice.setSalespersonName("Somebody Else");

        service.applyTo(invoice);

        assertEquals(7L, invoice.getSalespersonEmployeeId());
        assertEquals("EMP-007", invoice.getSalespersonEmployeeCode());
        assertEquals("Manager One", invoice.getSalespersonName());
    }

    @Test
    void fallsBackToTheEmployeeCodeWhenNoIdIsSupplied() {
        when(employeeRepository.findByEmployeeCodeIgnoreCase("emp-009"))
                .thenReturn(Optional.of(employee(9L, "EMP-009", "Sales", "Person", "Active")));

        SalesInvoice invoice = new SalesInvoice();
        invoice.setSalespersonEmployeeCode("emp-009");

        service.applyTo(invoice);

        assertEquals(9L, invoice.getSalespersonEmployeeId());
        assertEquals("EMP-009", invoice.getSalespersonEmployeeCode());
    }

    @Test
    void clearsAllThreeFieldsWhenNothingIsSupplied() {
        SalesInvoice invoice = new SalesInvoice();
        // A name with no id/code is not an identity and must not survive.
        invoice.setSalespersonName("Typed By Hand");

        service.applyTo(invoice);

        assertNull(invoice.getSalespersonEmployeeId());
        assertNull(invoice.getSalespersonEmployeeCode());
        assertNull(invoice.getSalespersonName());
    }

    @Test
    void rejectsAnInactiveEmployee() {
        when(employeeRepository.findById(11L))
                .thenReturn(Optional.of(employee(11L, "EMP-011", "Former", "Staff", "Inactive")));

        SalesInvoice invoice = new SalesInvoice();
        invoice.setSalespersonEmployeeId(11L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.applyTo(invoice));
        assertTrue(ex.getMessage().contains("active employee"));
    }

    @Test
    void rejectsAnUnknownEmployee() {
        when(employeeRepository.findById(404L)).thenReturn(Optional.empty());

        SalesInvoice invoice = new SalesInvoice();
        invoice.setSalespersonEmployeeId(404L);

        assertThrows(ResponseStatusException.class, () -> service.applyTo(invoice));
    }

    @Test
    void neverReadsOrWritesTheLegacySalespersonString() {
        when(employeeRepository.findById(7L))
                .thenReturn(Optional.of(employee(7L, "EMP-007", "Manager", "One", "Active")));

        SalesInvoice invoice = new SalesInvoice();
        invoice.setSalesperson("legacy.username");
        invoice.setSalespersonEmployeeId(7L);

        service.applyTo(invoice);

        // The legacy column is an independent concept and keeps whatever it had.
        assertEquals("legacy.username", invoice.getSalesperson());
        assertEquals("Manager One", invoice.getSalespersonName());
    }

    @Test
    void attributionDoesNotAffectInvoiceTotals() {
        // Regression guard: invoiceTotal is the commission base, so it must be computed from the
        // money fields alone. Two identical invoices, one attributed and one not, must agree.
        SalesInvoiceService svc = SalesInvoiceTotalsTest.newServiceWithMockedDepsForReuse();

        SalesInvoice unattributed = new SalesInvoice();
        unattributed.setBillDiscountAmount(new BigDecimal("1000.00"));
        svc.finalizeInvoiceTotals(unattributed, new BigDecimal("10000.00"), new BigDecimal("450.00"));

        SalesInvoice attributed = new SalesInvoice();
        attributed.setBillDiscountAmount(new BigDecimal("1000.00"));
        attributed.setSalespersonEmployeeId(7L);
        attributed.setSalespersonEmployeeCode("EMP-007");
        attributed.setSalespersonName("Manager One");
        svc.finalizeInvoiceTotals(attributed, new BigDecimal("10000.00"), new BigDecimal("450.00"));

        // 10,000 - 1,000 + 450 = 9,450 — the worked example, unchanged by attribution.
        assertEquals(new BigDecimal("9450.00"), unattributed.getInvoiceTotal());
        assertEquals(unattributed.getInvoiceTotal(), attributed.getInvoiceTotal());
        assertEquals(unattributed.getSubTotal(), attributed.getSubTotal());
        assertEquals(unattributed.getTaxTotal(), attributed.getTaxTotal());
        assertEquals(unattributed.getBalance(), attributed.getBalance());
    }
}
