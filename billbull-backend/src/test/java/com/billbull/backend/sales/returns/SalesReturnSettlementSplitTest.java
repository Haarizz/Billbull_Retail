package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/**
 * The economic split, as arithmetic: {@code unpaidPortion = min(returnValue,
 * invoiceOutstanding)} and {@code paidPortion = returnValue - unpaidPortion}.
 *
 * <p>The four cases named A–D below are the partial-payment scenarios the Phase 2 brief
 * specifies, and they are not four models — they are the boundary cases of one. Which one
 * applies is a fact about the invoice, never a choice at the till, which is the whole point of
 * computing the split before offering a refund method.
 *
 * <p>Pure arithmetic with no collaborators. What this suite cannot show is that the figures come
 * from the real ledger under a row lock and overwrite whatever the client sent — that is
 * {@link SalesReturnApprovalSplitTest}.
 */
class SalesReturnSettlementSplitTest {

    // ---------------------------------------------------------------------------
    // The four partial-payment cases. Invoice total 10,000 throughout.
    // ---------------------------------------------------------------------------

    @Test
    void caseA_fullyUnpaidInvoice_wholeReturnCreditsTheReceivable() {
        // Invoice 10,000, paid 0 -> outstanding 10,000. Return 2,000.
        SalesReturnSettlementSplit split = SalesReturnSettlementSplit.of(
                money("2000"), money("10000"));

        assertMoney("10000.00", split.invoiceOutstanding());
        assertMoney("2000.00", split.unpaidPortion());
        assertMoney("0.00", split.paidPortion());
        assertFalse(split.hasPaidPortion(),
                "Nothing has been paid for these goods, so no money may leave the business.");
        // Invoice outstanding falls 10,000 -> 8,000 through the allocation.
        assertMoney("8000.00", money("10000").subtract(split.unpaidPortion()));
    }

    @Test
    void caseB_partlyPaidAndReturnBelowOutstanding_stillNoMoneyLeaves() {
        // Invoice 10,000, paid 6,000 -> outstanding 4,000. Return 2,000.
        SalesReturnSettlementSplit split = SalesReturnSettlementSplit.of(
                money("2000"), money("4000"));

        assertMoney("2000.00", split.unpaidPortion());
        assertMoney("0.00", split.paidPortion());
        // This is the case the audit flagged as commercially wrong today: a cashier could press
        // Cash Refund, hand over 2,000, and leave the customer still owing 4,000. Under the
        // split that outcome is unreachable rather than merely discouraged.
        assertFalse(split.hasPaidPortion());
        assertMoney("2000.00", money("4000").subtract(split.unpaidPortion()));
    }

    @Test
    void caseC_returnExceedsOutstanding_splitsAtTheOutstanding() {
        // Invoice 10,000, paid 8,000 -> outstanding 2,000. Return 5,000.
        SalesReturnSettlementSplit split = SalesReturnSettlementSplit.of(
                money("5000"), money("2000"));

        assertMoney("2000.00", split.unpaidPortion());
        assertMoney("3000.00", split.paidPortion());
        assertTrue(split.hasUnpaidPortion());
        assertTrue(split.hasPaidPortion());
    }

    @Test
    void caseD_fullyPaidInvoice_wholeReturnIsRefundable() {
        // Invoice 10,000, paid 10,000 -> outstanding 0. Return 2,500.
        SalesReturnSettlementSplit split = SalesReturnSettlementSplit.of(
                money("2500"), BigDecimal.ZERO);

        assertMoney("0.00", split.unpaidPortion());
        assertMoney("2500.00", split.paidPortion());
        assertFalse(split.hasUnpaidPortion(), "No receivable left to credit.");
    }

    // ---------------------------------------------------------------------------
    // Invariants (§22)
    // ---------------------------------------------------------------------------

    @Test
    void returnValueAlwaysEqualsUnpaidPlusPaid() {
        String[][] combinations = {
                {"2000", "10000"}, {"2000", "4000"}, {"5000", "2000"}, {"2500", "0"},
                {"0", "5000"}, {"1", "0"}, {"137.55", "100.07"}, {"99999.99", "0.01"},
        };
        for (String[] c : combinations) {
            SalesReturnSettlementSplit split =
                    SalesReturnSettlementSplit.of(money(c[0]), money(c[1]));
            assertTrue(split.isConsistent(),
                    "returnValue must equal unpaidPortion + paidPortion for " + c[0] + "/" + c[1]);
            assertEquals(0, split.unpaidPortion().add(split.paidPortion())
                            .compareTo(split.returnValue()),
                    "split does not reconcile for " + c[0] + "/" + c[1]);
        }
    }

    @Test
    void neitherPortionIsEverNegative() {
        // A return larger than the whole invoice, and an outstanding larger than the return.
        for (SalesReturnSettlementSplit split : new SalesReturnSettlementSplit[] {
                SalesReturnSettlementSplit.of(money("50000"), money("2000")),
                SalesReturnSettlementSplit.of(money("10"), money("999999")),
        }) {
            assertTrue(split.unpaidPortion().signum() >= 0);
            assertTrue(split.paidPortion().signum() >= 0);
        }
    }

