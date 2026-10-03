package com.billbull.backend.sales.invoice;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SalesInvoiceWhatsAppParamsTest {

    @Test
    void templateParamsAreNameNumberTotalDueDate() {
        SalesInvoice inv = invoice();
        inv.setDueDate(LocalDate.of(2026, 10, 31));

        assertEquals(List.of("Test Customer", "INV-2026-0042", "AED 1,050.00", "31 Oct 2026"),
                SalesInvoiceController.invoiceTemplateParams(inv, "AED"));
    }

    @Test
    void invoiceDateStandsInForAMissingDueDate() {
        SalesInvoice inv = invoice();
        inv.setDueDate(null);

        assertEquals("01 Oct 2026", SalesInvoiceController.invoiceTemplateParams(inv, "AED").get(3));
    }

    private static SalesInvoice invoice() {
        SalesInvoice inv = new SalesInvoice();
        inv.setCustomerName("Test Customer");
        inv.setCustomerCode("CUST-2026-0003");
        inv.setInvoiceNumber("INV-2026-0042");
        inv.setInvoiceTotal(new BigDecimal("1050"));
        inv.setInvoiceDate(LocalDate.of(2026, 10, 1));
        return inv;
    }
}
