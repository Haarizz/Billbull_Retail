package com.billbull.backend.purchase.rfq.portal;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * Small in-memory sliding-window limiter for the public vendor-portal endpoints (per IP). Per-link
 * limits (code resend cooldown, sends per hour, wrong guesses) are stored on the vendor row instead,
 * so they survive restarts. Per-JVM state is fine for the single-instance-per-tenant deployment.
 */
@Component
public class RfqPortalRateLimiter {

    private static final int MAX_KEYS = 20_000;

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    /** Records one hit for {@code key}; returns false when more than {@code limit} hits fall inside the window. */
    public boolean tryAcquire(String key, int limit, long windowMillis) {
        long now = System.currentTimeMillis();
        if (hits.size() > MAX_KEYS) {
            prune(now, windowMillis);
        }
        Deque<Long> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > windowMillis) {
                q.pollFirst();
            }
            if (q.size() >= limit) {
                return false;
            }
            q.addLast(now);
            return true;
        }
    }

    private void prune(long now, long windowMillis) {
        hits.entrySet().removeIf(e -> {
            Deque<Long> q = e.getValue();
            synchronized (q) {
                return q.isEmpty() || now - q.peekLast() > windowMillis;
            }
        });
    }
}
