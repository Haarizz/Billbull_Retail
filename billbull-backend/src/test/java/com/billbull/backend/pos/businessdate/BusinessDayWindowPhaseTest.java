package com.billbull.backend.pos.businessdate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The Business Day's three-phase behavior, exercised as a pure function.
 *
 * <p>These are the tests that pin the actual business rule: that the Scheduled End
 * Time does <b>not</b> close the Business Day, that the extension does, and that the
 * Trading Date is constant from the window's start until the next window's start —
 * crossing the Scheduled End, the closure, and calendar midnight without moving.
 *
 * <p>Both schedule shapes are covered against the same expectations, because the
 * whole point of anchoring to "the most recent window start" is that an overnight
 * schedule is not a special case.
 */
class BusinessDayWindowPhaseTest {

    private static BusinessDaySettings settings(LocalTime start, LocalTime end, int extensionMinutes) {
        return new BusinessDaySettings(true, start, end, extensionMinutes);
    }

    private static BusinessDayWindow at(BusinessDaySettings settings, LocalDateTime now) {
        return PosOperatingHoursCalculator.resolveWindow(now, settings);
    }

    private static void assertPhaseAndDate(BusinessDayWindow window, BusinessDayPhase phase, LocalDate tradingDate) {
        assertEquals(phase, window.phase(), "phase");
        assertEquals(tradingDate, window.tradingDate(), "tradingDate");
    }

    // =====================================================================
    // Normal schedule: 09:00 -> 21:00, extension 2h  (closure 23:00)
    // =====================================================================

    @Nested
    @DisplayName("Same-day schedule 09:00 -> 21:00, +2h extension")
    class NormalSchedule {

        private final BusinessDaySettings config =
                settings(LocalTime.of(9, 0), LocalTime.of(21, 0), 120);

        private final LocalDate day = LocalDate.of(2026, 8, 10);      // the Business Day
        private final LocalDate previousDay = LocalDate.of(2026, 8, 9);

        private BusinessDayWindow on(int hour, int minute) {
            return at(config, LocalDateTime.of(day, LocalTime.of(hour, minute)));
        }

        private BusinessDayWindow nextDayAt(int hour, int minute) {
            return at(config, LocalDateTime.of(day.plusDays(1), LocalTime.of(hour, minute)));
        }

        @Test
        void before0900BelongsToThePreviousBusinessDayNotToday() {
            // 08:59 is still inside yesterday's window's aftermath — yesterday's
            // Business Day has closed (23:00 last night) but today's has not begun.
            assertPhaseAndDate(on(8, 59), BusinessDayPhase.CLOSED, previousDay);
        }

        @Test
        void at0900TheBusinessDayBecomesActive() {
            assertPhaseAndDate(on(9, 0), BusinessDayPhase.ACTIVE, day);
        }

        @Test
        void middayIsActive() {
            assertPhaseAndDate(on(12, 0), BusinessDayPhase.ACTIVE, day);
        }

        @Test
        void oneMinuteBeforeScheduledEndIsStillActive() {
            assertPhaseAndDate(on(20, 59), BusinessDayPhase.ACTIVE, day);
        }

        @Test
        void atScheduledEndTheExtensionBeginsAndTheBusinessDayIsNotClosed() {
            // The single most important assertion in this file: 21:00 is the
            // SCHEDULED END, not the closure. Trading continues, on the same
            // Trading Date.
            BusinessDayWindow window = on(21, 0);
            assertPhaseAndDate(window, BusinessDayPhase.EXTENSION, day);
            assertTrue(window.allowsNormalOperation());
        }

        @Test
        void justAfterScheduledEndIsExtension() {
            assertPhaseAndDate(on(21, 1), BusinessDayPhase.EXTENSION, day);
        }

        @Test
        void midExtensionIsStillExtension() {
            assertPhaseAndDate(on(22, 0), BusinessDayPhase.EXTENSION, day);
        }

