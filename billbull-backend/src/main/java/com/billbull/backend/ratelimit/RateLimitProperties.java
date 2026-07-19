package com.billbull.backend.ratelimit;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Bound view of all {@code ratelimit.*} keys (design §5), populated with {@link Value} injection
 * rather than {@code @ConfigurationProperties} relaxed binding — the design mandates a
 * {@code ratelimit.public.*} group, and {@code public} is a Java reserved word that cannot be a
 * field/getter name for the binder to target. Explicit {@code @Value} keeps the exact property
 * names the design specifies.
 *
 * <p>Master switch {@link #enabled} defaults to {@code false}: with it off the generic filter is a
 * no-op and the auth limiter degrades to the legacy per-IP behaviour, byte-identical to before this
 * feature. {@link #dryRun} defaults to {@code true} so that even once enabled, the generic Layer-1
 * limiter counts-but-does-not-block until a tenant flips it off after dry-run tuning (design §11).
 */
@Component
public class RateLimitProperties {

    private final boolean enabled;
    private final String backend;
    private final String redisUrl;
    private final boolean dryRun;
    private final int trustedProxyCount;
    private final Set<String> exemptRolesUpper;

    private final int authIpCapacity;
    private final long authIpWindowSeconds;
    private final int authUserMaxFailures;
    private final long authUserWindowSeconds;
    private final long authLockoutSeconds;

    private final Policy publicPolicy;
    private final Policy read;
    private final Policy write;
    private final Policy report;
    private final int reportMaxConcurrency;

    public RateLimitProperties(
            @Value("${ratelimit.enabled:false}") boolean enabled,
            @Value("${ratelimit.backend:inmemory}") String backend,
            @Value("${ratelimit.redis.url:}") String redisUrl,
            @Value("${ratelimit.dry-run:true}") boolean dryRun,
            @Value("${ratelimit.trusted-proxy-count:1}") int trustedProxyCount,
            @Value("${ratelimit.exempt-roles:ADMIN,SUPER_ADMIN}") List<String> exemptRoles,
            @Value("${ratelimit.auth.login.ip.capacity:10}") int authIpCapacity,
            @Value("${ratelimit.auth.login.ip.window-seconds:60}") long authIpWindowSeconds,
            @Value("${ratelimit.auth.login.user.max-failures:5}") int authUserMaxFailures,
            @Value("${ratelimit.auth.login.user.window-seconds:900}") long authUserWindowSeconds,
            @Value("${ratelimit.auth.login.lockout-seconds:300}") long authLockoutSeconds,
            @Value("${ratelimit.public.capacity:60}") int publicCapacity,
            @Value("${ratelimit.public.burst:100}") int publicBurst,
            @Value("${ratelimit.read.capacity:300}") int readCapacity,
            @Value("${ratelimit.read.burst:100}") int readBurst,
            @Value("${ratelimit.write.capacity:120}") int writeCapacity,
            @Value("${ratelimit.write.burst:40}") int writeBurst,
            @Value("${ratelimit.report.capacity:10}") int reportCapacity,
            @Value("${ratelimit.report.burst:5}") int reportBurst,
            @Value("${ratelimit.report.max-concurrency:2}") int reportMaxConcurrency) {

        this.enabled = enabled;
        this.backend = backend == null ? "inmemory" : backend.trim().toLowerCase(Locale.ROOT);
        this.redisUrl = redisUrl == null ? "" : redisUrl.trim();
        this.dryRun = dryRun;
        this.trustedProxyCount = Math.max(0, trustedProxyCount);
        this.exemptRolesUpper = normaliseRoles(exemptRoles);

        this.authIpCapacity = authIpCapacity;
        this.authIpWindowSeconds = authIpWindowSeconds;
        this.authUserMaxFailures = authUserMaxFailures;
        this.authUserWindowSeconds = authUserWindowSeconds;
        this.authLockoutSeconds = authLockoutSeconds;

        this.publicPolicy = new Policy(publicCapacity, publicBurst);
        this.read = new Policy(readCapacity, readBurst);
        this.write = new Policy(writeCapacity, writeBurst);
        this.report = new Policy(reportCapacity, reportBurst);
        this.reportMaxConcurrency = Math.max(1, reportMaxConcurrency);
    }

    private static Set<String> normaliseRoles(List<String> roles) {
        if (roles == null) {
            return Set.of();
        }
        return roles.stream()
                .filter(r -> r != null && !r.isBlank())
                .map(r -> r.trim().toUpperCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
    }

    /** A sustained-rate + burst token-bucket policy. capacity = tokens refilled per minute. */
    public record Policy(int capacity, int burst) {
        /** Bucket4j needs a non-zero burst floor; fall back to capacity when unset. */
        public int effectiveBurst() {
            return burst > 0 ? burst : Math.max(capacity, 1);
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getBackend() {
        return backend;
    }

    public String getRedisUrl() {
        return redisUrl;
    }

    public boolean isDryRun() {
        return dryRun;
    }

    public int getTrustedProxyCount() {
        return trustedProxyCount;
    }

    public Set<String> exemptRolesUpper() {
        return exemptRolesUpper;
    }

    public boolean isExemptRole(String roleUpper) {
        return roleUpper != null && exemptRolesUpper.contains(roleUpper);
    }

    public int getAuthIpCapacity() {
        return authIpCapacity;
    }

    public long getAuthIpWindowSeconds() {
        return authIpWindowSeconds;
    }

    public int getAuthUserMaxFailures() {
        return authUserMaxFailures;
    }

    public long getAuthUserWindowSeconds() {
        return authUserWindowSeconds;
    }

    public long getAuthLockoutSeconds() {
        return authLockoutSeconds;
    }

    public Policy getPublicPolicy() {
        return publicPolicy;
    }

    public Policy getRead() {
        return read;
    }

    public Policy getWrite() {
        return write;
    }

    public Policy getReport() {
        return report;
    }

    public int getReportMaxConcurrency() {
        return reportMaxConcurrency;
    }
}
