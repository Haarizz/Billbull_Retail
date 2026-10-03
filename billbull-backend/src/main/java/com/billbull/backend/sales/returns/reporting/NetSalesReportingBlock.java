package com.billbull.backend.sales.returns.reporting;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The returns-aware sales block that every report publishes under the same keys.
 *
 * <p>The problem this solves: the Back Office Sales Report defined
 * {@code Net Sales = Gross Sales - Returns} on a VAT-inclusive basis, while the POS X/Z reports
 * published {@code netSalesExTax = totalSales - totalTax} and never subtracted returns at all.
 * Comparing the two figures was meaningless — they differed both by the VAT and by the whole
 * day's returns — so a cashier reconciling a Z-Report against the Sales Report had no way to
 * tell a real discrepancy from the definition gap.
 *
 * <h2>The chosen basis</h2>
 *
 * <p><b>VAT-inclusive</b>, taken from the Sales Report's shipped contract rather than invented:
 * its Gross Sales is {@code Σ invoiceTotal} (VAT-inclusive) and its Net Sales card already
 * reads "after returns". {@code sales_returns.total_amount} is VAT-inclusive too, so the
 * subtraction is like-for-like with no conversion.
 *
 * <p>The ex-VAT figures are published alongside it, derived by netting the tax off <em>both</em>
 * sides ({@code (gross - salesTax) - (returnValue - returnTax)}), never by subtracting a
 * VAT-inclusive return from an ex-VAT sales figure.
 *
 * <p>{@code netSalesBasis} is published in the payload itself so a consumer — a React report, an
 * Excel export, a reconciliation test — can assert which basis it was handed instead of
 * assuming one.
 *
 * <h2>What this deliberately does not touch</h2>
 *
 * <p>The POS summary's existing {@code netSalesExTax} / {@code salesAmountExTax} /
 * {@code taxableSales} keys keep their current meaning: the taxable base <em>before</em>
 * returns, which is what the X-Report's VAT section needs and what the Day Close snapshot has
 * always stored. Redefining them in place would silently restate every historical Z-Report.
 * This block is additive and separately named.
 */
