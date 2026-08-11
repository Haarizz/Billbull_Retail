package com.billbull.backend.pos.businessdate;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Unit tests for {@link BusinessDayResolver} — pure Candidate Business Day
 * computation. No Spring context, no repositories: every case here is a direct
 * function call, matching the "pure, stateless, unit-testable" Phase 1 requirement.
 */
class BusinessDayResolverTest {

    private static LocalDateTime at(int year, int month, int day, int hour, int minute) {
        return LocalDateTime.of(year, month, day, hour, minute);
    }

    // ---------------------------------------------------------------------
    // No settings / disabled operating hours — plain calendar date
    // ---------------------------------------------------------------------

    @Test
    void noSettingsConfiguredResolvesToCalendarDate() {
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 23, 45), null);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    @Test
    void disabledOperatingHoursResolvesToCalendarDate() {
        BusinessDaySettings settings = new BusinessDaySettings(false, LocalTime.of(8, 0), LocalTime.of(2, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 30, 0, 30), settings);
        // Disabled → ignores the overnight window entirely, even though 00:30 would
        // otherwise roll back to July 29 if the window were active.
        assertEquals(LocalDate.of(2026, 7, 30), result);
    }

    @Test
    void enabledButMissingStartTimeResolvesToCalendarDate() {
        BusinessDaySettings settings = new BusinessDaySettings(true, null, LocalTime.of(22, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 23, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    @Test
    void enabledButMissingEndTimeResolvesToCalendarDate() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), null);
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 23, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    @Test
    void disabledFactoryMethodBehavesLikeUnconfigured() {
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 10, 0), BusinessDaySettings.disabled());
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    // ---------------------------------------------------------------------
    // Same-day windows (start < end)
    // ---------------------------------------------------------------------

    @Test
    void sameDayWindowMorningResolvesToCalendarDate() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(22, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 9, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    @Test
    void sameDayWindowAfterEndTimeStillResolvesToCalendarDate() {
        // Outside the configured window doesn't change which calendar date this
        // moment belongs to — that's a separate "is trading currently allowed"
        // concern (PosOperatingHoursCalculator), not this resolver's job.
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(22, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 23, 30), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    @Test
    void sameDayWindowBeforeStartTimeBelongsToYesterdaysBusinessDay() {
        // BEHAVIOR CHANGE (Business Day window/extension work): this previously
        // returned the plain calendar date, 2026-07-29.
        //
        // 03:00 is before the window opens at 08:00, so the Business Day in force is
        // still the one that began at 08:00 on 2026-07-28 — its extension may even
        // still be running. Returning 07-29 here was the defect that let the Trading
        // Date roll over at calendar midnight while the configured window said
        // otherwise, splitting one continuous Business Day across two dates in Day
        // Close. Same rule as the overnight case above, which is the point: the
        // anchor is the most recent window start, regardless of window shape.
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(22, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 3, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 28), result);
    }

    // ---------------------------------------------------------------------
    // 24-hour operation (start == end)
    // ---------------------------------------------------------------------

    @Test
    void startEqualsEndIsTwentyFourHourOperation() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(8, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 3, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    // ---------------------------------------------------------------------
    // Overnight windows (end <= start) — the core case this resolver exists for
    // ---------------------------------------------------------------------

    @Test
    void overnightWindowEveningSideResolvesToSameCalendarDate() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(2, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 23, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    @Test
    void overnightWindowEarlyMorningSideRollsBackToPreviousBusinessDay() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(2, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 30, 0, 30), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    @Test
    void overnightWindowJustBeforeEndTimeStillRollsBackToPreviousBusinessDay() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(2, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 30, 1, 59), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    @Test
    void overnightWindowAtNewWindowStartResolvesToNewCalendarDate() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(2, 0));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 30, 8, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 30), result);
    }

    @Test
    void bothOvernightSessionsResolveToTheSameBusinessDay() {
        // The exact scenario the whole redesign exists to fix: Terminal A at
        // 11:00 PM and Terminal B at 12:30 AM (same overnight window) must agree.
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(2, 0));
        LocalDate terminalA = BusinessDayResolver.resolve(at(2026, 7, 29, 23, 0), settings);
        LocalDate terminalB = BusinessDayResolver.resolve(at(2026, 7, 30, 0, 30), settings);
        assertEquals(terminalA, terminalB);
        assertEquals(LocalDate.of(2026, 7, 29), terminalA);
    }

    // ---------------------------------------------------------------------
    // Midnight boundary / 00:00 end time
    // ---------------------------------------------------------------------

    @Test
    void endTimeMidnightIsTreatedAsOvernightWindow() {
        // end == LocalTime.MIDNIGHT (00:00): start.isBefore(00:00) is never true,
        // so this is always classified as an overnight window (matches
        // PosOperatingHoursCalculator's existing "08:00 -> 00:00" documented case).
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.MIDNIGHT);
        LocalDate eveningSide = BusinessDayResolver.resolve(at(2026, 7, 29, 23, 0), settings);
        LocalDate earlyMorningSide = BusinessDayResolver.resolve(at(2026, 7, 30, 0, 30), settings);

        assertEquals(LocalDate.of(2026, 7, 29), eveningSide);
        assertEquals(LocalDate.of(2026, 7, 29), earlyMorningSide);
    }

    @Test
    void exactlyAtMidnightWithMidnightEndTimeRollsBackToPreviousBusinessDay() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.MIDNIGHT);
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 30, 0, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    // ---------------------------------------------------------------------
    // 23:59 end time (same-day window, right at the boundary)
    // ---------------------------------------------------------------------

    @Test
    void endTimeOneMinuteBeforeMidnightIsSameDayWindow() {
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(23, 59));
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 29, 23, 30), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }

    // ---------------------------------------------------------------------
    // Input validation
    // ---------------------------------------------------------------------

    @Test
    void nullTimestampThrows() {
        assertThrows(IllegalArgumentException.class, () -> BusinessDayResolver.resolve(null, BusinessDaySettings.disabled()));
    }

    // ---------------------------------------------------------------------
    // Consistency with PosOperatingHoursCalculator's overnight detection
    // ---------------------------------------------------------------------

    @Test
    void overnightDetectionAgreesWithOperatingHoursCalculator() {
        LocalTime start = LocalTime.of(8, 0);
        LocalTime end = LocalTime.of(2, 0);
        assertEquals(PosOperatingHoursCalculator.isOvernightWindow(start, end), true);

        BusinessDaySettings settings = new BusinessDaySettings(true, start, end);
        // If it weren't detected as overnight, this early-morning timestamp would
        // resolve to July 30, not July 29 — the rollback below proves the shared
        // detection rule is actually being used.
        LocalDate result = BusinessDayResolver.resolve(at(2026, 7, 30, 1, 0), settings);
        assertEquals(LocalDate.of(2026, 7, 29), result);
    }
}
