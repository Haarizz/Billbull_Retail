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
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Characterization test for {@link ProformaService#create} covering the
 * exact scenario reported as a system-wide VAT-Inclusive double-counting
 * bug: Qty 12 x 40.00 @ 5% VAT inclusive must show Taxable 457.14 / VAT
 * 22.86 / Total 480.00 — matching the shared VatCalculator used by
 * SalesInvoiceService.
 */
class ProformaServiceTaxTest {

    @Test
    void inclusiveModeDoesNotDoubleCountVat() {
        ProformaRepository repo = mock(ProformaRepository.class);
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ProformaService service = new ProformaService(
                repo,
                mock(ProductRepository.class),
                mock(ProductBarcodeRepository.class),
                mock(ProductMediaRepository.class),
                mock(BranchAccessService.class),
                new com.billbull.backend.common.ownership.OwnershipAccessService(
                        mock(com.billbull.backend.security.RolePermissionRepository.class), false),
                mock(WarehouseStockService.class),
                mock(SalesDocumentNumberingService.class));

        ProformaItemRequest item = new ProformaItemRequest();
        item.quantity = BigDecimal.valueOf(12);
        item.price = new BigDecimal("40.00");
        item.taxPercent = new BigDecimal("5");
        item.discountPercent = BigDecimal.ZERO;

        ProformaRequest req = new ProformaRequest();
        req.taxInclusive = true;
        req.billDiscount = BigDecimal.ZERO;
        req.items = List.of(item);

        ProformaResponse res = service.create(req);

        assertMoney("457.14", res.getSubTotal());
        assertMoney("22.86", res.getTaxTotal());
        assertMoney("480.00", res.getGrandTotal());
        assertEquals(Boolean.TRUE, res.getTaxInclusive());
        assertMoney("457.14", res.getItems().get(0).getTaxableAmount());
        assertMoney("22.86", res.getItems().get(0).getTaxAmount());
        assertMoney("480.00", res.getItems().get(0).getLineTotal());
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
