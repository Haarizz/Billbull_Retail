package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.common.VatMode;

/** The per-line footer share that sales returns reverse. */
class InvoiceFooterDiscountSharesTest {

    @Test
    void storedSharesAreUsedAsIs() {
        SalesInvoice inv = SalesInvoiceFooterDiscountTest.screenshotInvoice("amount", 0d, "100", VatMode.EXCLUSIVE);
        inv.getItems().get(0).setFooterDiscount(new BigDecimal("93.96"));
        inv.getItems().get(1).setFooterDiscount(new BigDecimal("6.04"));

        Map<SalesInvoiceItem, BigDecimal> shares = InvoiceFooterDiscountShares.of(inv);

        assertMoney("93.96", shares.get(inv.getItems().get(0)));
        assertMoney("6.04", shares.get(inv.getItems().get(1)));
    }

    @Test
    void headerOnlyDiscountIsApportionedForOlderAndPosInvoices() {
        // POS-style invoice: AED 100 bill discount on the header, no line shares stored.
        SalesInvoice inv = SalesInvoiceFooterDiscountTest.screenshotInvoice("amount", 0d, "100", VatMode.EXCLUSIVE);
        inv.setSalesType(SalesType.POS_SALE);

        Map<SalesInvoiceItem, BigDecimal> shares = InvoiceFooterDiscountShares.of(inv);

        assertMoney("93.96", shares.get(inv.getItems().get(0)));
        assertMoney("6.04", shares.get(inv.getItems().get(1)));
        // Nothing is written back to the historical document.
        assertEquals(null, inv.getItems().get(0).getFooterDiscount());
    }

    @Test
    void noDiscountMeansZeroShares() {
        SalesInvoice inv = new SalesInvoice();
        inv.setItems(new ArrayList<>(List.of(SalesInvoiceFooterDiscountTest.line(1, "10", 0d, 5d))));

        assertMoney("0", InvoiceFooterDiscountShares.of(inv).get(inv.getItems().get(0)));
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
