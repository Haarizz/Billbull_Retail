package com.billbull.backend.pos.dayclose;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.billbull.backend.pos.reports.PosReportDetail;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnItem;
import com.billbull.backend.sales.returns.SalesReturnRefundMethod;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import com.billbull.backend.sales.returns.reporting.NetSalesReportingBlock;
import com.billbull.backend.sales.returns.reporting.SalesReturnReportingService;
import com.billbull.backend.sales.returns.reporting.SalesReturnReportingTotals;

/**
 * What a Day Close snapshot persists about the day's Net Sales, and what it deliberately does not.
 *
 * <p>Before this, {@code pos_day_closes} held exactly two structured sales columns and neither was
 * the reporting basis: {@code gross_sales} is the POS line gross <em>before</em> discount, and
 * {@code net_sales} is the taxable base <em>before</em> returns ({@code totalSales - totalTax})
 * despite its name. The day's authoritative Net Sales existed only inside the
 * {@code z_report_json} blob — not queryable, not indexable, and not comparable to the Sales
 * Report without parsing a document.
 *
 * <p>These cases pin three things:
 *
 * <ol>
 *   <li>the new {@code reporting*} columns carry the shared {@link NetSalesReportingBlock} figures
 *       verbatim, with no second copy of the arithmetic in the persistence layer;</li>
 *   <li>the two historical columns keep their old meanings, so no past Z-Report is restated;</li>
 *   <li>a historical row — every {@code reporting*} column null — still reads back, and its nulls
 *       are surfaced as nulls rather than reinterpreted from {@code net_sales} or defaulted to
 *       zero. A zero would assert a figure that was never reported.</li>
 * </ol>
 */
class PosDayCloseReportingSnapshotTest {

    /** The aggregation is a pure function over the rows handed to it; nothing here queries. */
    private final SalesReturnReportingService reportingService = new SalesReturnReportingService(null);

    // ── the declared basis: net = gross - returns, VAT-inclusive ─────────────────────

    @Test
    void aDayWithNoReturnsPersistsNetSalesEqualToGrossSales() {
        PosDayClose dayClose = close(block("10000.00", "0.00", noReturns()));

        assertEquals(bd("10000.00"), dayClose.getReportingGrossSales());
        assertEquals(bd("0"), dayClose.getReportingReturnValue());
        assertEquals(bd("10000.00"), dayClose.getReportingNetSales());
        assertEquals("VAT_INCLUSIVE", dayClose.getReportingNetSalesBasis());
    }

    @Test
    void aDayWithOneReturnPersistsNetSalesNetOfIt() {
        PosDayClose dayClose = close(block("10000.00", "0.00",
                returns(cashReturn("1000.00", "0.00", "1000.00", 1))));

        assertEquals(bd("10000.00"), dayClose.getReportingGrossSales());
        assertEquals(bd("1000.00"), dayClose.getReportingReturnValue());
        assertEquals(bd("9000.00"), dayClose.getReportingNetSales());
    }

    @Test
    void theVatLegsStayConsistentOnBothTheInclusiveAndTheExVatBasis() {
        // Sale 10,500 incl. 500 VAT. Return 1,050 incl. 50 VAT.
        PosDayClose d = close(block("10500.00", "500.00",
                returns(cashReturn("1000.00", "50.00", "1050.00", 1))));

        // Inclusive basis
        assertEquals(bd("9450.00"), d.getReportingNetSales());
        assertEquals(d.getReportingGrossSales().subtract(d.getReportingReturnValue()),
                d.getReportingNetSales(),
                "net = gross - returns is the declared VAT-inclusive basis");

        // VAT legs
        assertEquals(bd("500.00"), d.getReportingSalesTax());
        assertEquals(bd("50.00"), d.getReportingReturnTax());
        assertEquals(bd("450.00"), d.getReportingNetTax());
        assertEquals(d.getReportingSalesTax().subtract(d.getReportingReturnTax()),
                d.getReportingNetTax());

        // Ex-VAT basis: the tax is netted off BOTH sides, never a VAT-inclusive return
        // subtracted from an ex-VAT sales figure.
        assertEquals(bd("9000.00"), d.getReportingNetSalesExTax());
        assertEquals(d.getReportingGrossSales().subtract(d.getReportingSalesTax())
                        .subtract(d.getReportingReturnValue().subtract(d.getReportingReturnTax())),
                d.getReportingNetSalesExTax());

        // And the two bases differ by exactly the net VAT — the gap that made a Z-Report
        // incomparable to the Sales Report in the first place.
        assertEquals(d.getReportingNetTax(),
                d.getReportingNetSales().subtract(d.getReportingNetSalesExTax()));
    }