        @Test
        void oneMinuteBeforeClosureIsStillExtension() {
            assertPhaseAndDate(on(22, 59), BusinessDayPhase.EXTENSION, day);
        }

        @Test
        void atClosureTheBusinessDayCloses() {
            BusinessDayWindow window = on(23, 0);
            assertPhaseAndDate(window, BusinessDayPhase.CLOSED, day);
            assertFalse(window.allowsNormalOperation());
        }

        @Test
        void afterClosureRemainsClosedOnTheSameTradingDate() {
            assertPhaseAndDate(on(23, 1), BusinessDayPhase.CLOSED, day);
        }

        @Test
        void calendarMidnightDoesNotRollTheTradingDate() {
            // The defect this whole design exists to prevent: at 00:00 the calendar
            // date changes but the Business Day does not. The Trading Date stays on
            // the day the window started, so sales and sessions cannot be split
            // across two Day Closes by the clock ticking past midnight.
            assertPhaseAndDate(nextDayAt(0, 0), BusinessDayPhase.CLOSED, day);
        }

        @Test
        void stillWaitingJustBeforeTheNextStart() {
            assertPhaseAndDate(nextDayAt(8, 59), BusinessDayPhase.CLOSED, day);
        }

        @Test
        void theNextBusinessDayBeginsExactlyAtTheConfiguredStartTime() {
            assertPhaseAndDate(nextDayAt(9, 0), BusinessDayPhase.ACTIVE, day.plusDays(1));
        }

        @Test
        void windowBoundariesAreReportedForTheUi() {
            BusinessDayWindow window = on(21, 30);
            assertEquals(LocalDateTime.of(day, LocalTime.of(9, 0)), window.windowStart());
            assertEquals(LocalDateTime.of(day, LocalTime.of(21, 0)), window.scheduledEnd());
            assertEquals(LocalDateTime.of(day, LocalTime.of(23, 0)), window.closureAt());
            assertEquals(LocalDateTime.of(day.plusDays(1), LocalTime.of(9, 0)), window.nextWindowStart());
        }

        @Test
        void remainingUntilClosureCountsDownDuringExtension() {
            LocalDateTime now = LocalDateTime.of(day, LocalTime.of(21, 30));
            assertEquals(90, at(config, now).remainingUntilClosure(now).toMinutes());
        }

        @Test
        void remainingUntilNextStartCountsDownWhileClosed() {
            LocalDateTime now = LocalDateTime.of(day, LocalTime.of(23, 30));
            // 23:30 -> 09:00 next day = 9h30m
            assertEquals(570, at(config, now).remainingUntilNextStart(now).toMinutes());
        }
    }

    // =====================================================================
    // Overnight schedule: 21:00 -> 05:00, extension 2h  (closure 07:00)
    // =====================================================================

    @Nested
    @DisplayName("Overnight schedule 21:00 -> 05:00, +2h extension")
    class OvernightSchedule {

        private final BusinessDaySettings config =
                settings(LocalTime.of(21, 0), LocalTime.of(5, 0), 120);

        private final LocalDate day = LocalDate.of(2026, 8, 10);       // window opens 21:00 on this date
        private final LocalDate previousDay = LocalDate.of(2026, 8, 9);

        private BusinessDayWindow on(int hour, int minute) {
            return at(config, LocalDateTime.of(day, LocalTime.of(hour, minute)));
        }

        private BusinessDayWindow nextDayAt(int hour, int minute) {
            return at(config, LocalDateTime.of(day.plusDays(1), LocalTime.of(hour, minute)));
        }

        @Test
        void justBeforeTheWindowOpensStillBelongsToThePreviousBusinessDay() {
            assertPhaseAndDate(on(20, 59), BusinessDayPhase.CLOSED, previousDay);
        }

        @Test
        void atStartTheBusinessDayBecomesActive() {
            assertPhaseAndDate(on(21, 0), BusinessDayPhase.ACTIVE, day);
        }

