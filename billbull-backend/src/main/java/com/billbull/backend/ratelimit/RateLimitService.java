package com.billbull.backend.ratelimit;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.Refill;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;

/**
 * Owns the Layer-1 token buckets (design §6). One Bucket4j bucket per {@code policy + scopeKey},
 * stored in a Caffeine cache with {@code expireAfterAccess} eviction so idle keys are reclaimed —
 * fixing the unbounded-map growth of the legacy limiter (design §10). All state is in-memory /
 * per-JVM; a Redis-backed variant is deferred to Phase 7.
 *
 * <p>Each policy uses a classic token bucket: capacity tokens refilled greedily over one minute,
 * with the bucket size set to the burst allowance so short spikes (POS scans, imports) pass while
 * the sustained rate is still bounded.
 *
 * <p>The service is algorithmic only — it never decides whether to <em>block</em>. The filter
 * consults {@link RateLimitProperties#isDryRun()} and enforcement flags; this class just reports
 * whether a token was available and how long until the next one, and records metrics either way.
 */
@Service
public class RateLimitService {

    private final RateLimitProperties props;
    private final MeterRegistry meterRegistry;

    /** key = "policyLabel|scopeKey" → bucket. TTL-evicted; capped to bound memory under IP churn. */
    private final Cache<String, Bucket> buckets = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(15))
            .maximumSize(200_000)
            .build();

    public RateLimitService(RateLimitProperties props, MeterRegistry meterRegistry) {
        this.props = props;
        this.meterRegistry = meterRegistry;
    }

    /** Outcome of a single token consumption for a policy+key. */
    public record Result(boolean allowed, long limit, long remaining, long retryAfterSeconds) {
    }

    /**
     * Try to consume one token for {@code policy} scoped to {@code scopeKey}. Always records an
     * allowed/rejected metric (so dry-run collects "would-limit" counts). Returns the probe result;
     * the caller decides enforcement.
     */
    public Result tryConsume(RateLimitPolicy policy, String scopeKey) {
        RateLimitProperties.Policy limits = limitsFor(policy);
        if (limits == null) {
            // NONE / unlimited — treat as always allowed, no bucket, no metric.
            return new Result(true, -1, -1, 0);
        }

        String key = policy.label() + "|" + (scopeKey == null ? "unknown" : scopeKey);
        Bucket bucket = buckets.get(key, k -> newBucket(limits));

        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        long limit = limits.effectiveBurst();
        if (probe.isConsumed()) {
            record(policy, true);
            return new Result(true, limit, probe.getRemainingTokens(), 0);
        }
        long retryAfter = Math.max(1,
                TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()));
        record(policy, false);
        return new Result(false, limit, 0, retryAfter);
    }

    private Bucket newBucket(RateLimitProperties.Policy limits) {
        // capacity tokens per minute, bucket size = burst. greedy refill trickles tokens back
        // continuously rather than in one lump, smoothing the sustained rate.
        int perMinute = Math.max(1, limits.capacity());
        int burst = limits.effectiveBurst();
        Bandwidth bandwidth = Bandwidth.classic(burst, Refill.greedy(perMinute, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(bandwidth).build();
    }

    private RateLimitProperties.Policy limitsFor(RateLimitPolicy policy) {
        return switch (policy) {
            case PUBLIC -> props.getPublicPolicy();
            case READ -> props.getRead();
            case WRITE -> props.getWrite();
            case REPORT -> props.getReport();
            case NONE -> null;
        };
    }

    private void record(RateLimitPolicy policy, boolean allowed) {
        String name = allowed ? "ratelimit.allowed" : "ratelimit.rejected";
        meterRegistry.counter(name, Tags.of("policy", policy.label())).increment();
    }

    /** Test/introspection hook: current number of live buckets (post-eviction estimate). */
    long bucketCount() {
        buckets.cleanUp();
        return buckets.estimatedSize();
    }
}
