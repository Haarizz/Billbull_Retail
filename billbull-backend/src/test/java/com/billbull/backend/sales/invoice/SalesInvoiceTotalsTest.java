package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/**
 * Characterization tests for {@link SalesInvoiceService#finalizeInvoiceTotals}, the
 * pure invoice-header money math (subtotal/tax rounding, bill discount absolute vs
 * percentage, delivery + round-off, invoice total, outstanding balance, and the
 * amount-paid guards).
 *
 * <p>Purpose: pin the CURRENT behaviour so the {@code Double -> BigDecimal} conversion
 * of the Sales domain is provably behaviour-preserving. Every figure asserted here is
 * exactly representable in both {@code double} and {@code BigDecimal}; the suite is run
 * green against the pre-conversion {@code double} code first, then again after the type
 * flip. The branching cases (null fields, absolute-vs-percentage discount selection,
 * the negative-paid and paid-exceeds-total guards) are the real safety net.
 *
 * <p>The service is instantiated with all-null collaborators because
 * {@code finalizeInvoiceTotals} touches none of them — it operates purely on the
 * {@link SalesInvoice} passed in.
 */
class SalesInvoiceTotalsTest {

    /** finalizeInvoiceTotals uses no collaborators, so an all-mock service is fine. */
    private final SalesInvoiceService service = newServiceWithMockedDeps();

    @Test
    void roundsSubtotalAndTaxAndComputesTotalAndBalance() {
        SalesInvoice inv = new SalesInvoice();
        inv.setAmountPaid(100.0);

        // raw subtotal 200.00, tax 10.00 -> total 210.00, paid 100 -> balance 110.00
        service.finalizeInvoiceTotals(inv, 200.0, 10.0);

        assertEquals(200.00, inv.getSubTotal());
        assertEquals(10.00, inv.getTaxTotal());
        assertEquals(210.00, inv.getInvoiceTotal());
        assertEquals(110.00, inv.getBalance());
    }

    @Test
    void roundsHalfUpToTwoDecimals() {
        SalesInvoice inv = new SalesInvoice();
        // 100.005 rounds HALF_UP to 100.01; tax 0.004 rounds to 0.00
        service.finalizeInvoiceTotals(inv, 100.005, 0.004);
        assertEquals(100.01, inv.getSubTotal());
        assertEquals(0.00, inv.getTaxTotal());
        // total = 100.01 - 0 + 0.00 + 0 + 0 = 100.01
        assertEquals(100.01, inv.getInvoiceTotal());
    }

    @Test
    void absoluteBillDiscountIsSubtractedFromTotal() {
        SalesInvoice inv = new SalesInvoice();
        inv.setBillDiscountAmount(25.0); // absolute discount provided

        service.finalizeInvoiceTotals(inv, 200.0, 10.0);

        // total = 200 - 25 + 10 = 185
        assertEquals(185.00, inv.getInvoiceTotal());
        // absolute amount left untouched
        assertEquals(25.0, inv.getBillDiscountAmount());
    }

    @Test
    void percentageBillDiscountIsDerivedWhenNoAbsoluteGiven() {
        SalesInvoice inv = new SalesInvoice();
        inv.setBillDiscount(10.0); // 10% — no absolute amount set

        service.finalizeInvoiceTotals(inv, 200.0, 10.0);

        // 10% of rounded subtotal 200 = 20 -> derived & stored
        assertEquals(20.00, inv.getBillDiscountAmount());
        // total = 200 - 20 + 10 = 190
        assertEquals(190.00, inv.getInvoiceTotal());
    }

    @Test
    void deliveryChargeAndRoundOffApplied() {
        SalesInvoice inv = new SalesInvoice();
        inv.setDeliveryCharge(15.0);
        inv.setRoundOff(-0.50);

        service.finalizeInvoiceTotals(inv, 200.0, 10.0);

        // total = 200 - 0 + 10 + 15 - 0.50 = 224.50
        assertEquals(224.50, inv.getInvoiceTotal());
    }

    @Test
    void nullMoneyFieldsTreatedAsZeroAndBalanceEqualsTotalWhenUnpaid() {
        SalesInvoice inv = new SalesInvoice();
        // amountPaid null, no discount/delivery/roundoff
        service.finalizeInvoiceTotals(inv, 50.0, 0.0);

        assertEquals(50.00, inv.getInvoiceTotal());
        assertEquals(50.00, inv.getBalance()); // unpaid -> full balance
    }

    @Test
    void exactFullPaymentLeavesZeroBalance() {
        SalesInvoice inv = new SalesInvoice();
        inv.setAmountPaid(210.0);

        service.finalizeInvoiceTotals(inv, 200.0, 10.0); // total 210

        assertEquals(0.00, inv.getBalance());
    }

    @Test
    void negativePaidIsRejected() {
        SalesInvoice inv = new SalesInvoice();
        inv.setAmountPaid(-1.0);
        assertThrows(ResponseStatusException.class,
                () -> service.finalizeInvoiceTotals(inv, 200.0, 10.0));
    }

    @Test
    void paidExceedingTotalIsRejected() {
        SalesInvoice inv = new SalesInvoice();
        inv.setAmountPaid(210.01); // total is 210.00, beyond the 0.0001 tolerance
        assertThrows(ResponseStatusException.class,
                () -> service.finalizeInvoiceTotals(inv, 200.0, 10.0));
    }

    @Test
    void paidWithinEpsilonToleranceIsAccepted() {
        SalesInvoice inv = new SalesInvoice();
        // total 210.00; paid 210.0 is within the +0.0001 tolerance (exactly equal here)
        inv.setAmountPaid(210.0);
        service.finalizeInvoiceTotals(inv, 200.0, 10.0); // must not throw
        assertEquals(0.00, inv.getBalance());
    }

    // ------------------------------------------------------------------
    // Build a SalesInvoiceService whose collaborators are all mocks. The
    // constructor is large; finalizeInvoiceTotals depends on none of them.
    // ------------------------------------------------------------------
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
                mock(com.billbull.backend.settings.branch.BranchAccessService.class),
                mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
                mock(com.billbull.backend.inventory.warehouse.BinRepository.class),
                mock(com.billbull.backend.inventory.batch.BatchSelectionService.class),
                mock(com.billbull.backend.sales.payment.PaymentService.class),
                mock(com.billbull.backend.notification.NotificationEventPublisher.class));
    }
}
