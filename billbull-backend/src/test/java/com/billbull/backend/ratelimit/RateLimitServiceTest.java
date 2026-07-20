package com.billbull.backend.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * Roadmap Phase 2/4: token-bucket consumption, burst allowance, per-key isolation, and metrics.
 */
class RateLimitServiceTest {

    /** write policy = 120/min, burst 5 (small burst to trip quickly in-test). */
    private RateLimitProperties props() {
        return new RateLimitProperties(
                true, "inmemory", "", false, 1,
                List.of("ADMIN"),
                10, 60, 5, 900, 300,
                60, 100, 300, 100,
                /* write cap */ 120, /* write burst */ 5,
                10, 5, 2);
    }

    @Test
    void burstAllowanceThenRejection() {
        MeterRegistry registry = new SimpleMeterRegistry();
        RateLimitService service = new RateLimitService(props(), registry);

        // Burst = 5: first 5 immediate consumptions pass, the 6th (before any refill) is rejected.
        for (int i = 0; i < 5; i++) {
            assertTrue(service.tryConsume(RateLimitPolicy.WRITE, "u:1").allowed(), "token " + i);
        }
        RateLimitService.Result sixth = service.tryConsume(RateLimitPolicy.WRITE, "u:1");
        assertFalse(sixth.allowed(), "6th consecutive token exhausts the burst");
        assertTrue(sixth.retryAfterSeconds() > 0, "rejection exposes a retry-after");

        // Metrics recorded for both allow and reject.
        assertEquals(5.0, registry.counter("ratelimit.allowed", "policy", "write").count());
        assertEquals(1.0, registry.counter("ratelimit.rejected", "policy", "write").count());
    }

    @Test
    void keysAreIsolated() {
        RateLimitService service = new RateLimitService(props(), new SimpleMeterRegistry());
        // Drain user 1's burst.
        for (int i = 0; i < 5; i++) {
            service.tryConsume(RateLimitPolicy.WRITE, "u:1");
        }
        assertFalse(service.tryConsume(RateLimitPolicy.WRITE, "u:1").allowed());
        // User 2 has an independent bucket.
        assertTrue(service.tryConsume(RateLimitPolicy.WRITE, "u:2").allowed());
    }

    @Test
    void nonePolicyIsAlwaysAllowedAndUnmetered() {
        MeterRegistry registry = new SimpleMeterRegistry();
        RateLimitService service = new RateLimitService(props(), registry);
        RateLimitService.Result r = service.tryConsume(RateLimitPolicy.NONE, "ip:1.2.3.4");
        assertTrue(r.allowed());
        assertEquals(-1, r.limit());
        assertEquals(0.0, registry.counter("ratelimit.allowed", "policy", "none").count());
    }
}
