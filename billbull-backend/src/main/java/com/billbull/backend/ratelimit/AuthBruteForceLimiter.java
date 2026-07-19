package com.billbull.backend.ratelimit;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * Layer-2 brute-force / credential-stuffing protection for authentication (design §4 Layer 2,
 * roadmap Phase 1). Supersedes the legacy {@link com.billbull.backend.security.LoginRateLimiter}
 * when {@code ratelimit.enabled=true}.
 *
 * <p>Two independent keys are tracked, per the golden rule "username AND IP, never IP alone":
 * <ul>
 *   <li><b>Per-IP</b> — a sliding-window request cap (default 10/60s). Coarse volumetric guard;
 *       exceeding it locks the IP for {@code lockoutSeconds}. Keyed on IP alone this would NAT-lock a
 *       whole branch, which is why the username track exists alongside it.</li>
 *   <li><b>Per-username</b> — a failed-attempt cap (default 5/900s) that locks that <em>account</em>
 *       for {@code lockoutSeconds}, defending against distributed low-and-slow attacks spread across
 *       many IPs. A single success does <b>not</b> fully clear this counter (it decrements by one),
 *       closing the classic "interleave a known-good credential to reset the bucket" weakness.</li>
 * </ul>
 *
 * <p>Buckets live in Caffeine caches with {@code expireAfterAccess} eviction, fixing the unbounded
 * {@code ConcurrentHashMap} growth of the old limiter. All state is in-memory / per-JVM — correct for
 * single-instance-per-tenant; a Redis-backed variant is deferred to Phase 7.
 *
 * <p>Responses must stay generic (never reveal whether the username exists) — the caller decides the
 * message; this class only answers allow/deny and how long to wait.
 */
@Component
public class AuthBruteForceLimiter {

    private static final Logger log = LoggerFactory.getLogger(AuthBruteForceLimiter.class);

    private final RateLimitProperties props;

    /** Per-IP sliding window of login attempts (success or failure both count toward the volumetric cap). */
    private final Cache<String, AtomicReference<Window>> ipWindows;
    /** Per-username failed-attempt window. */
    private final Cache<String, AtomicReference<Window>> userFailures;

    public AuthBruteForceLimiter(RateLimitProperties props) {
        this.props = props;
        // Retain buckets a generous margin past their window/lockout so an in-flight attacker's
        // state is never dropped mid-window, but stale entries still evict (no unbounded growth).
        long ipRetain = Math.max(props.getAuthIpWindowSeconds(), props.getAuthLockoutSeconds()) + 60;
        long userRetain = Math.max(props.getAuthUserWindowSeconds(), props.getAuthLockoutSeconds()) + 60;
        this.ipWindows = Caffeine.newBuilder()
                .expireAfterAccess(Duration.ofSeconds(ipRetain))
                .maximumSize(100_000)
                .build();
        this.userFailures = Caffeine.newBuilder()
                .expireAfterAccess(Duration.ofSeconds(userRetain))
                .maximumSize(100_000)
                .build();
    }

    /**
     * Outcome of a pre-credential-check gate. {@link #allowed()} false means reject with 429;
     * {@link #retryAfterSeconds()} feeds the {@code Retry-After} header.
     */
    public record Decision(boolean allowed, long retryAfterSeconds, String reason) {
        static Decision allow() {
            return new Decision(true, 0, null);
        }

        static Decision deny(long retryAfter, String reason) {
            return new Decision(false, Math.max(1, retryAfter), reason);
        }
    }

    /**
     * Gate called BEFORE credential validation. Consumes one slot from the per-IP window and checks
     * both the IP lockout and the username lockout. Does not itself record a failure — call
     * {@link #recordFailure} after credentials are found invalid.
     */
    public Decision check(String ip, String username) {
        Instant now = Instant.now();

        // ── username lockout (checked first: an account under attack should not even consume IP budget confusingly) ──
        String userKey = normUser(username);
        if (userKey != null) {
            Window uf = snapshot(userFailures, userKey);
            if (uf != null && uf.isLocked(now)) {
                long wait = uf.secondsUntilUnlock(now);
                return Decision.deny(wait, "username-locked");
            }
        }

        // ── per-IP volumetric window ──
        AtomicReference<Window> ref = ipWindows.get(safeIp(ip), k -> new AtomicReference<>(null));
        long lockoutSeconds = props.getAuthLockoutSeconds();
        long windowSeconds = props.getAuthIpWindowSeconds();
        int cap = props.getAuthIpCapacity();

        Window updated = ref.updateAndGet(current -> {
            if (current != null && current.isLocked(now)) {
                return current; // stay locked; count untouched
            }
            if (current == null || current.isExpired(now, windowSeconds)) {
                return Window.fresh(now); // new window, count = 1
            }
            int next = current.count() + 1;
            if (next > cap) {
                return current.locked(now.plusSeconds(lockoutSeconds), next);
            }
            return current.withCount(next);
        });

        if (updated.isLocked(now)) {
            long wait = updated.secondsUntilUnlock(now);
            return Decision.deny(wait, "ip-locked");
        }
        return Decision.allow();
    }