        @Test
        void afterMidnightIsStillTheSameBusinessDay() {
            // The overnight case's whole reason for existing: 01:00 belongs to the
            // Business Day that opened at 21:00 yesterday.
            assertPhaseAndDate(nextDayAt(1, 0), BusinessDayPhase.ACTIVE, day);
        }

        @Test
        void justBeforeScheduledEndIsStillActive() {
            assertPhaseAndDate(nextDayAt(4, 59), BusinessDayPhase.ACTIVE, day);
        }

        @Test
        void atScheduledEndTheExtensionBegins() {
            assertPhaseAndDate(nextDayAt(5, 0), BusinessDayPhase.EXTENSION, day);
        }

        @Test
        void justBeforeClosureIsStillExtension() {
            assertPhaseAndDate(nextDayAt(6, 59), BusinessDayPhase.EXTENSION, day);
        }

        @Test
        void atClosureTheBusinessDayCloses() {
            assertPhaseAndDate(nextDayAt(7, 0), BusinessDayPhase.CLOSED, day);
        }

        @Test
        void afterClosureRemainsClosed() {
            assertPhaseAndDate(nextDayAt(7, 1), BusinessDayPhase.CLOSED, day);
        }

        @Test
        void remainsClosedThroughTheDaytimeGapUntilTheNextStart() {
            assertPhaseAndDate(nextDayAt(20, 59), BusinessDayPhase.CLOSED, day);
        }

        @Test
        void theNextBusinessDayBeginsAtTheNextStartTime() {
            assertPhaseAndDate(nextDayAt(21, 0), BusinessDayPhase.ACTIVE, day.plusDays(1));
        }

        @Test
        void windowBoundariesSpanMidnight() {
            BusinessDayWindow window = nextDayAt(1, 0);
            assertEquals(LocalDateTime.of(day, LocalTime.of(21, 0)), window.windowStart());
            assertEquals(LocalDateTime.of(day.plusDays(1), LocalTime.of(5, 0)), window.scheduledEnd());
            assertEquals(LocalDateTime.of(day.plusDays(1), LocalTime.of(7, 0)), window.closureAt());
            assertEquals(LocalDateTime.of(day.plusDays(1), LocalTime.of(21, 0)), window.nextWindowStart());
        }
    }

    // =====================================================================
    // Configurations that must never block
    // =====================================================================

    @Nested
    @DisplayName("Unrestricted configurations")
    class Unrestricted {

        private final LocalDateTime anyTime = LocalDateTime.of(2026, 8, 10, 3, 0);

        @Test
        void disabledWindowIsUnrestrictedAndUsesTheCalendarDate() {
            BusinessDayWindow window = at(BusinessDaySettings.disabled(), anyTime);
            assertPhaseAndDate(window, BusinessDayPhase.UNRESTRICTED, LocalDate.of(2026, 8, 10));
            assertTrue(window.allowsNormalOperation());
        }

        @Test
        void nullSettingsAreUnrestricted() {
            assertEquals(BusinessDayPhase.UNRESTRICTED, at(null, anyTime).phase());
        }

        @Test
        void missingBoundariesAreUnrestricted() {
            assertEquals(BusinessDayPhase.UNRESTRICTED,
                    at(new BusinessDaySettings(true, null, null, 120), anyTime).phase());
        }

        @Test
        void twentyFourHourOperationNeverCloses() {
            // start == end has always meant 24-hour operation; an extension on top of
            // it would be meaningless, and closing such a branch at any point would
            // be a severe regression for anyone relying on it.
            BusinessDayWindow window = at(settings(LocalTime.of(8, 0), LocalTime.of(8, 0), 120), anyTime);
            assertPhaseAndDate(window, BusinessDayPhase.UNRESTRICTED, LocalDate.of(2026, 8, 10));
            assertTrue(window.allowsNormalOperation());
        }

