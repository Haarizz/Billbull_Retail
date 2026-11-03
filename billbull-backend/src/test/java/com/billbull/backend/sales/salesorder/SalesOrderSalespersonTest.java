package com.billbull.backend.sales.salesorder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.SalespersonService;

/** The salesperson on a Sales Order is re-read from the employee row, never trusted from the client. */
class SalesOrderSalespersonTest {

    private final SalespersonService salespersons = mock(SalespersonService.class);
    private final SalesOrderService service = new SalesOrderService(
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);

    @BeforeEach
    void setUp() {
        service.setSalespersonService(salespersons);
    }

    @Test
    void nobodyNamedLeavesTheOrderUnassigned() {
        SalesOrder order = new SalesOrder();
        order.setSalespersonName("Typed by client");

        service.resolveSalesperson(order, null);

        assertNull(order.getSalespersonEmployeeId());
        assertNull(order.getSalespersonEmployeeCode());
        assertNull(order.getSalespersonName());
    }

    @Test
    void aNamedSalespersonIsStampedFromTheEmployeeRow() {
        SalesOrder order = new SalesOrder();
        order.setSalespersonEmployeeId(44L);
        order.setSalespersonName("Spoofed");
        when(salespersons.resolveEligible(44L, null)).thenReturn(employee(44L, "EMP-44", "Asha", "Nair"));

        service.resolveSalesperson(order, null);

        assertEquals(44L, order.getSalespersonEmployeeId());
        assertEquals("EMP-44", order.getSalespersonEmployeeCode());
        assertEquals("Asha Nair", order.getSalespersonName());
    }

    @Test
    void anIneligibleSalespersonIsRefused() {
        SalesOrder order = new SalesOrder();
        order.setSalespersonEmployeeId(44L);
        when(salespersons.resolveEligible(44L, null)).thenThrow(
                new ResponseStatusException(HttpStatus.BAD_REQUEST, "not eligible"));

        assertThrows(ResponseStatusException.class, () -> service.resolveSalesperson(order, null));
    }

    @Test
    void anUnchangedSalespersonIsKeptEvenAfterTheyLeave() {
        SalesOrder existing = new SalesOrder();
        existing.setSalespersonEmployeeId(44L);
        existing.setSalespersonEmployeeCode("EMP-44");
        existing.setSalespersonName("Asha Nair");
        SalesOrder edit = new SalesOrder();
        edit.setSalespersonEmployeeId(44L);

        service.resolveSalesperson(edit, existing);

        verify(salespersons, never()).resolveEligible(any(), any());
        assertEquals("EMP-44", edit.getSalespersonEmployeeCode());
        assertEquals("Asha Nair", edit.getSalespersonName());
    }

    private static Employee employee(Long id, String code, String first, String last) {
        Employee e = new Employee();
        e.setId(id);
        e.setEmployeeCode(code);
        e.setFirstName(first);
        e.setLastName(last);
        return e;
    }
}
