package com.billbull.backend.pos.businessdate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves the property the whole Business Day timezone fix rests on: the Business Day
 * clock is decoupled from the JVM default timezone, and each tenant resolves to its own
 * zone.
 *
 * <p>These assertions are deliberately host-independent — they compare the clock's reading
 * against an explicitly-zoned reference rather than against "now" as the host sees it, so
 * the suite behaves identically on a UTC CI box and on an IST developer machine.
 */
class BusinessDayClockZoneTest {

    /** Two readings taken microseconds apart are equal for our purposes; allow a slack
     *  window far smaller than any zone offset we care about distinguishing. */
    private static final Duration SLACK = Duration.ofSeconds(5);

    private static void assertSameInstantWallClock(LocalDateTime actual, LocalDateTime expected) {
        assertTrue(Duration.between(expected, actual).abs().compareTo(SLACK) < 0,
                "expected ~" + expected + " but was " + actual);
    }

    @Test
    @DisplayName("India tenant resolves to Asia/Kolkata and reads that zone's wall clock")
    void indiaTenantResolvesToKolkata() {
        BusinessDayClock clock = new BusinessDayClock("Asia/Kolkata");
        assertEquals(ZoneId.of("Asia/Kolkata"), clock.zone());
        assertSameInstantWallClock(clock.now(), LocalDateTime.now(ZoneId.of("Asia/Kolkata")));
    }

    @Test
    @DisplayName("UAE tenant resolves to Asia/Dubai and never inherits the India zone")
    void uaeTenantResolvesToDubai() {
        BusinessDayClock clock = new BusinessDayClock("Asia/Dubai");
        assertEquals(ZoneId.of("Asia/Dubai"), clock.zone());
        assertSameInstantWallClock(clock.now(), LocalDateTime.now(ZoneId.of("Asia/Dubai")));
    }

    @Test
    @DisplayName("Business Day timezone is independent of the JVM timezone (UTC host, Asia/Kolkata business day)")
    void businessDayZoneIsIndependentOfJvmZone() {
        // The scenario the fix exists for: a host in UTC serving an Asia/Kolkata tenant.
        // The clock must read IST wall time, i.e. exactly +5h30m ahead of UTC wall time —
        // which is precisely the error a stray LocalDateTime.now() would introduce.
        BusinessDayClock kolkata = new BusinessDayClock("Asia/Kolkata");
        LocalDateTime utcWall = LocalDateTime.now(ZoneOffset.UTC);
        Duration delta = Duration.between(utcWall, kolkata.now());
        assertTrue(delta.minus(Duration.ofMinutes(330)).abs().compareTo(SLACK) < 0,
                "Asia/Kolkata business-day wall clock must be UTC+05:30, was offset by " + delta);
    }

    @Test
    @DisplayName("India and UAE clocks disagree by their real offset — one tenant can never read the other's day")
    void indiaAndUaeClocksAreDistinct() {
        Duration delta = Duration.between(
                new BusinessDayClock("Asia/Dubai").now(),
                new BusinessDayClock("Asia/Kolkata").now());
        assertTrue(delta.minus(Duration.ofMinutes(90)).abs().compareTo(SLACK) < 0,
                "Asia/Kolkata must lead Asia/Dubai by 90 minutes, was " + delta);
    }

    @Test
    @DisplayName("A blank or unresolvable zone fails fast rather than falling back silently")
    void invalidZoneFailsFast() {
        assertThrows(IllegalStateException.class, () -> new BusinessDayClock("  "));
        assertThrows(IllegalStateException.class, () -> new BusinessDayClock(null));
        assertThrows(IllegalStateException.class, () -> new BusinessDayClock("Asia/Nowhere"));
    }
}
