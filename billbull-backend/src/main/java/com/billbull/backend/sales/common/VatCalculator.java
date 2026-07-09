package com.billbull.backend.sales.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Single source of truth for line-level VAT math across all sales documents
 * (Sales Invoice, POS, Proforma, ...). Mirrors the frontend's
 * {@code computeLineTaxTotals} in {@code src/utils/vatMath.js} so the same
 * document produces identical Taxable/VAT/Total figures everywhere.
 *
 * EXCLUSIVE: price excludes VAT — tax is added on top of the discounted value.
 * INCLUSIVE: price already includes VAT — tax is extracted out of the
 * discounted (still VAT-laden) value; the discounted value itself is the total.
 */
public final class VatCalculator {

    private VatCalculator() {
    }

    public static final class LineResult {
        public final BigDecimal grossAmount;
        public final BigDecimal discountAmount;
        public final BigDecimal taxableAmount;
        public final BigDecimal taxAmount;
        public final BigDecimal netAmount;

        LineResult(BigDecimal grossAmount, BigDecimal discountAmount, BigDecimal taxableAmount,
                BigDecimal taxAmount, BigDecimal netAmount) {
            this.grossAmount = grossAmount;
            this.discountAmount = discountAmount;
            this.taxableAmount = taxableAmount;
            this.taxAmount = taxAmount;
            this.netAmount = netAmount;
        }
    }

    /**
     * @param qty              line quantity
     * @param price            unit price (VAT-inclusive when {@code taxInclusive} is true)
     * @param discountPercent  line discount, as a percentage (0-100)
     * @param footerDiscount   absolute footer/bill discount amount already allocated to this line
     * @param taxPercent       VAT rate, as a percentage (0-100)
     * @param taxInclusive     true when {@code price} already includes VAT
     */
    public static LineResult compute(BigDecimal qty, BigDecimal price, BigDecimal discountPercent,
            BigDecimal footerDiscount, BigDecimal taxPercent, boolean taxInclusive) {
        BigDecimal q = nz(qty);
        BigDecimal p = nz(price);
        BigDecimal discPct = nz(discountPercent);
        BigDecimal footerDisc = nz(footerDiscount);
        BigDecimal taxPct = nz(taxPercent);

        BigDecimal gross = q.multiply(p);
        BigDecimal discountAmount = gross.multiply(discPct).divide(BigDecimal.valueOf(100));
        // Discounted line value: still VAT-laden when taxInclusive, already ex-VAT otherwise.
        BigDecimal discountedValue = gross.subtract(discountAmount).subtract(footerDisc).max(BigDecimal.ZERO);

        BigDecimal taxableAmount;
        BigDecimal taxAmount;
        BigDecimal netAmount;
        if (taxInclusive) {
            // Price already includes VAT: the discounted line value IS the
            // customer-paid (gross-of-VAT) total. Extract the embedded tax so
            // taxableAmount is genuinely ex-VAT (netAmount - taxAmount == taxableAmount).
            BigDecimal divisor = BigDecimal.valueOf(100).add(taxPct);
            taxableAmount = divisor.signum() == 0 ? discountedValue
                    : discountedValue.multiply(BigDecimal.valueOf(100)).divide(divisor, 6, RoundingMode.HALF_UP);
            taxAmount = discountedValue.subtract(taxableAmount);
            netAmount = discountedValue;
        } else {
            // Price is net of VAT: tax is added on top of the discounted value.
            taxableAmount = discountedValue;
            taxAmount = taxableAmount.multiply(taxPct).divide(BigDecimal.valueOf(100));
            netAmount = taxableAmount.add(taxAmount);
        }

        return new LineResult(gross, discountAmount, taxableAmount, taxAmount, netAmount);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
