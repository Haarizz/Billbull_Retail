package com.billbull.backend.sales.returns.reporting;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnItem;
import com.billbull.backend.sales.returns.SalesReturnRefundMethod;
import com.billbull.backend.sales.returns.SalesReturnStatus;

/**
 * How the X-Report and Z-Report classify a day's returns.
 *
 * <p>Classification used to key on {@code returnAction} — free text the UI derives as
 * {@code refundMethod === 'CREDIT_VOUCHER' ? 'Credit Note' : 'Refund'}. Cash, card, bank
 * <em>and</em> Customer Credit therefore all landed in one bucket called "Refunds Processed", so a
 * Z-Report reported a Customer Credit return as money refunded: the drawer looked short by an
 * amount no cashier had taken, and the cashier was the one asked to account for it.
 *
 * <p>{@code refund_method} has been the authoritative column since V78. These cases pin each
 * method to its own bucket, and pin the two rules that matter most: only cash, card and bank may
 * be summed into anything called a refund, and a row that cannot be classified is never guessed
 * into one.
 */
class SalesReturnReportingClassificationTest {

    /**
     * The aggregation is a pure function over the rows it is handed and touches no repository,
     * so the service is built with a null one. {@code forBranchAndDate} is the only method that
     * queries, and it is not exercised here.
     */
    private final SalesReturnReportingService service = new SalesReturnReportingService(null);

    // ── one bucket per method ───────────────────────────────────────────────────────

    @Test
    void everyRefundMethodLandsInItsOwnBucketAtTheAmountActuallySettled() {
        SalesReturnReportingTotals summary = aggregate(
                approved(SalesReturnRefundMethod.CASH_REFUND, "100.00", "100.00"),
                approved(SalesReturnRefundMethod.CARD_REFUND, "200.00", "200.00"),
                approved(SalesReturnRefundMethod.BANK_TRANSFER, "300.00", "300.00"),
                approved(SalesReturnRefundMethod.CREDIT_VOUCHER, "400.00", "400.00"),
                approved(SalesReturnRefundMethod.CUSTOMER_CREDIT, "500.00", "500.00"));

        assertEquals(bd("100.00"), method(summary, SalesReturnRefundMethod.CASH_REFUND));
        assertEquals(bd("200.00"), method(summary, SalesReturnRefundMethod.CARD_REFUND));
        assertEquals(bd("300.00"), method(summary, SalesReturnRefundMethod.BANK_TRANSFER));
        assertEquals(bd("400.00"), method(summary, SalesReturnRefundMethod.CREDIT_VOUCHER));
        assertEquals(bd("500.00"), method(summary, SalesReturnRefundMethod.CUSTOMER_CREDIT));

        assertEquals(5, summary.count());
        assertEquals(bd("1500.00"), summary.value());
    }

    @Test
    void refundsProcessedIsCashPlusCardPlusBankAndNothingElse() {
        SalesReturnReportingTotals summary = aggregate(
                approved(SalesReturnRefundMethod.CASH_REFUND, "100.00", "100.00"),
                approved(SalesReturnRefundMethod.CARD_REFUND, "200.00", "200.00"),
                approved(SalesReturnRefundMethod.BANK_TRANSFER, "300.00", "300.00"),
                approved(SalesReturnRefundMethod.CREDIT_VOUCHER, "400.00", "400.00"),
                approved(SalesReturnRefundMethod.CUSTOMER_CREDIT, "500.00", "500.00"));

        assertEquals(bd("600.00"), summary.refundsPaidOut());
        assertEquals(3, summary.refundsPaidOutCount());
    }

    @Test
    void creditNotesIssuedIsTheVoucherAndCustomerCreditLiabilities() {
        SalesReturnReportingTotals summary = aggregate(
                approved(SalesReturnRefundMethod.CREDIT_VOUCHER, "400.00", "400.00"),
                approved(SalesReturnRefundMethod.CUSTOMER_CREDIT, "500.00", "500.00"));

        assertEquals(bd("900.00"), summary.creditNotesIssued());
        assertEquals(2, summary.creditNotesIssuedCount());
    }

    @Test
    void aCustomerCreditReturnNeverIncreasesTheCashRefundBucket() {
        // The original defect, stated as a single case: no money left the drawer, so nothing may
        // appear in the cash-refund figure the drawer is reconciled against.
        SalesReturnReportingTotals summary = aggregate(approved(SalesReturnRefundMethod.CUSTOMER_CREDIT, "500.00", "500.00"));

        assertEquals(BigDecimal.ZERO, method(summary, SalesReturnRefundMethod.CASH_REFUND));
        assertEquals(BigDecimal.ZERO, summary.refundsPaidOut());
        assertEquals(bd("500.00"), summary.creditNotesIssued());
    }

    @Test
    void classificationIgnoresReturnActionWhenARefundMethodIsPresent() {
        // The worst historical shape: a Customer Credit return whose free-text action says
        // "Refund". The old code read the text and reported it as money paid out.
        SalesReturn r = approved(SalesReturnRefundMethod.CUSTOMER_CREDIT, "500.00", "500.00");
        r.setReturnAction("Refund");

        SalesReturnReportingTotals summary = aggregate(r);

        assertEquals(BigDecimal.ZERO, summary.refundsPaidOut());
        assertEquals(bd("500.00"), method(summary, SalesReturnRefundMethod.CUSTOMER_CREDIT));
    }

    // ── amounts ─────────────────────────────────────────────────────────────────────

    @Test
    void bucketsUseTheSettledAmountWhileTheDocumentTotalStaysTheDocumentTotal() {
        SalesReturnReportingTotals summary = aggregate(approved(SalesReturnRefundMethod.CASH_REFUND, "500.00", "420.00"));

        assertEquals(bd("420.00"), method(summary, SalesReturnRefundMethod.CASH_REFUND),
                "What left the drawer is refundAmount, which is what a till count can verify");
        assertEquals(bd("500.00"), summary.value());
    }

