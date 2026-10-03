package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.common.VatMode;

/**
 * Server-side footer-discount allocation on the Sales Invoice
 * (docs/footer-discount-audit-2026-10-01.md). The screenshot invoice is the regression fixture:
 * 1 × 3,500 @ 20% disc, 5% VAT and 1 × 200 @ 10% disc, 20% VAT, footer AED 100.
 */
class SalesInvoiceFooterDiscountTest {

    private final SalesInvoiceService service = SalesInvoiceItemTaxTest.newServiceWithMockedDeps();

    @Test
    void screenshotInvoiceExclusiveAllocatesAndReconciles() {
        SalesInvoice invoice = screenshotInvoice("amount", 0d, "100", VatMode.EXCLUSIVE);

        var result = service.applyFooterDiscountAllocation(invoice, null);
        service.finalizeInvoiceTotals(invoice, result.subTotal(), result.taxTotal());

        SalesInvoiceItem a = invoice.getItems().get(0);
        SalesInvoiceItem b = invoice.getItems().get(1);
        assertMoney("93.96", a.getFooterDiscount());
        assertMoney("6.04", b.getFooterDiscount());
        assertMoney("2706.04", a.getTaxableAmount());
        assertMoney("173.96", b.getTaxableAmount());
        assertMoney("135.30", a.getTaxAmount());
        assertMoney("34.79", b.getTaxAmount());
        assertMoney("2841.34", a.getNetAmount());
        assertMoney("208.75", b.getNetAmount());
        assertMoney("3500.00", a.getGrossAmount());

        assertMoney("100.00", invoice.getBillDiscountAmount());
        assertEquals("amount", invoice.getBillDiscountType());
        assertMoney("2980.00", invoice.getSubTotal());
        assertMoney("170.09", invoice.getTaxTotal());
        assertMoney("3050.09", invoice.getInvoiceTotal());
        assertHeaderEqualsSumOfLines(invoice);
    }

    @Test
    void screenshotInvoiceInclusiveTreatsFixedAmountAsCustomerFacing() {
        SalesInvoice invoice = screenshotInvoice("amount", 0d, "100", VatMode.INCLUSIVE);

        var result = service.applyFooterDiscountAllocation(invoice, null);
        service.finalizeInvoiceTotals(invoice, result.subTotal(), result.taxTotal());

        // 2,800 + 180 VAT-inclusive, minus AED 100 => the customer pays exactly 2,880.00.
        assertMoney("2880.00", invoice.getInvoiceTotal());
        assertMoney("157.85", invoice.getTaxTotal());
        assertMoney("128.86", invoice.getItems().get(0).getTaxAmount());
        assertMoney("28.99", invoice.getItems().get(1).getTaxAmount());
        assertTrue(invoice.getTaxInclusive(), "vatMode INCLUSIVE must also set taxInclusive");
        assertHeaderEqualsSumOfLines(invoice);
    }

    @Test
    void percentFooterDiscountIsAllocatedFromThePercentage() {
        SalesInvoice invoice = screenshotInvoice("percent", 10d, null, VatMode.EXCLUSIVE);

        var result = service.applyFooterDiscountAllocation(invoice, null);
        service.finalizeInvoiceTotals(invoice, result.subTotal(), result.taxTotal());

        assertMoney("298.00", invoice.getBillDiscountAmount());
        assertEquals(10d, invoice.getBillDiscount());
        assertMoney("280.00", invoice.getItems().get(0).getFooterDiscount());
        assertMoney("18.00", invoice.getItems().get(1).getFooterDiscount());
        assertMoney("2840.40", invoice.getInvoiceTotal());
        assertHeaderEqualsSumOfLines(invoice);
    }

    @Test
    void clientSuppliedLineMoneyIsIgnored() {
        SalesInvoice invoice = screenshotInvoice("amount", 0d, "100", VatMode.EXCLUSIVE);
        // A stale/hostile client: doubled footer shares and arbitrary totals.
        for (SalesInvoiceItem it : invoice.getItems()) {
            it.setFooterDiscount(new BigDecimal("999"));
            it.setTaxAmount(new BigDecimal("1"));
            it.setNetAmount(new BigDecimal("1"));
        }

        service.applyFooterDiscountAllocation(invoice, null);

        assertMoney("93.96", invoice.getItems().get(0).getFooterDiscount());
        assertMoney("2841.34", invoice.getItems().get(0).getNetAmount());
    }

    @Test
    void typedFixedAmountWinsOverTheMoneyEcho() {
        SalesInvoice invoice = screenshotInvoice("amount", 0d, "40", VatMode.EXCLUSIVE);
        invoice.setBillDiscountFixed(new BigDecimal("100"));

        service.applyFooterDiscountAllocation(invoice, null);

        assertMoney("100.00", invoice.getBillDiscountAmount());
    }

