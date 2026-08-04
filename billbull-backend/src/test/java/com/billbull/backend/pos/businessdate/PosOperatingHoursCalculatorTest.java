package com.billbull.backend.pos.businessdate;

import org.junit.jupiter.api.Test;

import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Characterization tests pinned around the Phase 1 refactor that extracted
 * {@link PosOperatingHoursCalculator#isOvernightWindow} out of
 * {@link PosOperatingHoursCalculator#isWithinOperatingHours} for reuse by
 * {@link BusinessDayResolver} — proves the refactor is behavior-preserving.
 */
class PosOperatingHoursCalculatorTest {

    @Test
    void sameDayWindowIsNotOvernight() {
        assertFalse(PosOperatingHoursCalculator.isOvernightWindow(LocalTime.of(8, 0), LocalTime.of(22, 0)));
    }

    @Test
    void overnightWindowIsDetected() {
        assertTrue(PosOperatingHoursCalculator.isOvernightWindow(LocalTime.of(8, 0), LocalTime.of(2, 0)));
    }

    @Test
    void midnightEndTimeIsDetectedAsOvernight() {
        assertTrue(PosOperatingHoursCalculator.isOvernightWindow(LocalTime.of(8, 0), LocalTime.MIDNIGHT));
    }

    @Test
    void isWithinOperatingHoursUnchangedForSameDayWindow() {
        assertTrue(PosOperatingHoursCalculator.isWithinOperatingHours(LocalTime.of(8, 0), LocalTime.of(22, 0), LocalTime.of(9, 0)));
        assertFalse(PosOperatingHoursCalculator.isWithinOperatingHours(LocalTime.of(8, 0), LocalTime.of(22, 0), LocalTime.of(23, 0)));
    }

    @Test
    void isWithinOperatingHoursUnchangedForOvernightWindow() {
        assertTrue(PosOperatingHoursCalculator.isWithinOperatingHours(LocalTime.of(8, 0), LocalTime.of(2, 0), LocalTime.of(23, 0)));
        assertTrue(PosOperatingHoursCalculator.isWithinOperatingHours(LocalTime.of(8, 0), LocalTime.of(2, 0), LocalTime.of(1, 0)));
        assertFalse(PosOperatingHoursCalculator.isWithinOperatingHours(LocalTime.of(8, 0), LocalTime.of(2, 0), LocalTime.of(5, 0)));
    }

    @Test
    void nullBoundsStillDefaultToAlwaysWithinHours() {
        assertTrue(PosOperatingHoursCalculator.isWithinOperatingHours(null, null, LocalTime.of(9, 0)));
    }

    @Test
    void equalStartAndEndStillMeansTwentyFourHourOperation() {
        assertTrue(PosOperatingHoursCalculator.isWithinOperatingHours(LocalTime.of(8, 0), LocalTime.of(8, 0), LocalTime.of(3, 0)));
    }
}