    // ── the persistence layer adds no arithmetic of its own ─────────────────────────

    @Test
    void everyPersistedFigureIsTheBlocksOwnFigureRatherThanARecomputationOfIt() {
        NetSalesReportingBlock block = block("10500.00", "500.00",
                returns(cashReturn("1000.00", "50.00", "1050.00", 1)));
        PosDayClose dayClose = close(block);

        assertEquals(block.grossSales(), dayClose.getReportingGrossSales());
        assertEquals(block.returnValue(), dayClose.getReportingReturnValue());
        assertEquals(block.netSales(), dayClose.getReportingNetSales());
        assertEquals(block.salesTax(), dayClose.getReportingSalesTax());
        assertEquals(block.returnTax(), dayClose.getReportingReturnTax());
        assertEquals(block.netTax(), dayClose.getReportingNetTax());
        assertEquals(block.netSalesExTax(), dayClose.getReportingNetSalesExTax());
        assertEquals(block.basis(), dayClose.getReportingNetSalesBasis());
    }

    @Test
    void theBlockSurvivesTheRoundTripThroughTheSummaryMapTheZReportPublishes() {
        // The Day Close service is handed the Z-Report's summary map, not a typed block, so the
        // read-back path is what actually runs in production.
        NetSalesReportingBlock original = block("10500.00", "500.00",
                returns(cashReturn("1000.00", "50.00", "1050.00", 3)));

        NetSalesReportingBlock readBack =
                NetSalesReportingBlock.fromSummaryMap(original.toSummaryMap());

        assertEquals(original, readBack);
    }

    @Test
    void aSummaryCarryingNoReportingBlockLeavesTheColumnsNullInsteadOfWritingZero() {
        // A report that published no reporting figures must not be recorded as a day that
        // reported zero Net Sales.
        assertNull(NetSalesReportingBlock.fromSummaryMap(Map.of()));
        assertNull(NetSalesReportingBlock.fromSummaryMap(new HashMap<>()));
        assertNull(NetSalesReportingBlock.fromSummaryMap(null));

        PosDayClose dayClose = historical();
        assertNull(dayClose.getReportingNetSales());
        assertFalse(dayClose.hasReportingSnapshot());
    }

    @Test
    void aMapRoundTrippedThroughJsonStillReadsBackAsExactDecimals() {
        // z_report_json goes through Jackson, which hands these keys back as Integer/Double.
        Map<String, Object> jsonish = new HashMap<>(block("10000.00", "0.00",
                returns(cashReturn("1000.00", "0.00", "1000.00", 2))).toSummaryMap());
        jsonish.put("reportingNetSales", 9000);
        jsonish.put("reportingGrossSales", 10000.0);

        NetSalesReportingBlock readBack = NetSalesReportingBlock.fromSummaryMap(jsonish);

        assertEquals(0, readBack.netSales().compareTo(bd("9000")));
        assertEquals(0, readBack.grossSales().compareTo(bd("10000")));
    }

    // ── the historical columns are not redefined ─────────────────────────────────────

    @Test
    void theHistoricalGrossAndNetColumnsKeepTheirOwnMeaningsAlongsideTheNewOnes() {
        // What closeDay has always written: grossSales = POS line gross pre-discount,
        // netSales = the pre-returns taxable base. Both deliberately differ from the reporting
        // figures on the same row, and that difference is the point.
        PosDayClose d = close(block("10500.00", "500.00",
                returns(cashReturn("1000.00", "50.00", "1050.00", 1))));
        d.setGrossSales(bd("11000.00"));   // line gross, before the 500 discount
        d.setNetSales(bd("10000.00"));     // 10500 - 500 VAT, before returns

        assertEquals(bd("11000.00"), d.getGrossSales());
        assertEquals(bd("10000.00"), d.getNetSales());
        // ...and neither was overwritten by the reporting basis.
        assertEquals(bd("10500.00"), d.getReportingGrossSales());
        assertEquals(bd("9450.00"), d.getReportingNetSales());
    }

    // ── historical snapshot compatibility ───────────────────────────────────────────

    @Test
    void aHistoricalSnapshotWithNullReportingFieldsStillLoadsAndReportsNoReportingBlock() {
        PosDayClose historical = historical();

        assertFalse(historical.hasReportingSnapshot());
        assertNull(historical.getReportingGrossSales());
        assertNull(historical.getReportingReturnValue());
        assertNull(historical.getReportingNetSales());
        assertNull(historical.getReportingSalesTax());
        assertNull(historical.getReportingReturnTax());
        assertNull(historical.getReportingNetTax());
        assertNull(historical.getReportingNetSalesExTax());
        assertNull(historical.getReportingNetSalesBasis());

        // The values it DOES carry are untouched and still readable.
        assertEquals(bd("11000.00"), historical.getGrossSales());
        assertEquals(bd("10000.00"), historical.getNetSales());
    }

