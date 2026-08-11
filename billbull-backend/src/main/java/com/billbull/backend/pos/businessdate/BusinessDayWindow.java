package com.billbull.backend.pos.businessdate;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One fully-resolved Business Day window: the concrete timestamps a branch's
 * configured {@code (start, end, extension)} triple maps to around a given moment,
 * together with the phase that moment falls in and the single authoritative
 * Trading Date for the whole window.
 *
 * <p>Immutable and side-effect free — produced only by
 * {@link PosOperatingHoursCalculator#resolveWindow}, which is the sole
 * implementation of this arithmetic in the codebase. Every consumer (the Trading
 * Date resolver, session-opening validation, checkout gating, the Day Status
 * endpoint, the UI) reads its answer from here rather than re-deriving it, so a
 * second, disagreeing notion of "which Business Day is it" cannot arise.
 *
 * <p>All timestamps are in the Business Day timezone (see {@link BusinessDayClock});
 * they are {@code LocalDateTime} because the window is defined in the branch's own
 * wall-clock terms, not in an absolute instant.
 *
 * @param tradingDate      the one authoritative Trading Date for this window. Constant
 *                         across {@code ACTIVE}, {@code EXTENSION} and {@code CLOSED} —
 *                         it does not change at the Scheduled End Time and does not
 *                         change at calendar midnight.
 * @param windowStart      when this Business Day began (the configured start time).
 * @param scheduledEnd     the configured Scheduled End Time. Ends {@code ACTIVE}.
 *                         <b>Not</b> the closure time.
 * @param closureAt        when the Business Day actually closes — {@code scheduledEnd}
 *                         plus the configured extension. The enforcement point.
 * @param nextWindowStart  when the <i>next</i> Business Day begins. Between
 *                         {@code closureAt} and this, the branch is in
 *                         {@code CLOSED}/waiting and no Trading Date advances.
 * @param phase            which phase {@code now} fell in when this window was resolved.
 */
public record BusinessDayWindow(
        LocalDate tradingDate,
        LocalDateTime windowStart,
        LocalDateTime scheduledEnd,
        LocalDateTime closureAt,
        LocalDateTime nextWindowStart,
        BusinessDayPhase phase) {

    /** The always-permissive window used when no schedule is in force (disabled, or
     *  24-hour operation). Trading Date is the plain calendar date and every
     *  boundary is null — there is no Scheduled End, no extension and no closure to
     *  report, and callers must not invent one. */
    public static BusinessDayWindow unrestricted(LocalDate calendarDate) {
        return new BusinessDayWindow(calendarDate, null, null, null, null, BusinessDayPhase.UNRESTRICTED);
    }

    /** Whether normal POS operation is permitted — delegates to {@link BusinessDayPhase}
     *  so the rule lives in exactly one place. */
    public boolean allowsNormalOperation() {
        return phase.allowsNormalOperation();
    }

    /** How long until this Business Day actually closes, or {@code null} when there
     *  is no closure (unrestricted) or it has already passed. Drives the "Remaining:
     *  1h 30m" countdown the extension banner shows. */
    public Duration remainingUntilClosure(LocalDateTime now) {
        if (closureAt == null || !now.isBefore(closureAt)) return null;
        return Duration.between(now, closureAt);
    }

    /** How long until the next Business Day starts, or {@code null} when unrestricted
     *  or already started. Drives the "Next Business Day starts at 09:00" messaging. */
    public Duration remainingUntilNextStart(LocalDateTime now) {
        if (nextWindowStart == null || !now.isBefore(nextWindowStart)) return null;
        return Duration.between(now, nextWindowStart);
    }
}
