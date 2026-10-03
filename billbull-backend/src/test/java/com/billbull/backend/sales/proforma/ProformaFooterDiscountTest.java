package com.billbull.backend.sales.proforma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Proforma parity: % or fixed footer discount, allocated per line BEFORE VAT, so the saved
 * Proforma equals the Sales Invoice (and the editor preview) for the same lines.
 * Previously VAT was calculated before the discount and no line share was stored.
 */
class ProformaFooterDiscountTest {

    private final ProformaService service = newService();

    @Test
    void fixedAmountIsAllocatedBeforeVat() {
        ProformaResponse res = service.create(screenshotRequest("amount", null, "100", false));

        assertEquals("amount", res.getBillDiscountType());
        assertMoney("100.00", res.getBillDiscountAmount());
        assertMoney("93.96", res.getItems().get(0).getFooterDiscount());
        assertMoney("6.04", res.getItems().get(1).getFooterDiscount());
        assertMoney("2706.04", res.getItems().get(0).getTaxableAmount());
        assertMoney("135.30", res.getItems().get(0).getTaxAmount());
        assertMoney("34.79", res.getItems().get(1).getTaxAmount());
        assertMoney("170.09", res.getTaxTotal());
        assertMoney("3050.09", res.getGrandTotal());
    }

    @Test
    void percentDiscountReducesVat() {
        ProformaResponse res = service.create(screenshotRequest("percent", "10", null, false));

        assertMoney("298.00", res.getBillDiscountAmount());
        assertMoney("158.40", res.getTaxTotal()); // was 176.00 when VAT ignored the discount
        assertMoney("2840.40", res.getGrandTotal());
    }

    @Test
    void legacyRequestWithOnlyAPercentageStillWorks() {
        ProformaResponse res = service.create(screenshotRequest(null, "10", null, false));

        assertEquals("percent", res.getBillDiscountType());
        assertMoney("2840.40", res.getGrandTotal());
    }

    @Test
    void inclusiveFixedAmountIsCustomerFacing() {
        ProformaResponse res = service.create(screenshotRequest("amount", null, "100", true));

        assertMoney("2880.00", res.getGrandTotal());
        assertMoney("157.85", res.getTaxTotal());
    }

    private static ProformaRequest screenshotRequest(String type, String percent, String amount, boolean inclusive) {
        ProformaRequest req = new ProformaRequest();
        req.taxInclusive = inclusive;
        req.billDiscountType = type;
        req.billDiscount = percent != null ? new BigDecimal(percent) : null;
        req.billDiscountAmount = amount != null ? new BigDecimal(amount) : null;
        req.items = List.of(item("3500", "20", "5"), item("200", "10", "20"));
        return req;
    }

    private static ProformaItemRequest item(String price, String disc, String tax) {
        ProformaItemRequest i = new ProformaItemRequest();
        i.quantity = BigDecimal.ONE;
        i.price = new BigDecimal(price);
        i.discountPercent = new BigDecimal(disc);
        i.taxPercent = new BigDecimal(tax);
        return i;
    }

    private static ProformaService newService() {
        ProformaRepository repo = mock(ProformaRepository.class);
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        return new ProformaService(
                repo,
                mock(ProductRepository.class),
                mock(ProductBarcodeRepository.class),
                mock(ProductMediaRepository.class),
                mock(BranchAccessService.class),
                new com.billbull.backend.common.ownership.OwnershipAccessService(
                        mock(com.billbull.backend.security.RolePermissionRepository.class), false),
                mock(WarehouseStockService.class),
                mock(SalesDocumentNumberingService.class),
                mock(ProductPackingRepository.class));
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
