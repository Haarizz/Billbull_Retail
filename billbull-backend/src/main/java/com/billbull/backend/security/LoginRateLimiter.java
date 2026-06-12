package com.billbull.backend.security;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory sliding-window rate limiter for login attempts.
 * Allows up to MAX_ATTEMPTS per IP within WINDOW_SECONDS.
 * Locks the IP for LOCKOUT_SECONDS after too many failures.
 */
@Component
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 10;
    private static final long WINDOW_SECONDS = 60;
    private static final long LOCKOUT_SECONDS = 300; // 5 minutes

    private record Bucket(int count, Instant windowStart, Instant lockedUntil) {}

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * Returns true if this IP is allowed to attempt login; false if rate-limited.
     * Call this BEFORE credential validation.
     */
    public boolean isAllowed(String ip) {
        Instant now = Instant.now();
        Bucket bucket = buckets.get(ip);

        if (bucket != null && bucket.lockedUntil() != null && now.isBefore(bucket.lockedUntil())) {
            return false; // still locked out
        }

        if (bucket == null || now.isAfter(bucket.windowStart().plusSeconds(WINDOW_SECONDS))) {
            // New window
            buckets.put(ip, new Bucket(1, now, null));
            return true;
        }

        int newCount = bucket.count() + 1;
        if (newCount > MAX_ATTEMPTS) {
            buckets.put(ip, new Bucket(newCount, bucket.windowStart(), now.plusSeconds(LOCKOUT_SECONDS)));
            return false;
        }

        buckets.put(ip, new Bucket(newCount, bucket.windowStart(), null));
        return true;
    }

    /** Call after a successful login to reset the counter for this IP. */
    public void recordSuccess(String ip) {
        buckets.remove(ip);
    }
}
