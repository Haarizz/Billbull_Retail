package com.billbull.backend.sales.salesorder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.common.VatMode;

/** Sales Order uses the same allocator, rounding and VAT behaviour as the Sales Invoice. */
class SalesOrderFooterDiscountTest {

    private final SalesOrderService service = new SalesOrderService(
            mock(SalesOrderRepository.class),
            mock(com.billbull.backend.sales.quotation.QuotationRepository.class),
            mock(com.billbull.backend.inventory.warehouse.WarehouseStockService.class),
            mock(com.billbull.backend.inventory.product.ProductRepository.class),
            mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
            mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
            mock(com.billbull.backend.inventory.product.ProductPackingRepository.class),
            mock(com.billbull.backend.settings.branch.BranchAccessService.class),
            new com.billbull.backend.common.ownership.OwnershipAccessService(
                    mock(com.billbull.backend.security.RolePermissionRepository.class), false),
            mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
            mock(com.billbull.backend.inventory.warehouse.BinRepository.class),
            mock(com.billbull.backend.inventory.batch.BatchSelectionService.class),
            mock(com.billbull.backend.sales.settings.SalesSettingsService.class),
            mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class),
            mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService.class),
            mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository.class));

    @Test
    void screenshotOrderMatchesTheInvoiceAllocation() {
        SalesOrder order = order("amount", null, "100", VatMode.EXCLUSIVE);

        var result = service.applyFooterDiscountAllocation(order);

        SalesOrderItem a = order.getItems().get(0);
        SalesOrderItem b = order.getItems().get(1);
        assertMoney("93.96", a.getFooterDiscount());
        assertMoney("6.04", b.getFooterDiscount());
        assertMoney("2706.04", a.getTaxableAmount());
        assertMoney("135.30", a.getTaxAmount());
        assertMoney("34.79", b.getTaxAmount());
        assertMoney("2841.34", a.getLineTotal());
        assertMoney("208.75", b.getLineTotal());
        assertMoney("100.00", order.getBillDiscountAmount());
        assertMoney("170.09", result.taxTotal());
        assertMoney("3050.09", result.lineTotal());
        assertMoney("3050.09", result.subTotal().subtract(order.getBillDiscountAmount()).add(result.taxTotal()));
    }

    @Test
    void inclusiveOrderMatchesTheInvoiceAllocation() {
        SalesOrder order = order("amount", null, "100", VatMode.INCLUSIVE);

        var result = service.applyFooterDiscountAllocation(order);

        assertMoney("2880.00", result.lineTotal());
        assertMoney("157.85", result.taxTotal());
    }

    @Test
    void finalizedOrdersKeepStoredValues() {
        assertTrue(SalesOrderService.shouldAllocateFooterDiscount(null));
        assertTrue(SalesOrderService.shouldAllocateFooterDiscount(withStatus(SalesOrderStatus.DRAFT)));
        assertTrue(SalesOrderService.shouldAllocateFooterDiscount(withStatus(SalesOrderStatus.CONFIRMED)));
        assertFalse(SalesOrderService.shouldAllocateFooterDiscount(withStatus(SalesOrderStatus.INVOICED)));
        assertFalse(SalesOrderService.shouldAllocateFooterDiscount(withStatus(SalesOrderStatus.FULLY_PAID)));
        assertFalse(SalesOrderService.shouldAllocateFooterDiscount(withStatus(SalesOrderStatus.DELIVERED)));
    }

    private static SalesOrder withStatus(SalesOrderStatus status) {
        SalesOrder o = new SalesOrder();
        o.setStatus(status);
        return o;
    }

    private static SalesOrder order(String type, Double percent, String amount, VatMode mode) {
        SalesOrder order = new SalesOrder();
        order.setVatMode(mode);
        order.setBillDiscountType(type);
        order.setBillDiscount(percent);
        order.setBillDiscountAmount(amount != null ? new BigDecimal(amount) : null);
        order.setItems(new ArrayList<>(List.of(line("3500", 20d, 5d), line("200", 10d, 20d))));
        return order;
    }

    private static SalesOrderItem line(String price, double disc, double tax) {
        SalesOrderItem item = new SalesOrderItem();
        item.setQuantity(1);
        item.setPrice(new BigDecimal(price));
        item.setDiscount(disc);
        item.setTaxRate(tax);
        return item;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
