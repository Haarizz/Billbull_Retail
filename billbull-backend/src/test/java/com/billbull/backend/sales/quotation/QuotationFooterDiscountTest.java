package com.billbull.backend.sales.quotation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.common.VatMode;

/** Quotation uses the shared allocator, and its header math is BigDecimal (no double). */
class QuotationFooterDiscountTest {

    private final QuotationService service = new QuotationService(
            mock(QuotationRepository.class),
            new com.fasterxml.jackson.databind.ObjectMapper(),
            mock(com.billbull.backend.inventory.product.ProductRepository.class),
            mock(com.billbull.backend.inventory.product.ProductPricingRepository.class),
            mock(com.billbull.backend.inventory.product.ProductTaxRepository.class),
            mock(com.billbull.backend.inventory.product.ProductInventoryPolicyRepository.class),
            mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
            mock(com.billbull.backend.sales.salesorder.SalesOrderRepository.class),
            mock(com.billbull.backend.sales.invoice.SalesInvoiceRepository.class),
            mock(com.billbull.backend.inventory.product.ProductPackingRepository.class),
            mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
            mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
            mock(com.billbull.backend.customer.inquiries.CustomerInquiryRepository.class),
            mock(com.billbull.backend.customer.inquiries.InquiryFollowUpRepository.class),
            mock(com.billbull.backend.sales.settings.SalesSettingsService.class),
            mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class),
            mock(com.billbull.backend.settings.branch.BranchAccessService.class),
            new com.billbull.backend.common.ownership.OwnershipAccessService(
                    mock(com.billbull.backend.security.RolePermissionRepository.class), false));

    @Test
    void screenshotQuotationMatchesTheInvoiceAllocation() {
        Quotation q = quotation("amount", null, "100", VatMode.EXCLUSIVE);

        service.recalculateTotals(q, true);

        assertMoney("93.96", q.getItems().get(0).getFooterDiscount());
        assertMoney("6.04", q.getItems().get(1).getFooterDiscount());
        assertMoney("135.30", q.getItems().get(0).getTaxAmount());
        assertMoney("34.79", q.getItems().get(1).getTaxAmount());
        assertMoney("2841.34", q.getItems().get(0).getLineTotal());
        assertMoney("2980.00", q.getSubTotal());
        assertMoney("170.09", q.getTaxAmount());
        assertMoney("100.00", q.getBillDiscountAmount());
        assertMoney("3050.09", q.getTotalAmount());
    }

    @Test
    void percentQuotationUsesMoneySafeHeaderMath() {
        Quotation q = quotation("percent", "10", null, VatMode.EXCLUSIVE);

        service.recalculateTotals(q, true);

        assertMoney("298.00", q.getBillDiscountAmount());
        assertMoney("2840.40", q.getTotalAmount());
        assertEquals(2, q.getTotalAmount().scale());
    }

    @Test
    void inclusiveQuotationIsCustomerFacing() {
        Quotation q = quotation("amount", null, "100", VatMode.INCLUSIVE);

        service.recalculateTotals(q, true);

        assertMoney("2880.00", q.getTotalAmount());
        assertMoney("157.85", q.getTaxAmount());
    }

    @Test
    void legacyPathSumsStoredLinesWithoutReallocating() {
        Quotation q = quotation("amount", null, "100", VatMode.EXCLUSIVE);
        service.recalculateTotals(q, true);
        q.getItems().get(0).setFooterDiscount(new BigDecimal("93.96")); // stored, untouched

        service.recalculateTotals(q, false);

        assertMoney("3050.09", q.getTotalAmount());
    }

    @Test
    void convertedQuotationsKeepStoredValues() {
        assertTrue(QuotationService.shouldAllocateFooterDiscount(null));
        Quotation approved = new Quotation();
        approved.setStatus(QuotationStatus.APPROVED);
        assertTrue(QuotationService.shouldAllocateFooterDiscount(approved));
        Quotation converted = new Quotation();
        converted.setStatus(QuotationStatus.CONVERTED);
        assertFalse(QuotationService.shouldAllocateFooterDiscount(converted));
    }

    private static Quotation quotation(String type, String percent, String amount, VatMode mode) {
        Quotation q = new Quotation();
        q.setVatMode(mode);
        q.setBillDiscountType(type);
        q.setBillDiscount(percent != null ? new BigDecimal(percent) : null);
        q.setBillDiscountAmount(amount != null ? new BigDecimal(amount) : null);
        q.setItems(new ArrayList<>(List.of(line("3500", "20", "5"), line("200", "10", "20"))));
        return q;
    }

    private static QuotationItem line(String price, String disc, String tax) {
        QuotationItem item = new QuotationItem();
        item.setQuantity(BigDecimal.ONE);
        item.setPrice(new BigDecimal(price));
        item.setDiscount(new BigDecimal(disc));
        item.setTaxRate(new BigDecimal(tax));
        return item;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
