package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/**
 * Characterization tests for {@link SalesInvoiceService#finalizeInvoiceTotals}, the
 * pure invoice-header money math (subtotal/tax rounding, bill discount absolute vs
 * percentage, delivery + round-off, invoice total, outstanding balance, and the
 * amount-paid guards).
 *
 * <p>Purpose: pin the behaviour so the {@code Double -> BigDecimal} conversion of the
 * Sales domain is provably behaviour-preserving. Every figure asserted here is exactly
 * representable in both {@code double} and {@code BigDecimal}; the suite was run green
 * against the pre-conversion {@code double} code first, then again after the type flip.
 * The branching cases (null fields, absolute-vs-percentage discount selection, the
 * negative-paid and paid-exceeds-total guards) are the real safety net. Money is asserted
 * by {@link BigDecimal#compareTo} (scale-independent) via {@link #assertMoney}.
 *
 * <p>One intended behaviour change: the old {@code double} guard tolerated paid up to
 * {@code total + 0.0001}; with {@code BigDecimal} the compare is exact, so any amount
 * strictly greater than the total is rejected (see {@link #paidExactlyEqualToTotalIsAccepted}
 * and {@link #paidExceedingTotalIsRejected}).
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
        inv.setAmountPaid(bd("100.0"));

        // raw subtotal 200.00, tax 10.00 -> total 210.00, paid 100 -> balance 110.00
        service.finalizeInvoiceTotals(inv, bd("200.0"), bd("10.0"));

        assertMoney("200.00", inv.getSubTotal());
        assertMoney("10.00", inv.getTaxTotal());
        assertMoney("210.00", inv.getInvoiceTotal());
        assertMoney("110.00", inv.getBalance());
    }

    @Test
    void roundsHalfUpToTwoDecimals() {
        SalesInvoice inv = new SalesInvoice();
        // 100.005 rounds HALF_UP to 100.01; tax 0.004 rounds to 0.00
        service.finalizeInvoiceTotals(inv, bd("100.005"), bd("0.004"));
        assertMoney("100.01", inv.getSubTotal());
        assertMoney("0.00", inv.getTaxTotal());
        // total = 100.01 - 0 + 0.00 + 0 + 0 = 100.01
        assertMoney("100.01", inv.getInvoiceTotal());
    }

    @Test
    void absoluteBillDiscountIsSubtractedFromTotal() {
        SalesInvoice inv = new SalesInvoice();
        inv.setBillDiscountAmount(bd("25.0")); // absolute discount provided

        service.finalizeInvoiceTotals(inv, bd("200.0"), bd("10.0"));

        // total = 200 - 25 + 10 = 185
        assertMoney("185.00", inv.getInvoiceTotal());
        // absolute amount left untouched
        assertMoney("25.0", inv.getBillDiscountAmount());
    }

    @Test
    void percentageBillDiscountIsDerivedWhenNoAbsoluteGiven() {
        SalesInvoice inv = new SalesInvoice();
        inv.setBillDiscount(10.0); // 10% — no absolute amount set (rate stays Double)

        service.finalizeInvoiceTotals(inv, bd("200.0"), bd("10.0"));

        // 10% of rounded subtotal 200 = 20 -> derived & stored
        assertMoney("20.00", inv.getBillDiscountAmount());
        // total = 200 - 20 + 10 = 190
        assertMoney("190.00", inv.getInvoiceTotal());
    }

    @Test
    void deliveryChargeAndRoundOffApplied() {
        SalesInvoice inv = new SalesInvoice();
        inv.setDeliveryCharge(bd("15.0"));
        inv.setRoundOff(bd("-0.50"));

        service.finalizeInvoiceTotals(inv, bd("200.0"), bd("10.0"));

        // total = 200 - 0 + 10 + 15 - 0.50 = 224.50
        assertMoney("224.50", inv.getInvoiceTotal());
    }

    @Test
    void nullMoneyFieldsTreatedAsZeroAndBalanceEqualsTotalWhenUnpaid() {
        SalesInvoice inv = new SalesInvoice();
        // amountPaid null, no discount/delivery/roundoff
        service.finalizeInvoiceTotals(inv, bd("50.0"), bd("0.0"));

        assertMoney("50.00", inv.getInvoiceTotal());
        assertMoney("50.00", inv.getBalance()); // unpaid -> full balance
    }

    @Test
    void exactFullPaymentLeavesZeroBalance() {
        SalesInvoice inv = new SalesInvoice();
        inv.setAmountPaid(bd("210.0"));

        service.finalizeInvoiceTotals(inv, bd("200.0"), bd("10.0")); // total 210

        assertMoney("0.00", inv.getBalance());
    }

    @Test
    void negativePaidIsRejected() {
        SalesInvoice inv = new SalesInvoice();
        inv.setAmountPaid(bd("-1.0"));
        assertThrows(ResponseStatusException.class,
                () -> service.finalizeInvoiceTotals(inv, bd("200.0"), bd("10.0")));
    }

    @Test
    void paidExceedingTotalIsRejected() {
        SalesInvoice inv = new SalesInvoice();
        inv.setAmountPaid(bd("210.01")); // total is 210.00 — exact compare rejects any excess
        assertThrows(ResponseStatusException.class,
                () -> service.finalizeInvoiceTotals(inv, bd("200.0"), bd("10.0")));
    }

    @Test
    void paidExactlyEqualToTotalIsAccepted() {
        SalesInvoice inv = new SalesInvoice();
        // total 210.00; paid exactly 210.00 is accepted (compareTo == 0, not > 0)
        inv.setAmountPaid(bd("210.0"));
        service.finalizeInvoiceTotals(inv, bd("200.0"), bd("10.0")); // must not throw
        assertMoney("0.00", inv.getBalance());
    }

    // ----- helpers -----

    private static BigDecimal bd(String v) { return new BigDecimal(v); }

    /** Assert a money value by numeric value (scale-independent): 210 == 210.00. */
    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
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
                mock(com.billbull.backend.settings.branch.BranchRepository.class),
                mock(com.billbull.backend.settings.branch.BranchAccessService.class),
                mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
                mock(com.billbull.backend.inventory.warehouse.BinRepository.class),
                mock(com.billbull.backend.inventory.batch.BatchSelectionService.class),
                mock(com.billbull.backend.sales.payment.PaymentService.class),
                mock(com.billbull.backend.notification.NotificationEventPublisher.class),
                mock(com.billbull.backend.pos.dayclose.PosDayCloseRepository.class),
                mock(com.billbull.backend.sales.advance.AdvanceApplicationService.class),
                mock(com.billbull.backend.sales.invoice.history.SalesInvoiceHistoryService.class));
    }
}
