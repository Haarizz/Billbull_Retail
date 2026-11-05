package com.billbull.backend.pos.pinlogin;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Wrong-PIN lockout. A 4-digit PIN has only 10,000 values, so guessing must stop early:
 * <ul>
 *   <li>per employee on a till: {@value #EMPLOYEE_MAX_FAILURES} wrong PINs lock that person on
 *       that till for {@link #EMPLOYEE_LOCK};</li>
 *   <li>per till: {@value #DEVICE_MAX_FAILURES} wrong PINs across everyone lock PIN sign-in on
 *       the till for {@link #DEVICE_LOCK} (stops cycling through staff).</li>
 * </ul>
 * A correct PIN clears the employee counter. Counters are in memory: one backend serves one
 * tenant, and a restart only gives an attacker a fresh, still tiny, budget.
 */
@Component
public class PosPinAttemptLimiter {

    static final int EMPLOYEE_MAX_FAILURES = 5;
    static final Duration EMPLOYEE_LOCK = Duration.ofMinutes(5);
    static final int DEVICE_MAX_FAILURES = 20;
    static final Duration DEVICE_LOCK = Duration.ofMinutes(15);

    private final Clock clock;
    private final ConcurrentHashMap<String, Counter> counters = new ConcurrentHashMap<>();

    @Autowired
    public PosPinAttemptLimiter() {
        this(Clock.systemUTC());
    }

    PosPinAttemptLimiter(Clock clock) {
        this.clock = clock;
    }

    /** Seconds until this employee may try again on this till; 0 when allowed now. */
    public long secondsUntilAllowed(long deviceId, long employeeId) {
        Instant now = clock.instant();
        return Math.max(lockedFor(deviceKey(deviceId), now), lockedFor(employeeKey(deviceId, employeeId), now));
    }

    public void recordFailure(long deviceId, long employeeId) {
        Instant now = clock.instant();
        bump(employeeKey(deviceId, employeeId), EMPLOYEE_MAX_FAILURES, EMPLOYEE_LOCK, now);
        bump(deviceKey(deviceId), DEVICE_MAX_FAILURES, DEVICE_LOCK, now);
    }

    public void recordSuccess(long deviceId, long employeeId) {
        counters.remove(employeeKey(deviceId, employeeId));
    }

    private long lockedFor(String key, Instant now) {
        Counter c = counters.get(key);
        if (c == null || c.lockedUntil == null || !now.isBefore(c.lockedUntil)) {
            return 0;
        }
        return Math.max(1, Duration.between(now, c.lockedUntil).toSeconds());
    }

    private void bump(String key, int max, Duration lock, Instant now) {
        counters.compute(key, (k, c) -> {
            // A lock that has run out starts a fresh window; failures before it don't carry over.
            if (c == null || (c.lockedUntil != null && !now.isBefore(c.lockedUntil))
                    || (c.lockedUntil == null && now.isAfter(c.windowStart.plus(lock)))) {
                c = new Counter(now);
            }
            c.failures++;
            if (c.failures >= max) {
                c.lockedUntil = now.plus(lock);
            }
            return c;
        });
    }

    private static String employeeKey(long deviceId, long employeeId) {
        return "d" + deviceId + ":e" + employeeId;
    }

    private static String deviceKey(long deviceId) {
        return "d" + deviceId;
    }

    private static final class Counter {
        private final Instant windowStart;
        private int failures;
        private Instant lockedUntil;

        private Counter(Instant windowStart) {
            this.windowStart = windowStart;
        }
    }
}
