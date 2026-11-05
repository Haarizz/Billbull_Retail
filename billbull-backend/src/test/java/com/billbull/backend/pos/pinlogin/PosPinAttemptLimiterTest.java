package com.billbull.backend.pos.pinlogin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class PosPinAttemptLimiterTest {

    private final MutableClock clock = new MutableClock();
    private final PosPinAttemptLimiter limiter = new PosPinAttemptLimiter(clock);

    @Test
    void locksAnEmployeeOnATillAfterFiveWrongPins() {
        for (int i = 0; i < PosPinAttemptLimiter.EMPLOYEE_MAX_FAILURES - 1; i++) {
            limiter.recordFailure(1, 10);
        }
        assertEquals(0, limiter.secondsUntilAllowed(1, 10));

        limiter.recordFailure(1, 10);

        assertEquals(300, limiter.secondsUntilAllowed(1, 10));
        assertEquals(0, limiter.secondsUntilAllowed(1, 11), "other staff on the till are unaffected");
        assertEquals(0, limiter.secondsUntilAllowed(2, 10), "the same person on another till is unaffected");

        clock.advance(PosPinAttemptLimiter.EMPLOYEE_LOCK);
        assertEquals(0, limiter.secondsUntilAllowed(1, 10));
    }

    @Test
    void aCorrectPinClearsTheEmployeeCount() {
        for (int i = 0; i < PosPinAttemptLimiter.EMPLOYEE_MAX_FAILURES - 1; i++) {
            limiter.recordFailure(1, 10);
        }
        limiter.recordSuccess(1, 10);
        limiter.recordFailure(1, 10);

        assertEquals(0, limiter.secondsUntilAllowed(1, 10));
    }

    @Test
    void locksTheWholeTillWhenGuessesAreSpreadAcrossStaff() {
        for (int i = 0; i < PosPinAttemptLimiter.DEVICE_MAX_FAILURES; i++) {
            limiter.recordFailure(1, 100 + (i % 4)); // 4 people, below each person's own limit... mostly
        }

        assertTrue(limiter.secondsUntilAllowed(1, 999) > 0, "even someone who never failed must wait");
        assertEquals(0, limiter.secondsUntilAllowed(2, 999));
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-04T10:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }
}