public record NetSalesReportingBlock(
        BigDecimal grossSales,
        BigDecimal returnValue,
        BigDecimal netSales,
        BigDecimal salesTax,
        BigDecimal returnTax,
        BigDecimal netTax,
        BigDecimal grossSalesExTax,
        BigDecimal returnValueExTax,
        BigDecimal netSalesExTax,
        int salesQuantity,
        int returnQuantity,
        int netQuantity,
        BigDecimal cashRefund,
        BigDecimal cardRefund,
        BigDecimal bankRefund,
        BigDecimal creditVoucherRefund,
        BigDecimal customerCredit) {

    /**
     * Builds the block from a report's own sales aggregation plus the shared return totals.
     *
     * @param grossSales   VAT-inclusive sales for the scope (Σ invoice total), before returns
     * @param salesTax     output VAT on those sales
     * @param salesQuantity units sold in the scope, before returns
     */
    public static NetSalesReportingBlock of(BigDecimal grossSales, BigDecimal salesTax,
                                            int salesQuantity, SalesReturnReportingTotals returns) {
        BigDecimal gross = nz(grossSales);
        BigDecimal tax = nz(salesTax);
        BigDecimal retValue = returns.value();
        BigDecimal retTax = returns.tax();

        BigDecimal grossExTax = gross.subtract(tax);
        BigDecimal retExTax = retValue.subtract(retTax);

        return new NetSalesReportingBlock(
                gross,
                retValue,
                gross.subtract(retValue),
                tax,
                retTax,
                tax.subtract(retTax),
                grossExTax,
                retExTax,
                grossExTax.subtract(retExTax),
                salesQuantity,
                returns.quantity(),
                salesQuantity - returns.quantity(),
                returns.cashRefund(),
                returns.cardRefund(),
                returns.bankRefund(),
                returns.creditVoucherRefund(),
                returns.customerCredit());
    }

    /**
     * The keys the POS X/Z report summaries publish. Named with an explicit {@code Reporting}
     * prefix on the three that would otherwise collide with existing POS summary keys carrying
     * a different meaning ({@code grossSales} is the POS line-gross pre-discount;
     * {@code netSalesExTax} is the pre-returns taxable base).
     */
    public Map<String, Object> toSummaryMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("netSalesBasis", SalesReturnReportingTotals.NET_SALES_BASIS);
        m.put("reportingGrossSales", grossSales);
        m.put("reportingReturnValue", returnValue);
        m.put("reportingNetSales", netSales);
        m.put("reportingSalesTax", salesTax);
        m.put("reportingReturnTax", returnTax);
        m.put("reportingNetTax", netTax);
        m.put("reportingGrossSalesExTax", grossSalesExTax);
        m.put("reportingReturnValueExTax", returnValueExTax);
        m.put("reportingNetSalesExTax", netSalesExTax);
        m.put("reportingSalesQuantity", salesQuantity);
        m.put("reportingReturnQuantity", returnQuantity);
        m.put("reportingNetQuantity", netQuantity);
        m.put("reportingCashRefund", cashRefund);
        m.put("reportingCardRefund", cardRefund);
        m.put("reportingBankRefund", bankRefund);
        m.put("reportingCreditVoucherRefund", creditVoucherRefund);
        m.put("reportingCustomerCredit", customerCredit);
        return m;
    }

    /**
     * Reads a block back out of a summary map that {@link #toSummaryMap()} wrote.
     *
     * <p>Exists so a persistence layer can copy the authoritative reporting figures into its
     * snapshot <em>without</em> recomputing any of them. Day Close used to be handed a loose
     * {@code Map<String, Object>} and would have had to pick keys out of it one at a time, which
     * is exactly where a second copy of {@code gross - returns - tax} tends to appear. There is
     * one implementation of that arithmetic — {@link #of} — and this is the typed way back to its
     * output.
     *
     * <p>Returns {@code null} when the map carries no reporting block at all (no
     * {@code reportingNetSales} key), so a caller can distinguish "not published" from "zero".
     *
     * @param summary a report summary map produced by {@link #toSummaryMap()}
     */
    public static NetSalesReportingBlock fromSummaryMap(Map<String, ?> summary) {
        if (summary == null || summary.get("reportingNetSales") == null) {
            return null;
        }
        return new NetSalesReportingBlock(
                dec(summary, "reportingGrossSales"),
                dec(summary, "reportingReturnValue"),
                dec(summary, "reportingNetSales"),
                dec(summary, "reportingSalesTax"),
                dec(summary, "reportingReturnTax"),
                dec(summary, "reportingNetTax"),
                dec(summary, "reportingGrossSalesExTax"),
                dec(summary, "reportingReturnValueExTax"),
                dec(summary, "reportingNetSalesExTax"),
                integer(summary, "reportingSalesQuantity"),
                integer(summary, "reportingReturnQuantity"),
                integer(summary, "reportingNetQuantity"),
                dec(summary, "reportingCashRefund"),
                dec(summary, "reportingCardRefund"),
                dec(summary, "reportingBankRefund"),
                dec(summary, "reportingCreditVoucherRefund"),
                dec(summary, "reportingCustomerCredit"));
    }

    /** The basis these figures were computed on, for a consumer that stores it alongside them. */
    public String basis() {
        return SalesReturnReportingTotals.NET_SALES_BASIS;
    }

    private static BigDecimal dec(Map<String, ?> m, String key) {
        Object v = m.get(key);
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal b) return b;
        // A map round-tripped through JSON hands back Integer/Double/Long rather than BigDecimal.
        return new BigDecimal(v.toString());
    }

    private static int integer(Map<String, ?> m, String key) {
        Object v = m.get(key);
        if (v == null) return 0;
        if (v instanceof Number n) return n.intValue();
        return Integer.parseInt(v.toString());
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