        @Test
        void unrestrictedWindowsReportNoBoundaries() {
            // Callers must not invent a Scheduled End or closure for a branch that has
            // none — nulls here are what stop the UI rendering a phantom countdown.
            BusinessDayWindow window = at(BusinessDaySettings.disabled(), anyTime);
            assertNull(window.scheduledEnd());
            assertNull(window.closureAt());
            assertNull(window.nextWindowStart());
            assertNull(window.remainingUntilClosure(anyTime));
        }
    }

    // =====================================================================
    // Zero extension — closure coincides with the Scheduled End
    // =====================================================================

    @Test
    void zeroExtensionClosesExactlyAtTheScheduledEndTime() {
        BusinessDaySettings config = settings(LocalTime.of(9, 0), LocalTime.of(21, 0), 0);
        LocalDate day = LocalDate.of(2026, 8, 10);

        assertEquals(BusinessDayPhase.ACTIVE, at(config, LocalDateTime.of(day, LocalTime.of(20, 59))).phase());
        assertEquals(BusinessDayPhase.CLOSED, at(config, LocalDateTime.of(day, LocalTime.of(21, 0))).phase());
        // EXTENSION is simply unreachable with a zero extension — never a
        // zero-length phase that something could momentarily observe.
    }

    // =====================================================================
    // Extension bounds validation
    // =====================================================================

    @Test
    void extensionThatWouldRunPastTheNextStartIsRejected() {
        // 09:00 -> 21:00 leaves 12 hours before the next start; a 13-hour extension
        // would overlap it and make the phase at 09:00 genuinely ambiguous.
        assertFalse(PosOperatingHoursCalculator.isExtensionWithinBounds(
                LocalTime.of(9, 0), LocalTime.of(21, 0), 13 * 60));
        assertTrue(PosOperatingHoursCalculator.isExtensionWithinBounds(
                LocalTime.of(9, 0), LocalTime.of(21, 0), 11 * 60));
    }

    @Test
    void extensionExactlyReachingTheNextStartIsRejected() {
        // Exactly 12 hours would close at precisely 09:00, the same instant the next
        // window opens — rejected rather than relying on a strict-inequality tie-break
        // nobody would remember when reading the config.
        assertFalse(PosOperatingHoursCalculator.isExtensionWithinBounds(
                LocalTime.of(9, 0), LocalTime.of(21, 0), 12 * 60));
    }

    @Test
    void overnightScheduleExtensionBoundsAccountForTheWrappedWindowLength() {
        // 21:00 -> 05:00 is an 8-hour window, leaving 16 hours of slack.
        assertTrue(PosOperatingHoursCalculator.isExtensionWithinBounds(
                LocalTime.of(21, 0), LocalTime.of(5, 0), 15 * 60));
        assertFalse(PosOperatingHoursCalculator.isExtensionWithinBounds(
                LocalTime.of(21, 0), LocalTime.of(5, 0), 17 * 60));
    }

    @Test
    void twentyFourHourScheduleHasNoExtensionBoundToViolate() {
        assertTrue(PosOperatingHoursCalculator.isExtensionWithinBounds(
                LocalTime.of(8, 0), LocalTime.of(8, 0), 600));
    }

    // =====================================================================
    // The resolver and the window can never disagree
    // =====================================================================

    @Test
    void resolverAlwaysAgreesWithTheWindowsTradingDate() {
        // BusinessDayResolver delegates to resolveWindow rather than reimplementing
        // the anchor rule; this guards that delegation against a future "optimization"
        // that reintroduces a second calculation.
        BusinessDaySettings config = settings(LocalTime.of(9, 0), LocalTime.of(21, 0), 120);
        for (int hour = 0; hour < 24; hour++) {
            LocalDateTime now = LocalDateTime.of(2026, 8, 10, hour, 30);
            assertEquals(at(config, now).tradingDate(), BusinessDayResolver.resolve(now, config),
                    "disagreement at hour " + hour);
        }
    }
}
