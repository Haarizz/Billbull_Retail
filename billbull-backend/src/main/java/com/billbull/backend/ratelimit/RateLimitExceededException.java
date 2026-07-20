package com.billbull.backend.ratelimit;

/**
 * Thrown when a request is rejected by a rate-limit / brute-force policy. Carries the
 * {@code Retry-After} hint (seconds) and the policy that tripped so
 * {@link com.billbull.backend.exception.GlobalExceptionHandler} can emit a uniform 429 with the
 * correct headers (design §8). The {@code policy} is a coarse label (e.g. {@code auth-login},
 * {@code public}, {@code write}) — never a raw IP/username — safe to surface and log.
 */
public class RateLimitExceededException extends RuntimeException {

    private final long retryAfterSeconds;
    private final String policy;

    public RateLimitExceededException(String policy, long retryAfterSeconds, String message) {
        super(message);
        this.policy = policy;
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }

    public String getPolicy() {
        return policy;
    }
}
