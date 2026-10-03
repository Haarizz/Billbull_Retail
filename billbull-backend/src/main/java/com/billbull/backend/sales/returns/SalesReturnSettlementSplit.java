package com.billbull.backend.sales.returns;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The economic split of one Sales Return, computed server-side from the linked invoice's real
 * payment history.
 *
 * <pre>
 * returnValue        = the approved return total (sales_returns.total_amount)
 * invoiceOutstanding = canonical effective outstanding of the linked invoice
 * unpaidPortion      = min(returnValue, invoiceOutstanding)
 * paidPortion        = returnValue - unpaidPortion
 * </pre>
 *
 * <p>The unpaid portion cancels a receivable the customer had not yet settled — it becomes an
 * allocation row, never money. The paid portion is value the customer has already handed over
 * and is owed back, and it is the <em>only</em> amount any settlement method may move. The
 * refund method therefore chooses where the paid portion goes and has no say at all over the
 * unpaid portion, which is what stops the refund-method dropdown from being accounting policy.
 *
 * <p>The central invariant, which {@link #isConsistent()} asserts:
 * {@code returnValue == unpaidPortion + paidPortion}. It holds by construction because the
 * paid portion is defined as the residue, and the {@code min()} cap is what makes a negative
 * receivable structurally impossible rather than floored after the fact.
 *
 * <p>Both portions are non-negative and carry 2-decimal money scale. A return against an
 * invoice that cannot be resolved falls back to {@code invoiceOutstanding = 0}, which makes the
 * whole return a paid portion — the conservative reading, and the same answer the system gives
 * for a fully paid sale.
 */
public record SalesReturnSettlementSplit(
        BigDecimal returnValue,
        BigDecimal invoiceOutstanding,
        BigDecimal unpaidPortion,
        BigDecimal paidPortion) {

    private static final int SCALE = 2;

    public static SalesReturnSettlementSplit of(BigDecimal returnValue, BigDecimal invoiceOutstanding) {
        BigDecimal value = money(returnValue);
        BigDecimal outstanding = money(invoiceOutstanding);
        BigDecimal unpaid = value.min(outstanding);
        BigDecimal paid = value.subtract(unpaid);
        return new SalesReturnSettlementSplit(value, outstanding, unpaid, paid);
    }

    /** A return with nothing to split — used where no linked invoice resolves. */
    public static SalesReturnSettlementSplit fullyPaid(BigDecimal returnValue) {
        return of(returnValue, BigDecimal.ZERO);
    }

    /** True when any part of this return credits the receivable rather than paying money out. */
    public boolean hasUnpaidPortion() {
        return unpaidPortion.signum() > 0;
    }

    /** True when some value is genuinely owed back and a settlement method may move it. */
    public boolean hasPaidPortion() {
        return paidPortion.signum() > 0;
    }

    /** {@code returnValue == unpaidPortion + paidPortion} — reconciliation invariant 1. */
    public boolean isConsistent() {
        return unpaidPortion.add(paidPortion).compareTo(returnValue) == 0;
    }

    private static BigDecimal money(BigDecimal v) {
        BigDecimal base = v != null ? v : BigDecimal.ZERO;
        return base.max(BigDecimal.ZERO).setScale(SCALE, RoundingMode.HALF_UP);
    }
}
