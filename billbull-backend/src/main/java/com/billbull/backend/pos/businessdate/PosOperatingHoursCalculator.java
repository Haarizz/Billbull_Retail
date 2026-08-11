package com.billbull.backend.pos.businessdate;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * Pure operating-hours time-window math. No repositories, no services, no database
 * access, no Spring dependencies — evaluates time-based rules only. Isolated on
 * purpose so a future overnight shift (e.g. 08:00 -> 02:00) is a change confined to
 * this one function, not a redesign of any caller.
 *
 * <p>{@link #resolveWindow} is the <b>single</b> implementation of Business Day
 * window arithmetic in the codebase — phase, Trading Date, Scheduled End and actual
 * closure all come out of that one function, so no two callers can arrive at
 * different answers about which Business Day it is.
 */
public final class PosOperatingHoursCalculator {

    private PosOperatingHoursCalculator() {}

    /**
     * Resolves the Business Day window that {@code now} belongs to.
     *
     * <p>Same-day ({@code 09:00 -> 21:00}) and overnight ({@code 21:00 -> 05:00})
     * schedules deliberately share one code path rather than branching: everything
     * is anchored to <b>the most recent occurrence of {@code start} at or before
     * {@code now}</b>, and the window's length is the wrap-aware duration from
     * {@code start} to {@code end}. An overnight schedule then falls out of the same
     * arithmetic — {@code scheduledEnd} simply lands on the following calendar day —
     * with no special-casing to get wrong. This is what makes the Trading Date
     * immune to calendar midnight.
     *
     * <p>Returns an {@link BusinessDayPhase#UNRESTRICTED} window when no schedule is
     * in force — the window is disabled, either boundary is missing, or
     * {@code start == end} (24-hour operation, matching
     * {@link #isWithinOperatingHours}'s long-standing convention). In that case the
     * Trading Date is the plain calendar date and nothing is ever blocked, which is
     * the pre-existing behavior for every branch that has not opted in.
     *
     * @param now      the moment to resolve, already in the Business Day timezone
     *                 (see {@link BusinessDayClock}) — never a raw {@code LocalDateTime.now()}.
     * @param settings the branch's configured window.
     */
    public static BusinessDayWindow resolveWindow(LocalDateTime now, BusinessDaySettings settings) {
        if (now == null) {
            throw new IllegalArgumentException("now is required");
        }
        if (settings == null || !settings.isConfigured()) {
            return BusinessDayWindow.unrestricted(now.toLocalDate());
        }

        LocalTime start = settings.getStartTime();
        LocalTime end = settings.getEndTime();
        if (start.equals(end)) {
            return BusinessDayWindow.unrestricted(now.toLocalDate());
        }

        // Anchor: the most recent occurrence of `start` at or before `now`. If today's
        // start time has not arrived yet, the window in force is the one that began
        // yesterday — this single line is what keeps a Business Day from rolling over
        // at midnight, for same-day and overnight schedules alike.
        LocalDateTime startToday = LocalDateTime.of(now.toLocalDate(), start);
        LocalDateTime windowStart = now.isBefore(startToday) ? startToday.minusDays(1) : startToday;

        LocalDateTime scheduledEnd = windowStart.plus(windowLength(start, end));
        LocalDateTime closureAt = scheduledEnd.plusMinutes(settings.getExtensionMinutes());
        LocalDateTime nextWindowStart = windowStart.plusDays(1);

        BusinessDayPhase phase;
        if (now.isBefore(scheduledEnd)) {
            phase = BusinessDayPhase.ACTIVE;
        } else if (now.isBefore(closureAt)) {
            phase = BusinessDayPhase.EXTENSION;
        } else {
            phase = BusinessDayPhase.CLOSED;
        }

        return new BusinessDayWindow(windowStart.toLocalDate(), windowStart, scheduledEnd,
                closureAt, nextWindowStart, phase);
    }

    /**
     * The wall-clock length of a window running {@code start -> end}, wrapping past
     * midnight for an overnight schedule (21:00 -> 05:00 is 8 hours, not -16).
     * Callers must handle {@code start.equals(end)} (24-hour operation) themselves
     * before calling, same as {@link #isOvernightWindow}.
     */
    public static Duration windowLength(LocalTime start, LocalTime end) {
        Duration raw = Duration.between(start, end);
        return raw.isNegative() ? raw.plusDays(1) : raw;
    }

    /**
     * Whether {@code extensionMinutes} is short enough to expire before the next
     * window opens. An extension that runs past the next start time would make two
     * Business Days claim the same instant, so it is rejected at settings-save time
     * rather than producing an ambiguous phase at runtime. Returns true for a
     * 24-hour/equal-boundary schedule, which has no closure to overrun.
     */
    public static boolean isExtensionWithinBounds(LocalTime start, LocalTime end, int extensionMinutes) {
        if (start == null || end == null || start.equals(end)) return true;
        if (extensionMinutes <= 0) return true;
        return windowLength(start, end).plusMinutes(extensionMinutes).compareTo(Duration.ofDays(1)) < 0;
    }

    /**
     * Whether {@code now} falls within the configured operating window.
     * Handles both same-day windows ({@code start < end}, e.g. 08:00 -> 22:00) and
     * windows that cross midnight ({@code end <= start}, e.g. 08:00 -> 00:00 or a
     * future 08:00 -> 02:00 overnight shift) via wrap-around comparison.
     */
    public static boolean isWithinOperatingHours(LocalTime start, LocalTime end, LocalTime now) {
        if (start == null || end == null || now == null) return true;
        if (start.equals(end)) return true; // 24-hour operation
        if (!isOvernightWindow(start, end)) {
            return !now.isBefore(start) && now.isBefore(end);
        }
        // Wrap-around window (crosses midnight): "now" is within hours if it's after
        // start (evening side) or before end (early-morning side of the next day).
        return !now.isBefore(start) || now.isBefore(end);
    }

    /**
     * Whether {@code start}/{@code end} describe a window that crosses midnight
     * (e.g. 08:00 -> 02:00), as opposed to a same-day window (e.g. 08:00 -> 22:00).
     * Shared with {@link BusinessDayResolver} so the two components can never
     * disagree about what counts as "overnight" — this is the single definition.
     * Callers must handle the {@code start.equals(end)} "24-hour operation" case
     * themselves before calling this, same as {@link #isWithinOperatingHours} does.
     */
    public static boolean isOvernightWindow(LocalTime start, LocalTime end) {
        return !start.isBefore(end);
    }
}
