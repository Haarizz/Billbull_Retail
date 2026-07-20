package com.billbull.backend.ratelimit;

import java.time.Duration;
import java.util.concurrent.Semaphore;

import org.springframework.stereotype.Component;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * Per-user concurrency cap for heavy report/export endpoints (design §4 {@code report-export},
 * §10). Rate limits bound requests-over-time; a concurrency cap bounds simultaneous in-flight heavy
 * work — the more valuable protection for Playwright/POI export machinery, which can exhaust memory
 * and DB connections if many large exports run at once (ties to future-enhancements Topic 07).
 *
 * <p>Each scope key gets a {@link Semaphore} with {@code max-concurrency} permits, held in a
 * TTL-evicting Caffeine cache. A caller {@link #tryAcquire}s before the export and must
 * {@link #release} in a finally block. Non-blocking: if no permit is free the request is rejected
 * (429) rather than queued, keeping the response fast and back-pressure explicit.
 */
@Component
public class ReportConcurrencyGuard {

    private final int maxConcurrency;

    private final Cache<String, Semaphore> semaphores = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(30))
            .maximumSize(50_000)
            .build();

    public ReportConcurrencyGuard(RateLimitProperties props) {
        this.maxConcurrency = Math.max(1, props.getReportMaxConcurrency());
    }

    /** Try to reserve a slot for {@code scopeKey}. Returns false if all permits are in use. */
    public boolean tryAcquire(String scopeKey) {
        Semaphore sem = semaphores.get(safe(scopeKey), k -> new Semaphore(maxConcurrency));
        return sem.tryAcquire();
    }

    /** Release a previously acquired slot. Safe to call only after a successful {@link #tryAcquire}. */
    public void release(String scopeKey) {
        Semaphore sem = semaphores.getIfPresent(safe(scopeKey));
        if (sem != null) {
            // Guard against over-release inflating permits beyond the cap.
            if (sem.availablePermits() < maxConcurrency) {
                sem.release();
            }
        }
    }

    private static String safe(String scopeKey) {
        return scopeKey == null || scopeKey.isBlank() ? "unknown" : scopeKey;
    }
}
