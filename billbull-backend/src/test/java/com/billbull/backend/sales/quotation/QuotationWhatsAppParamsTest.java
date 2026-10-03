package com.billbull.backend.sales.quotation;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class QuotationWhatsAppParamsTest {

    @Test
    void templateParamsAreNameNumberAmountValidity() {
        Quotation q = new Quotation();
        q.setCustomer("Test Customer - CUST-2026-0003");
        q.setCustomerCode("CUST-2026-0003");
        q.setQtnNo("QTN-2026-0016");
        q.setTotalAmount(new BigDecimal("2800"));
        q.setCurrency("AED");
        q.setValidTill(LocalDate.of(2026, 10, 8));

        assertEquals(List.of("Test Customer", "QTN-2026-0016", "AED 2,800.00", "08 Oct 2026"),
                QuotationController.quotationTemplateParams(q));
    }
}
