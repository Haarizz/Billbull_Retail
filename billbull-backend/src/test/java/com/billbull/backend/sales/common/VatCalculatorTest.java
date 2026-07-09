package com.billbull.backend.sales.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/**
 * Characterization tests for the single shared VAT helper used by
 * SalesInvoiceService, ProformaService, and (via vatMath.js) every
 * frontend sales document. Exercises the exact scenario reported as a bug:
 * Qty 12 x 40.00 @ 5% VAT Inclusive must not double-count VAT.
 */
class VatCalculatorTest {

    @Test
    void inclusiveDoesNotDoubleCountVat() {
        // Qty 12 x 40.00, 5% VAT inclusive -> Gross 480.00
        VatCalculator.LineResult result = VatCalculator.compute(
                BigDecimal.valueOf(12), new BigDecimal("40.00"), BigDecimal.ZERO,
                BigDecimal.ZERO, new BigDecimal("5"), true);

        assertMoney("480.00", result.grossAmount);
        assertMoney("457.14", result.taxableAmount.setScale(2, java.math.RoundingMode.HALF_UP));
        assertMoney("22.86", result.taxAmount.setScale(2, java.math.RoundingMode.HALF_UP));
        // Total must equal the gross amount, never gross + VAT again.
        assertMoney("480.00", result.netAmount.setScale(2, java.math.RoundingMode.HALF_UP));
    }

    @Test
    void exclusiveAddsVatOnTop() {
        // Qty 12 x 40.00, 5% VAT exclusive -> tax is added on top of 480.00
        VatCalculator.LineResult result = VatCalculator.compute(
                BigDecimal.valueOf(12), new BigDecimal("40.00"), BigDecimal.ZERO,
                BigDecimal.ZERO, new BigDecimal("5"), false);

        assertMoney("480.00", result.grossAmount);
        assertMoney("480.00", result.taxableAmount);
        assertMoney("24.00", result.taxAmount);
        assertMoney("504.00", result.netAmount);
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
