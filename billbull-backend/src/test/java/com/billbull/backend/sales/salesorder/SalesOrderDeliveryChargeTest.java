package com.billbull.backend.sales.salesorder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.sales.common.VatMode;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/** A Sales Order's delivery charge is a flat, untaxed add-on included in the order total. */
class SalesOrderDeliveryChargeTest {

    private final SalesOrderRepository orderRepo = mock(SalesOrderRepository.class);
    private final BranchAccessService branchAccess = mock(BranchAccessService.class);
    private final SalesSettingsService settings = mock(SalesSettingsService.class);
    private final SalesDocumentNumberingService numbering = mock(SalesDocumentNumberingService.class);

    private final SalesOrderService service = new SalesOrderService(
            orderRepo,
            mock(com.billbull.backend.sales.quotation.QuotationRepository.class),
            mock(com.billbull.backend.inventory.warehouse.WarehouseStockService.class),
            mock(com.billbull.backend.inventory.product.ProductRepository.class),
            mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
            mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
            mock(com.billbull.backend.inventory.product.ProductPackingRepository.class),
            branchAccess,
            new com.billbull.backend.common.ownership.OwnershipAccessService(
                    mock(com.billbull.backend.security.RolePermissionRepository.class), false),
            mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
            mock(com.billbull.backend.inventory.warehouse.BinRepository.class),
            mock(com.billbull.backend.inventory.batch.BatchSelectionService.class),
            settings,
            numbering,
            mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService.class),
            mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository.class));

    @BeforeEach
    void setUp() {
        Branch branch = new Branch();
        branch.setDefaultWarehouse(new Warehouse());
        when(branchAccess.getRequiredCurrentUserBranch()).thenReturn(branch);
        when(settings.getSettings()).thenReturn(new SalesSettings());
        when(numbering.resolveNumberForCreate(any(), any())).thenReturn("SO-1");
        when(orderRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void theDeliveryChargeIsAddedToTheOrderTotalUntaxed() {
        SalesOrder saved = service.save(order("25.00", "40.00"));

        // 100 + 5% VAT = 105, plus a 25.00 delivery charge with no VAT on it.
        assertMoney("105.00", saved.getSubTotal().add(saved.getTaxTotal()));
        assertMoney("130.00", saved.getOrderTotal());
        assertMoney("90.00", saved.getBalanceDue());
        assertMoney("25.00", saved.getDeliveryCharge());
    }

    @Test
    void noChargeLeavesTheTotalAsItWas() {
        SalesOrder saved = service.save(order(null, null));
        assertMoney("105.00", saved.getOrderTotal());
        assertNull(saved.getDeliveryCharge());
    }

    @Test
    void aNegativeChargeIsTreatedAsNone() {
        SalesOrder saved = service.save(order("-10", null));
        assertMoney("105.00", saved.getOrderTotal());
        assertNull(saved.getDeliveryCharge());
    }

    private static SalesOrder order(String deliveryCharge, String advance) {
        SalesOrder order = new SalesOrder();
        order.setStatus(SalesOrderStatus.DRAFT);
        order.setVatMode(VatMode.EXCLUSIVE);
        order.setDeliveryType("Delivery");
        order.setDeliveryCharge(deliveryCharge != null ? new BigDecimal(deliveryCharge) : null);
        order.setAdvanceAmount(advance != null ? new BigDecimal(advance) : null);
        SalesOrderItem item = new SalesOrderItem();
        item.setQuantity(1);
        item.setPrice(new BigDecimal("100"));
        item.setDiscount(0d);
        item.setTaxRate(5d);
        order.setItems(new ArrayList<>(List.of(item)));
        return order;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
