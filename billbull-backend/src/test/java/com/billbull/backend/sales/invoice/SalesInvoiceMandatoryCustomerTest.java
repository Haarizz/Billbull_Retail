package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;

/** Sales → Configure & customize → Mandatory Customer on back-office Sales Invoices. */
class SalesInvoiceMandatoryCustomerTest {

    @Test
    void offAllowsWalkIn() {
        SalesInvoiceController controller = controller(false);
        assertDoesNotThrow(() -> controller.assertCustomerSelectedIfRequired(invoice("WALKIN", "Walk-in Customer")));
        assertDoesNotThrow(() -> controller.assertCustomerSelectedIfRequired(invoice("", "")));
    }

    @Test
    void onRefusesBlankOrWalkIn() {
        SalesInvoiceController controller = controller(true);
        for (SalesInvoice inv : new SalesInvoice[] {
                invoice("", ""),
                invoice(null, null),
                invoice("WALKIN", "Walk-in Customer"),
                invoice("WALK-IN", "Anything"),
                invoice("CUST0001", "Walk-In Customer") }) {
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> controller.assertCustomerSelectedIfRequired(inv));
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        }
    }

    @Test
    void onAcceptsARealCustomer() {
        SalesInvoiceController controller = controller(true);
        assertDoesNotThrow(() -> controller.assertCustomerSelectedIfRequired(invoice("CUST0042", "Al Noor Trading")));
    }

    private static SalesInvoiceController controller(boolean required) {
        SalesSettings settings = new SalesSettings();
        settings.setCustomerRequiredOnSalesInvoice(required);
        SalesSettingsService service = mock(SalesSettingsService.class);
        when(service.getSettings()).thenReturn(settings);
        return new SalesInvoiceController(null, null, null, null, null, null, null, service);
    }

    private static SalesInvoice invoice(String code, String name) {
        SalesInvoice inv = new SalesInvoice();
        inv.setCustomerCode(code);
        inv.setCustomerName(name);
        return inv;
    }
}
