package com.billbull.backend.inventory.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.inventory.product.PackingConversions;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;

/** The item-margin report's cost fallback counts base units: paid in the line unit + free in its FOC unit. */
class InventoryMarginLineBaseQtyTest {

    private static final PackingConversions CONV = PackingConversions.of(List.<Object[]>of(
            new Object[] { "A", "BOX", new BigDecimal("12") }));

    private static SalesInvoiceItem line(String unit, int qty, int foc, String focUnit) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setItemCode("a"); // codes match case-insensitively, as the converter is keyed
        item.setUnit(unit);
        item.setQuantity(qty);
        item.setFoc(foc);
        item.setFocUnit(focUnit);
        return item;
    }

    @Test
    void convertsPaidAndFreeQuantitiesToBaseUnits() {
        assertEquals(12, InventoryReportDataService.lineBaseQty(line("BOX", 1, 0, null), CONV));
        assertEquals(24, InventoryReportDataService.lineBaseQty(line("BOX", 1, 1, null), CONV));
        assertEquals(13, InventoryReportDataService.lineBaseQty(line("box", 1, 1, "PCS"), CONV));
        assertEquals(3, InventoryReportDataService.lineBaseQty(line("PCS", 3, 0, null), CONV));
    }

    @Test
    void withoutConversionsTheQuantityIsTakenAsBaseUnits() {
        assertEquals(2, InventoryReportDataService.lineBaseQty(line("BOX", 1, 1, null), PackingConversions.none()));
    }
}
