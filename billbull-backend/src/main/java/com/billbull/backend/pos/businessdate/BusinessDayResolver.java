package com.billbull.backend.pos.businessdate;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Pure computation of the <b>Candidate Business Day</b> a given moment belongs to —
 * the Trading Date the branch's configured Business Day window assigns to that
 * timestamp, before any validation or session creation happens. A Candidate
 * Business Day is only a proposal; it becomes an <b>Active Business Day</b> solely
 * by a session being successfully committed against it.
 *
 * <p>Stateless, side-effect-free, thread-safe: no repositories, no Spring beans, no
 * database access. Delegates entirely to
 * {@link PosOperatingHoursCalculator#resolveWindow} — the one implementation of
 * Business Day window arithmetic — so the Trading Date reported here can never
 * disagree with the phase reported anywhere else.
 *
 * <p><b>The Trading Date is constant for the whole window.</b> It does not change at
 * the Scheduled End Time, does not change when the extension expires, and does not
 * change at calendar midnight. During the {@code CLOSED} phase it remains the
 * Trading Date of the window that just ended: the next Business Day does not begin
 * until the next configured start time, so nothing is dated into it early.
 */
public final class BusinessDayResolver {

    private BusinessDayResolver() {}

    /**
     * Resolves the Candidate Business Day for {@code timestamp} under
     * {@code settings}. With no window in force (disabled, boundaries missing, or
     * 24-hour operation) this is simply the timestamp's calendar date — the
     * long-standing default behavior for every branch that has not opted in.
     * Otherwise it is the calendar date on which the window in force began.
     *
     * @param timestamp the moment to resolve, already in the Business Day timezone
     *                  (see {@link BusinessDayClock}).
     */
    public static LocalDate resolve(LocalDateTime timestamp, BusinessDaySettings settings) {
        if (timestamp == null) {
            throw new IllegalArgumentException("timestamp is required");
        }
        return PosOperatingHoursCalculator.resolveWindow(timestamp, settings).tradingDate();
    }
}
