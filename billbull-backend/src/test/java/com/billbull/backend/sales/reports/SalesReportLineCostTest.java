package com.billbull.backend.sales.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;

/**
 * Margin-report line cost: invoice-line {@code cost} is per BASE unit, so the report multiplies
 * it by the base units the line issues (paid in its unit + free in its FOC unit). It used to
 * multiply by the selling quantity — a box of 12 at one piece's cost, free goods at nothing.
 */
class SalesReportLineCostTest {

    private SalesReportDataService service(boolean withPackings) {
        SalesReportDataService service = new SalesReportDataService(
                mock(SalesInvoiceRepository.class), mock(SalesReturnRepository.class), mock(SalesOrderRepository.class),
                mock(DeliveryNoteRepository.class), mock(CustomerRepository.class), mock(ProductRepository.class),
                mock(PaymentRepository.class),
                new com.billbull.backend.sales.returns.reporting.SalesReturnReportingService(
                        mock(SalesReturnRepository.class)));
        if (withPackings) {
            ProductPackingRepository packings = mock(ProductPackingRepository.class);
            when(packings.findActiveConversionsByProductCode()).thenReturn(List.<Object[]>of(
                    new Object[] { "A", "BOX", new BigDecimal("12") },
                    new Object[] { "A", "CTN", new BigDecimal("48") }));
            service.setPackingRepository(packings);
        }
        return service;
    }

    private static SalesInvoiceItem line(String unit, int qty, int foc, String focUnit, String cost, String cogs) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setItemCode("A");
        item.setUnit(unit);
        item.setQuantity(qty);
        item.setFoc(foc);
        item.setFocUnit(focUnit);
        if (cost != null) item.setCost(new BigDecimal(cost));
        if (cogs != null) item.setRecognizedCogs(new BigDecimal(cogs));
        return item;
    }

    @Test
    void aBoxLineIsCostedAtTwelveBaseUnits() {
        assertEquals(120.0, service(true).lineCost(line("BOX", 1, 0, null, "10", null), null), 0.0001); // was 10
    }

    @Test
    void twoBoxesAndALargerCartonUseTheirOwnConversions() {
        assertEquals(240.0, service(true).lineCost(line("BOX", 2, 0, null, "10", null), null), 0.0001);
        assertEquals(480.0, service(true).lineCost(line("CTN", 1, 0, null, "10", null), null), 0.0001);
    }

    @Test
    void freeUnitsAreCostedInTheirOwnUnit() {
        // 1 sold + 1 free piece; 1 sold box + 1 free piece.
        assertEquals(80.0, service(true).lineCost(line("PCS", 1, 1, null, "40", null), null), 0.0001);   // was 40
        assertEquals(130.0, service(true).lineCost(line("BOX", 1, 1, "PCS", "10", null), null), 0.0001);
    }

    @Test
    void aBaseUnitLineIsUnchanged() {
        assertEquals(120.0, service(true).lineCost(line("PCS", 3, 0, null, "40", null), null), 0.0001);
    }

    @Test
    void withNoCostTheBookedCogsIsUsedAsBefore() {
        assertEquals(96.74, service(true).lineCost(line("PCS", 1, 0, null, null, "96.74"), null), 0.0001);
    }

    @Test
    void withoutPackingDataQuantitiesCountAsBaseUnits() {
        assertEquals(10.0, service(false).lineCost(line("BOX", 1, 0, null, "10", null), null), 0.0001);
    }
}