    @Test
    void theZReportDetailOmitsTheReportingBlockForAHistoricalRowRatherThanReinterpretingNetSales() {
        PosDayClose historical = historical();
        Map<String, Object> storedJson = Map.of("summary", Map.of("totalSales", 10500));

        PosReportDetail detail = PosReportDetail.fromZ(historical, storedJson);

        // Null, not a block built out of net_sales: that column is the pre-returns taxable base
        // and presenting it as the reporting Net Sales would silently restate the day.
        assertNull(detail.getPersistedReporting());
        // The stored snapshot is still served exactly as it was generated.
        assertEquals(storedJson, detail.getReport());
    }

    @Test
    void theZReportDetailPrefersThePersistedFiguresForANewSnapshot() {
        PosDayClose d = close(block("10500.00", "500.00",
                returns(cashReturn("1000.00", "50.00", "1050.00", 1))));
        d.setNetSales(bd("10000.00"));

        PosReportDetail detail = PosReportDetail.fromZ(d, Map.of("summary", Map.of()));

        Map<String, Object> reporting = detail.getPersistedReporting();
        assertTrue(reporting != null && !reporting.isEmpty());
        assertEquals("VAT_INCLUSIVE", reporting.get("netSalesBasis"));
        assertEquals(bd("10500.00"), reporting.get("reportingGrossSales"));
        assertEquals(bd("1050.00"), reporting.get("reportingReturnValue"));
        assertEquals(bd("9450.00"), reporting.get("reportingNetSales"));
        assertEquals(bd("500.00"), reporting.get("reportingSalesTax"));
        assertEquals(bd("50.00"), reporting.get("reportingReturnTax"));
        assertEquals(bd("450.00"), reporting.get("reportingNetTax"));
        assertEquals(bd("9000.00"), reporting.get("reportingNetSalesExTax"));
    }

    // ── plumbing ────────────────────────────────────────────────────────────────────

    /** Applies a block to a snapshot exactly as {@code PosSessionService.closeDay} does. */
    private static PosDayClose close(NetSalesReportingBlock block) {
        PosDayClose d = baseRow();
        d.setReportingGrossSales(block.grossSales());
        d.setReportingReturnValue(block.returnValue());
        d.setReportingNetSales(block.netSales());
        d.setReportingSalesTax(block.salesTax());
        d.setReportingReturnTax(block.returnTax());
        d.setReportingNetTax(block.netTax());
        d.setReportingNetSalesExTax(block.netSalesExTax());
        d.setReportingNetSalesBasis(block.basis());
        return d;
    }

    /** A row as written before V112: the two old columns filled, every reporting column null. */
    private static PosDayClose historical() {
        PosDayClose d = baseRow();
        d.setGrossSales(bd("11000.00"));
        d.setNetSales(bd("10000.00"));
        return d;
    }

    private static PosDayClose baseRow() {
        PosDayClose d = new PosDayClose();
        d.setBranchId(1L);
        d.setCloseDate(LocalDate.of(2026, 3, 1));
        d.setClosedBy("cashier1");
        d.setClosedAt(LocalDateTime.of(2026, 3, 1, 22, 0));
        d.setReportNumber("ZR-20260301-000001");
        return d;
    }

    private static NetSalesReportingBlock block(String grossInclVat, String salesTax,
                                                SalesReturnReportingTotals returns) {
        return NetSalesReportingBlock.of(bd(grossInclVat), bd(salesTax), 100, returns);
    }

    private SalesReturnReportingTotals returns(SalesReturn... rows) {
        return reportingService.totalsOf(new ArrayList<>(List.of(rows)));
    }

    private SalesReturnReportingTotals noReturns() {
        return reportingService.totalsOf(new ArrayList<>());
    }

    private static SalesReturn cashReturn(String subTotal, String tax, String total, int qty) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber("SR-" + System.nanoTime());
        r.setStatus(SalesReturnStatus.APPROVED);
        r.setSubTotal(bd(subTotal));
        r.setTaxAmount(bd(tax));
        r.setTotalAmount(bd(total));
        r.setRefundAmount(bd(total));
        r.setRefundMethod(SalesReturnRefundMethod.CASH_REFUND);
        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode("ITEM-A");
        item.setReturnQty(qty);
        r.setItems(new ArrayList<>(List.of(item)));
        return r;
    }

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }
}
