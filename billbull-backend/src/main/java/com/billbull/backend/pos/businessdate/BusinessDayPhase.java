package com.billbull.backend.pos.businessdate;

/**
 * Which of the Business Day's three scheduled phases a moment falls in, plus the
 * "no schedule configured" case. Derived, never persisted — see
 * {@link PosOperatingHoursCalculator#resolveWindow}.
 *
 * <p>The three scheduled phases are deliberately distinct concepts and must never
 * be collapsed into one another (the pre-existing implementation conflated the
 * Scheduled End Time with Business Day closure, which is the defect this enum
 * exists to make impossible):
 *
 * <ul>
 *   <li><b>Scheduled End Time</b> ends {@link #ACTIVE} — the normal operating
 *       period is over, but the Business Day is <i>not</i> closed.
 *   <li><b>Extension</b> is a controlled grace period after the Scheduled End
 *       Time. Trading continues on the same Trading Date.
 *   <li><b>Actual closure</b> (Scheduled End + extension) ends {@link #EXTENSION}
 *       and begins {@link #CLOSED} — this, and only this, is the enforcement point.
 * </ul>
 */
public enum BusinessDayPhase {

    /** Between the configured start time and the Scheduled End Time. Normal
     *  operation: sessions open, sales proceed, X-Reports work. */
    ACTIVE,

    /** Between the Scheduled End Time and actual closure. Everything still works
     *  exactly as in {@link #ACTIVE} — the Trading Date does not change — but the
     *  operator is warned that forced closure is approaching. */
    EXTENSION,

    /** After actual closure and before the next window's start time. New sessions
     *  are refused and normal selling stops; session closure, Day Close, Z-Report
     *  and all reporting deliberately remain available. The Trading Date reported
     *  during this phase is still that of the window that just ended — the next
     *  Business Day does not begin until the next configured start time. */
    CLOSED,

    /** No window is in force — either the Business Day Window is disabled, or it
     *  is configured as 24-hour operation ({@code start == end}). Nothing is ever
     *  blocked and the Trading Date is the plain calendar date, exactly as before
     *  this feature existed. This is the default for every branch. */
    UNRESTRICTED;

    /** Whether normal POS operation (opening sessions, selling) is permitted in
     *  this phase. {@link #EXTENSION} is deliberately permissive — it is a grace
     *  period, not a soft block. */
    public boolean allowsNormalOperation() {
        return this != CLOSED;
    }
}
