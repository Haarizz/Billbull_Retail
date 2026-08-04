package com.billbull.backend.pos.businessdate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * Pure computation of the <b>Candidate Business Day</b> a given moment belongs to —
 * the Business Day {@link BusinessDaySettings}' configured start/end time would
 * assign to that timestamp, before any validation or session creation happens.
 * A Candidate Business Day is only a proposal; it becomes an <b>Active Business
 * Day</b> solely by a session being successfully committed against it (see the
 * approved Business Day lifecycle) — this class has no opinion on that and never
 * will, by design.
 *
 * <p>Stateless, side-effect-free, thread-safe: no repositories, no Spring beans,
 * no database access. Reuses {@link PosOperatingHoursCalculator#isOvernightWindow}
 * for overnight-window detection so the two components can never disagree about
 * what counts as "overnight."
 *
 * <p><b>Phase 1 (infrastructure only):</b> this class is not yet called from any
 * production code path. It exists so later phases have a tested, trustworthy
 * building block to wire in — see {@code docs/business-day-architecture.md}.
 */
public final class BusinessDayResolver {

    private BusinessDayResolver() {}

    /**
     * Resolves the Candidate Business Day for {@code timestamp} under
     * {@code settings}. With no configured window (disabled, or start/end
     * missing), the Candidate Business Day is simply the timestamp's calendar
     * date. With a same-day window ({@code start < end}), same result. With an
     * overnight window ({@code end <= start}), a timestamp before today's window
     * start belongs to yesterday's Business Day.
     */
    public static LocalDate resolve(LocalDateTime timestamp, BusinessDaySettings settings) {
        if (timestamp == null) {
            throw new IllegalArgumentException("timestamp is required");
        }
        if (settings == null || !settings.isConfigured()) {
            return timestamp.toLocalDate();
        }

        LocalTime start = settings.getStartTime();
        LocalTime end = settings.getEndTime();

        if (start.equals(end)) {
            // 24-hour operation — same convention as PosOperatingHoursCalculator.
            return timestamp.toLocalDate();
        }
        if (!PosOperatingHoursCalculator.isOvernightWindow(start, end)) {
            return timestamp.toLocalDate();
        }

        // Overnight window: a timestamp before today's window-start is still
        // inside the tail end of the Business Day that started yesterday.
        LocalDateTime windowStartToday = LocalDateTime.of(timestamp.toLocalDate(), start);
        return timestamp.isBefore(windowStartToday)
                ? timestamp.toLocalDate().minusDays(1)
                : timestamp.toLocalDate();
    }
}