    @Test
    void aMissingRefundAmountFallsBackToTheDocumentTotal() {
        SalesReturn r = approved(SalesReturnRefundMethod.CASH_REFUND, "500.00", null);

        assertEquals(bd("500.00"), method(aggregate(r), SalesReturnRefundMethod.CASH_REFUND));
    }

    // ── legacy rows ─────────────────────────────────────────────────────────────────

    @Test
    void aLegacyRowWithNoRefundMethodIsReadThroughTheFreeTextLabel() {
        SalesReturn legacy = approved(null, "250.00", "250.00");
        legacy.setReturnAction("Cash Back"); // what the old POS wizard wrote

        SalesReturnReportingTotals summary = aggregate(legacy);

        assertEquals(bd("250.00"), method(summary, SalesReturnRefundMethod.CASH_REFUND));
        assertEquals(0, summary.unclassifiedCount());
    }

    @Test
    void aLegacyRowWithOnlyABareRefundActionStillCountsAsMoneyPaidOut() {
        // A pre-V78 row whose action is just "Refund": the instrument is unrecoverable, but the
        // fact that money left is not. Dropping it would under-report the day's payouts, which is
        // the opposite failure to the one this change exists to fix. The rule is
        // settlesOutsideReceivable() — the same one the customer sub-ledger already reads.
        SalesReturn legacy = approved(null, "250.00", "250.00");
        legacy.setReturnAction("Refund");

        SalesReturnReportingTotals summary = aggregate(legacy);

        assertEquals(bd("250.00"), summary.refundsPaidOut());
        assertEquals(1, summary.refundsPaidOutCount());
        assertEquals(bd("250.00"), summary.legacyPaidOut());
        // But it is attributed to no instrument, because none is known.
        assertEquals(BigDecimal.ZERO, method(summary, SalesReturnRefundMethod.CASH_REFUND));
        assertEquals(BigDecimal.ZERO, method(summary, SalesReturnRefundMethod.CARD_REFUND));
        assertEquals(0, summary.unclassifiedCount());
    }

    @Test
    void aLegacyCreditNoteActionStaysOnTheLedgerSideAndIsNotARefund() {
        SalesReturn legacy = approved(null, "250.00", "250.00");
        legacy.setReturnAction("Credit Note");

        SalesReturnReportingTotals summary = aggregate(legacy);

        assertEquals(BigDecimal.ZERO, summary.refundsPaidOut());
        assertEquals(bd("250.00"), summary.creditNotesIssued());
        assertEquals(bd("250.00"), summary.legacyLedgerCredit());
    }

    @Test
    void aRowWithNeitherARefundMethodNorAnActionIsCountedAsNeither() {
        SalesReturn legacy = approved(null, "250.00", "250.00");
        legacy.setReturnAction(null);

        SalesReturnReportingTotals summary = aggregate(legacy);

        assertEquals(1, summary.unclassifiedCount());
        assertEquals(bd("250.00"), summary.unclassified());
        assertEquals(BigDecimal.ZERO, summary.refundsPaidOut());
        assertEquals(BigDecimal.ZERO, summary.creditNotesIssued());
    }

    // ── scope ───────────────────────────────────────────────────────────────────────

    @Test
    void onlyApprovedReturnsAreCounted() {
        SalesReturn draft = approved(SalesReturnRefundMethod.CASH_REFUND, "100.00", "100.00");
        draft.setStatus(SalesReturnStatus.DRAFT);
        SalesReturn cancelled = approved(SalesReturnRefundMethod.CASH_REFUND, "100.00", "100.00");
        cancelled.setStatus(SalesReturnStatus.CANCELLED);

        SalesReturnReportingTotals summary = aggregate(draft, cancelled);

        assertEquals(0, summary.count());
        assertEquals(BigDecimal.ZERO, method(summary, SalesReturnRefundMethod.CASH_REFUND));
    }

    @Test
    void returnedQuantityIsSummedAcrossLines() {
        SalesReturn r = approved(SalesReturnRefundMethod.CASH_REFUND, "100.00", "100.00");
        r.getItems().add(line(4));

        assertEquals(6, aggregate(r).quantity());
    }

    @Test
    void theExchangeBucketStillKeysOnTheDocumentActionBecauseItIsNotARefundMethod() {
        SalesReturn r = approved(SalesReturnRefundMethod.CASH_REFUND, "100.00", "100.00");
        r.setReturnAction("Replacement");

        SalesReturnReportingTotals summary = aggregate(r);

        assertEquals(1, summary.exchangeCount());
        // Still a cash refund as far as the money is concerned.
        assertEquals(bd("100.00"), method(summary, SalesReturnRefundMethod.CASH_REFUND));
    }

    // ── plumbing ────────────────────────────────────────────────────────────────────

    private SalesReturnReportingTotals aggregate(SalesReturn... returns) {
        return service.totalsOf(new ArrayList<>(List.of(returns)));
    }

    private static BigDecimal method(SalesReturnReportingTotals t, SalesReturnRefundMethod m) {
        return t.refund(m);
    }

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    private static SalesReturn approved(SalesReturnRefundMethod method, String total, String refunded) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber("SR-" + System.nanoTime());
        r.setStatus(SalesReturnStatus.APPROVED);
        r.setTotalAmount(bd(total));
        if (refunded != null) r.setRefundAmount(bd(refunded));
        r.setRefundMethod(method);
        r.setItems(new ArrayList<>(List.of(line(2))));
        return r;
    }

    private static SalesReturnItem line(int qty) {
        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode("ITEM-A");
        item.setReturnQty(qty);
        return item;
    }
}
