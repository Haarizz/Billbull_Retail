package com.billbull.backend.sales.salesorder;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SalesOrderWhatsAppParamsTest {

    @Test
    void templateParamsAreNameNumberTotalExpectedDelivery() {
        SalesOrder order = order();
        order.setExpectedDeliveryDate(LocalDate.of(2026, 10, 15));

        assertEquals(List.of("Test Customer", "SO-2026-0007", "AED 3,150.00", "15 Oct 2026"),
                SalesOrderController.orderTemplateParams(order, "AED"));
    }

    @Test
    void missingDeliveryDateReadsToBeConfirmed() {
        SalesOrder order = order();
        order.setExpectedDeliveryDate(null);

        assertEquals("to be confirmed", SalesOrderController.orderTemplateParams(order, null).get(3));
    }

    private static SalesOrder order() {
        SalesOrder order = new SalesOrder();
        order.setCustomerName("Test Customer - CUST-2026-0003");
        order.setCustomerCode("CUST-2026-0003");
        order.setSoNumber("SO-2026-0007");
        order.setOrderTotal(new BigDecimal("3150"));
        return order;
    }
}