    /**
     * Record a failed credential check. Increments the per-username failure window; locks the
     * account once {@code max-failures} is reached within the window.
     */
    public void recordFailure(String ip, String username) {
        String userKey = normUser(username);
        if (userKey == null) {
            return;
        }
        Instant now = Instant.now();
        long windowSeconds = props.getAuthUserWindowSeconds();
        long lockoutSeconds = props.getAuthLockoutSeconds();
        int maxFailures = props.getAuthUserMaxFailures();

        AtomicReference<Window> ref = userFailures.get(userKey, k -> new AtomicReference<>(null));
        Window updated = ref.updateAndGet(current -> {
            if (current != null && current.isLocked(now)) {
                return current; // already locked; keep the lock
            }
            if (current == null || current.isExpired(now, windowSeconds)) {
                return Window.fresh(now);
            }
            int next = current.count() + 1;
            if (next >= maxFailures) {
                return current.locked(now.plusSeconds(lockoutSeconds), next);
            }
            return current.withCount(next);
        });
        if (updated.isLocked(now)) {
            log.warn("Auth brute-force lockout: username failures reached threshold (retryAfter={}s)",
                    updated.secondsUntilUnlock(now));
        }
    }

    /**
     * Record a successful login. Clears the per-IP window entirely (a legitimate user should not be
     * throttled), but only <b>decrements</b> the per-username failure counter — a single success from
     * one context must not wipe an ongoing distributed attack's progress against that account.
     */
    public void recordSuccess(String ip, String username) {
        ipWindows.invalidate(safeIp(ip));

        String userKey = normUser(username);
        if (userKey == null) {
            return;
        }
        AtomicReference<Window> ref = userFailures.getIfPresent(userKey);
        if (ref == null) {
            return;
        }
        Instant now = Instant.now();
        ref.updateAndGet(current -> {
            if (current == null || current.isLocked(now)) {
                return current; // do not release an active lockout on a stray success
            }
            int next = current.count() - 1;
            return next <= 0 ? null : current.withCount(next);
        });
        if (ref.get() == null) {
            userFailures.invalidate(userKey);
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static Window snapshot(Cache<String, AtomicReference<Window>> cache, String key) {
        AtomicReference<Window> ref = cache.getIfPresent(key);
        return ref == null ? null : ref.get();
    }

    private static String normUser(String username) {
        if (username == null) {
            return null;
        }
        String t = username.trim().toLowerCase(Locale.ROOT);
        return t.isEmpty() ? null : t;
    }

    private static String safeIp(String ip) {
        return ip == null || ip.isBlank() ? "unknown" : ip.trim();
    }

    /**
     * Immutable window state: a running {@code count} since {@code windowStart}, plus an optional
     * {@code lockedUntil}. Copy-on-write so the enclosing {@link AtomicReference} update is atomic.
     */
    private record Window(int count, Instant windowStart, Instant lockedUntil) {
        static Window fresh(Instant now) {
            return new Window(1, now, null);
        }

        Window withCount(int newCount) {
            return new Window(newCount, windowStart, null);
        }

        Window locked(Instant until, int newCount) {
            return new Window(newCount, windowStart, until);
        }

        boolean isExpired(Instant now, long windowSeconds) {
            return now.isAfter(windowStart.plusSeconds(windowSeconds));
        }

        boolean isLocked(Instant now) {
            return lockedUntil != null && now.isBefore(lockedUntil);
        }

        long secondsUntilUnlock(Instant now) {
            if (lockedUntil == null) {
                return 0;
            }
            long secs = Duration.between(now, lockedUntil).getSeconds();
            return Math.max(1, secs);
        }
    }
}