    @Test
    void untypedAmountFromAnOlderClientIsTreatedAsAmount() {
        SalesInvoice invoice = screenshotInvoice(null, 0d, "100", VatMode.EXCLUSIVE);

        service.applyFooterDiscountAllocation(invoice, null);

        assertEquals("amount", invoice.getBillDiscountType());
        assertMoney("100.00", invoice.getBillDiscountAmount());
    }

    @Test
    void savingTheServerResultAgainIsStable() {
        // Save -> reload -> save must not move a cent (the old double-discount defect).
        SalesInvoice invoice = screenshotInvoice("amount", 0d, "100", VatMode.EXCLUSIVE);
        var first = service.applyFooterDiscountAllocation(invoice, null);
        service.finalizeInvoiceTotals(invoice, first.subTotal(), first.taxTotal());
        BigDecimal total = invoice.getInvoiceTotal();

        var second = service.applyFooterDiscountAllocation(invoice, null);
        service.finalizeInvoiceTotals(invoice, second.subTotal(), second.taxTotal());

        assertMoney(total.toPlainString(), invoice.getInvoiceTotal());
        assertMoney("93.96", invoice.getItems().get(0).getFooterDiscount());
    }

    @Test
    void voidedLineTakesNoShare() {
        SalesInvoice invoice = screenshotInvoice("amount", 0d, "100", VatMode.EXCLUSIVE);
        SalesInvoiceItem voided = line(1, "500", 0d, 5d);
        voided.setVoided(true);
        invoice.getItems().add(voided);

        var result = service.applyFooterDiscountAllocation(invoice, null);
        service.finalizeInvoiceTotals(invoice, result.subTotal(), result.taxTotal());

        assertMoney("0.00", voided.getFooterDiscount());
        assertMoney("3050.09", invoice.getInvoiceTotal());
    }

    @Test
    void zeroRatedLineStaysZeroRated() {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setBillDiscountType("amount");
        invoice.setBillDiscountAmount(new BigDecimal("10"));
        invoice.setItems(new ArrayList<>(List.of(line(1, "100", 0d, 0d), line(1, "100", 0d, 5d))));

        service.applyFooterDiscountAllocation(invoice, null);

        assertMoney("0.00", invoice.getItems().get(0).getTaxAmount());
        assertMoney("95.00", invoice.getItems().get(0).getNetAmount());
        assertMoney("4.75", invoice.getItems().get(1).getTaxAmount());
    }

    @Test
    void allocationRunsOnlyForNewAndDraftNonPosInvoices() {
        SalesInvoice incoming = new SalesInvoice();
        assertTrue(SalesInvoiceService.shouldAllocateFooterDiscount(incoming, null));

        SalesInvoice draft = new SalesInvoice();
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        assertTrue(SalesInvoiceService.shouldAllocateFooterDiscount(incoming, draft));

        SalesInvoice confirmed = new SalesInvoice();
        confirmed.setStatus(SalesInvoiceStatus.CONFIRMED);
        assertFalse(SalesInvoiceService.shouldAllocateFooterDiscount(incoming, confirmed),
                "finalized invoices keep their stored values");

        SalesInvoice pos = new SalesInvoice();
        pos.setSalesType(SalesType.POS_SALE);
        assertFalse(SalesInvoiceService.shouldAllocateFooterDiscount(pos, null),
                "POS keeps its header-only bill discount until the POS phase");
    }

    // ----- helpers -----

    static SalesInvoice screenshotInvoice(String type, Double percent, String amount, VatMode mode) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setVatMode(mode);
        invoice.setBillDiscountType(type);
        invoice.setBillDiscount(percent);
        invoice.setBillDiscountAmount(amount != null ? new BigDecimal(amount) : null);
        invoice.setItems(new ArrayList<>(List.of(line(1, "3500", 20d, 5d), line(1, "200", 10d, 20d))));
        return invoice;
    }

    static SalesInvoiceItem line(int qty, String price, double discPct, double taxPct) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setQuantity(qty);
        item.setPrice(new BigDecimal(price));
        item.setDiscount(discPct);
        item.setTaxRate(taxPct);
        return item;
    }

    private static void assertHeaderEqualsSumOfLines(SalesInvoice invoice) {
        BigDecimal shares = BigDecimal.ZERO;
        BigDecimal totals = BigDecimal.ZERO;
        for (SalesInvoiceItem it : invoice.getItems()) {
            if (it.isVoided()) continue;
            shares = shares.add(it.getFooterDiscount());
            totals = totals.add(it.getNetAmount());
            assertMoney(it.getNetAmount().toPlainString(), it.getTaxableAmount().add(it.getTaxAmount()));
        }
        assertMoney(invoice.getBillDiscountAmount().toPlainString(), shares);
        assertMoney(invoice.getInvoiceTotal().toPlainString(), totals);
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
