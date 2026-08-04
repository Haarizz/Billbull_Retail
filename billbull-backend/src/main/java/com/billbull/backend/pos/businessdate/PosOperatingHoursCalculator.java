package com.billbull.backend.pos.businessdate;

import java.time.LocalTime;

/**
 * Pure operating-hours time-window math. No repositories, no services, no database
 * access, no Spring dependencies — evaluates time-based rules only. Isolated on
 * purpose so a future overnight shift (e.g. 08:00 -> 02:00) is a change confined to
 * this one function, not a redesign of any caller.
 */
public final class PosOperatingHoursCalculator {

    private PosOperatingHoursCalculator() {}

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
