package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/**
 * Characterization tests for {@link SalesInvoiceService#normalizeInvoiceItemFinancials}
 * covering both VAT modes (POS Phase A, plan item #7).
 *
 * <p>Exclusive: price is net, VAT is added on top -> netAmount = taxable + tax.
 * Inclusive: price already carries VAT, so the discounted line value IS the
 * customer-paid (gross-of-VAT) total and the embedded VAT is extracted. In both
 * modes the header subtotal aggregation ({@code netAmount - taxAmount}) yields the
 * same ex-VAT base for a given customer-paid amount.
 */
class SalesInvoiceItemTaxTest {

    private final SalesInvoiceService service = newServiceWithMockedDeps();

    @Test
    void exclusiveAddsTaxOnTop() {
        SalesInvoiceItem item = line(2, "100.00", 0.0, 5.0); // 2 x 100 net, 5% VAT
        service.normalizeInvoiceItemFinancials(item, false, false);

        assertMoney("200.00", item.getGrossAmount());
        assertMoney("10.00", item.getTaxAmount());   // 5% of 200
        assertMoney("210.00", item.getNetAmount());  // taxable + tax
    }

    @Test
    void inclusiveExtractsEmbeddedTax() {
        SalesInvoiceItem item = line(2, "105.00", 0.0, 5.0); // 2 x 105 incl. 5% VAT
        service.normalizeInvoiceItemFinancials(item, false, true);

        // Customer pays 210.00 (price already includes VAT).
        assertMoney("210.00", item.getNetAmount());
        // Embedded VAT = 210 - 210/1.05 = 210 - 200 = 10.00
        assertMoney("10.00", item.getTaxAmount());
    }

    @Test
    void inclusiveWithLineDiscountExtractsTaxAfterDiscount() {
        SalesInvoiceItem item = line(1, "105.00", 10.0, 5.0); // 105 incl VAT, 10% off
        service.normalizeInvoiceItemFinancials(item, false, true);

        // Discounted gross = 105 - 10.50 = 94.50 (customer-paid, VAT incl.)
        assertMoney("94.50", item.getNetAmount());
        // ex-VAT = 94.50 / 1.05 = 90.00 ; VAT = 4.50
        assertMoney("4.50", item.getTaxAmount());
    }

    @Test
    void zeroRateInclusiveLeavesNoTax() {
        SalesInvoiceItem item = line(3, "10.00", 0.0, 0.0);
        service.normalizeInvoiceItemFinancials(item, false, true);

        assertMoney("30.00", item.getNetAmount());
        assertMoney("0.00", item.getTaxAmount());
    }

    // ----- helpers -----

    private static SalesInvoiceItem line(int qty, String price, double discountPct, double taxPct) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setQuantity(qty);
        item.setPrice(new BigDecimal(price));
        item.setDiscount(discountPct);
        item.setTaxRate(taxPct);
        return item;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }

    private static SalesInvoiceService newServiceWithMockedDeps() {
        return new SalesInvoiceService(
                mock(SalesInvoiceRepository.class),
                mock(com.billbull.backend.financials.generalledger.postingengine.PostingEngineService.class),
                mock(com.billbull.backend.sales.delivery.DeliveryNoteService.class),
                mock(com.billbull.backend.sales.settings.SalesSettingsService.class),
                mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class),
                mock(com.billbull.backend.inventory.stockavailability.StockAvailabilityService.class),
                mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService.class),
                mock(com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository.class),
                mock(com.billbull.backend.inventory.product.ProductRepository.class),
                mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
                mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
                mock(com.billbull.backend.inventory.product.ProductPackingRepository.class),
                mock(com.billbull.backend.sales.salesorder.SalesOrderRepository.class),
                mock(com.billbull.backend.sales.quotation.QuotationRepository.class),
                mock(com.billbull.backend.sales.delivery.DeliveryNoteRepository.class),
                mock(com.billbull.backend.sales.customerledger.CustomerRepository.class),
                mock(com.billbull.backend.sales.customerledger.OpeningInvoiceRepository.class),
                mock(com.billbull.backend.inventory.warehouse.WarehouseRepository.class),
                mock(com.billbull.backend.settings.branch.BranchRepository.class),
                mock(com.billbull.backend.settings.branch.BranchAccessService.class),
                mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
                mock(com.billbull.backend.inventory.warehouse.BinRepository.class),
                mock(com.billbull.backend.inventory.batch.BatchSelectionService.class),
                mock(com.billbull.backend.sales.payment.PaymentService.class),
                mock(com.billbull.backend.notification.NotificationEventPublisher.class),
                mock(com.billbull.backend.pos.dayclose.PosDayCloseRepository.class));
    }
}
