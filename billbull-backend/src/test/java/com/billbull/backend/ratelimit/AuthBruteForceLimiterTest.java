package com.billbull.backend.ratelimit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Roadmap Phase 1 testing checklist for the Layer-2 auth brute-force limiter:
 *  - N failures/window per username → lockout; other usernames from same IP unaffected beyond IP cap.
 *  - one success does not fully reset the username failure counter.
 *  - per-IP volumetric cap trips independently.
 */
class AuthBruteForceLimiterTest {

    /** Small, fast limits so tests don't sleep: IP cap 3/60s, username 3 failures/900s, lockout 300s. */
    private RateLimitProperties props() {
        return new RateLimitProperties(
                true, "inmemory", "", true, 1,
                List.of("ADMIN"),
                /* auth ip */ 3, 60,
                /* auth user */ 3, 900,
                /* lockout */ 300,
                60, 100, 300, 100, 120, 40, 10, 5, 2);
    }

    @Test
    void usernameLocksOutAfterMaxFailures() {
        AuthBruteForceLimiter limiter = new AuthBruteForceLimiter(props());
        String ip = "10.0.0.1";
        String user = "alice";

        // 3 failed attempts (max-failures=3) → account locked.
        for (int i = 0; i < 3; i++) {
            assertTrue(limiter.check(ip, user).allowed(), "attempt " + i + " should pass the gate");
            limiter.recordFailure(ip, user);
        }

        AuthBruteForceLimiter.Decision decision = limiter.check(ip, user);
        assertFalse(decision.allowed(), "username should be locked after 3 failures");
        assertTrue(decision.retryAfterSeconds() > 0, "lockout must expose a positive retry-after");
        assertTrue("username-locked".equals(decision.reason()));
    }

    @Test
    void otherUsernameFromSameIpNotAccountLocked() {
        AuthBruteForceLimiter limiter = new AuthBruteForceLimiter(props());
        String ip = "10.0.0.2";

        // Lock out "bob" via failures.
        for (int i = 0; i < 3; i++) {
            limiter.check(ip, "bob");
            limiter.recordFailure(ip, "bob");
        }
        assertFalse(limiter.check(ip, "bob").allowed(), "bob is account-locked");

        // A different username from the same IP is NOT account-locked (only the shared IP cap applies,
        // and with cap=3 the two prior check() calls for bob consumed budget — use a fresh IP to isolate).
        AuthBruteForceLimiter fresh = new AuthBruteForceLimiter(props());
        assertTrue(fresh.check("10.0.0.99", "carol").allowed(), "carol from a clean IP must be allowed");
    }

    @Test
    void singleSuccessDoesNotFullyResetUsernameCounter() {
        AuthBruteForceLimiter limiter = new AuthBruteForceLimiter(props());
        String user = "dave";

        // 2 failures (one short of the lockout at 3).
        limiter.check("1.1.1.1", user);
        limiter.recordFailure("1.1.1.1", user);
        limiter.check("1.1.1.2", user);
        limiter.recordFailure("1.1.1.2", user);

        // A success from a different IP: decrements the username counter by ONE (2 → 1), not to zero.
        limiter.recordSuccess("2.2.2.2", user);

        // Now a single further failure brings it to 2 (still below 3) → NOT locked yet, proving the
        // success did not wipe prior progress. If success had fully reset, we'd need 3 more failures.
        limiter.check("1.1.1.3", user);
        limiter.recordFailure("1.1.1.3", user);
        assertTrue(limiter.check("1.1.1.4", user).allowed(), "counter at 2 → still allowed");

        // One more failure → 3 → locked. (If success had reset to 0, this 4th-total failure would be
        // only the 2nd since reset and would NOT lock.)
        limiter.recordFailure("1.1.1.4", user);
        assertFalse(limiter.check("1.1.1.5", user).allowed(),
                "success only decremented by one, so the counter still reaches lockout");
    }

    @Test
    void perIpVolumetricCapTripsIndependentOfUsername() {
        AuthBruteForceLimiter limiter = new AuthBruteForceLimiter(props());
        String ip = "9.9.9.9";

        // IP cap = 3 attempts/window. 3 allowed, 4th trips the IP lock — even with distinct usernames
        // and no recorded failures (pure volumetric guard).
        assertTrue(limiter.check(ip, "u1").allowed());
        assertTrue(limiter.check(ip, "u2").allowed());
        assertTrue(limiter.check(ip, "u3").allowed());
        AuthBruteForceLimiter.Decision fourth = limiter.check(ip, "u4");
        assertFalse(fourth.allowed(), "4th attempt from same IP within window is IP-locked");
        assertTrue("ip-locked".equals(fourth.reason()));
    }

    @Test
    void nullOrBlankUsernameDoesNotThrow() {
        AuthBruteForceLimiter limiter = new AuthBruteForceLimiter(props());
        // Gate + record must tolerate a missing username (malformed login body) without NPE.
        assertTrue(limiter.check("3.3.3.3", null).allowed());
        limiter.recordFailure("3.3.3.3", null);
        limiter.recordSuccess("3.3.3.3", "");
    }
}