    @Test
    void theUnpaidPortionCannotExceedTheInvoiceOutstanding() {
        // This min() cap is what makes a negative receivable structurally impossible, rather
        // than something floored after the fact. Invariant 4.
        SalesReturnSettlementSplit split = SalesReturnSettlementSplit.of(money("5000"), money("2000"));
        assertTrue(split.unpaidPortion().compareTo(split.invoiceOutstanding()) <= 0);
    }

    @Test
    void aNegativeOrNullOutstandingIsTreatedAsNothingToCredit() {
        // Legacy data can carry a negative balance. Treating it as zero means the whole return
        // becomes a paid portion, which is the conservative reading: it never credits AR for a
        // receivable that does not exist.
        assertMoney("0.00", SalesReturnSettlementSplit.of(money("100"), money("-500")).unpaidPortion());
        assertMoney("100.00", SalesReturnSettlementSplit.of(money("100"), null).paidPortion());
        assertMoney("0.00", SalesReturnSettlementSplit.of(null, money("500")).returnValue());
    }

    @Test
    void anUnlinkedReturnIsWhollyAPaidPortion() {
        // No linked invoice means no receivable to point at, so nothing may be credited to AR.
        SalesReturnSettlementSplit split = SalesReturnSettlementSplit.fullyPaid(money("750.25"));

        assertMoney("0.00", split.unpaidPortion());
        assertMoney("750.25", split.paidPortion());
    }

    @Test
    void moneyIsHeldAtTwoDecimalPlaces() {
        SalesReturnSettlementSplit split =
                SalesReturnSettlementSplit.of(new BigDecimal("100.005"), new BigDecimal("60.004"));

        assertEquals(2, split.returnValue().scale());
        assertEquals(2, split.paidPortion().scale());
        assertTrue(split.isConsistent());
    }

    // ---------------------------------------------------------------------------
    // Invariant 2 (§22) — the GL and the AR sub-ledger agree by construction
    // ---------------------------------------------------------------------------

    /**
     * The identity that makes the whole model cheap, and the reason the five-row settlement
     * table survives untouched.
     *
     * <p>The return journal credits AR for the full return value, every method, every time. The
     * settlement leg debits AR back by the paid portion. The net credit to AR is therefore
     * exactly the unpaid portion — which is exactly what the allocation row reduces the
     * invoice's balance by. So GL 1100 and the AR sub-ledger move together for every refund
     * method, with no new journal shape and no per-method branching.
     *
     * <p>Before the split this held by accident for CUSTOMER_CREDIT alone, which is why
     * {@code reconcileAR} drifted by every ledger-credit return ever booked.
     */
    @Test
    void theNetCreditToArAlwaysEqualsTheAllocation() {
        String[][] positions = {
                {"2000", "10000"}, {"2000", "4000"}, {"5000", "2000"},
                {"2500", "0"}, {"4000", "4000"}, {"137.55", "100.07"},
        };
        for (String[] p : positions) {
            SalesReturnSettlementSplit split = SalesReturnSettlementSplit.of(money(p[0]), money(p[1]));

            BigDecimal creditToAr = split.returnValue();      // the return journal's Cr 1100
            BigDecimal debitToAr = split.paidPortion();       // the settlement leg's Dr 1100
            BigDecimal netCredit = creditToAr.subtract(debitToAr);
            BigDecimal allocation = split.unpaidPortion();    // what the invoice balance falls by

            assertEquals(0, netCredit.compareTo(allocation),
                    "net Cr AR must equal the allocation for " + p[0] + "/" + p[1]);
        }
    }

    /**
     * Invariant "no negative AR": the receivable an invoice carries after a return is never
     * below zero, however large the return.
     *
     * <p>Not a floor applied afterwards — the {@code min()} cap on the allocation is what makes
     * it unreachable. A 50,000 return against an invoice with 2,000 outstanding credits 2,000
     * and refunds 48,000; it does not drive the customer's balance to −48,000, which is what
     * the old derived subtraction did.
     */
    @Test
    void anInvoiceOutstandingCannotBeDrivenNegativeByAReturn() {
        BigDecimal outstanding = money("2000");
        SalesReturnSettlementSplit split = SalesReturnSettlementSplit.of(money("50000"), outstanding);

        BigDecimal after = outstanding.subtract(split.unpaidPortion());

        assertMoney("0.00", after);
        assertTrue(after.signum() >= 0);
        assertMoney("48000.00", split.paidPortion());
    }

    /** Successive returns against one invoice consume the outstanding exactly once in total. */
    @Test
    void successiveReturnsCannotCollectivelyExceedTheOutstanding() {
        // Invoice 10,000 paid 6,000 -> 4,000 outstanding. Three returns of 2,000 each.
        BigDecimal outstanding = money("4000");
        BigDecimal totalAllocated = BigDecimal.ZERO;

        for (int i = 0; i < 3; i++) {
            SalesReturnSettlementSplit split = SalesReturnSettlementSplit.of(money("2000"), outstanding);
            totalAllocated = totalAllocated.add(split.unpaidPortion());
            // The canonical outstanding is net of allocations already made, so the next return
            // sees a smaller figure. This is the term that closes the double-claim by
            // construction rather than by a floor.
            outstanding = outstanding.subtract(split.unpaidPortion());
        }

        assertMoney("4000.00", totalAllocated);
        assertMoney("0.00", outstanding);
    }

    private static BigDecimal money(String v) {
        return v != null ? new BigDecimal(v) : null;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}
