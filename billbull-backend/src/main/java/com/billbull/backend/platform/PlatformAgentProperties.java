package com.billbull.backend.platform;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Settings for the platform agent: the small, signed API under {@code /api/platform/**} that the
 * control plane (admin.billbull.app) calls.
 *
 * <p>Off by default. A tenant joins the control plane by setting, in its service environment
 * ({@code /etc/billbull/<client>.env}), never in a properties file:
 * <pre>
 *   BILLBULL_PLATFORM_AGENT_ENABLED=true
 *   PLATFORM_AGENT_SECRET=&lt;the per-tenant secret the control plane showed once&gt;
 * </pre>
 * The secret must be at least {@link #MIN_SECRET_LENGTH} characters; a shorter one keeps the
 * agent refusing every call rather than accepting a weak key.
 */
@Component
public class PlatformAgentProperties {

    public static final int MIN_SECRET_LENGTH = 32;

    private final boolean enabled;
    private final String secret;
    private final long maxClockSkewSeconds;
    private final boolean supportAccessEnabled;
    private final String supportUsername;
    private final int supportMaxMinutes;

    public PlatformAgentProperties(
            @Value("${billbull.platform.agent.enabled:false}") boolean enabled,
            @Value("${PLATFORM_AGENT_SECRET:}") String secret,
            @Value("${billbull.platform.agent.max-clock-skew-seconds:300}") long maxClockSkewSeconds,
            @Value("${billbull.platform.support-access.enabled:false}") boolean supportAccessEnabled,
            @Value("${billbull.platform.support-access.username:platform.support}") String supportUsername,
            @Value("${billbull.platform.support-access.max-minutes:60}") int supportMaxMinutes) {
        this.enabled = enabled;
        this.secret = secret == null ? "" : secret.trim();
        this.maxClockSkewSeconds = Math.max(30, maxClockSkewSeconds);
        this.supportAccessEnabled = supportAccessEnabled;
        this.supportUsername = supportUsername == null ? "platform.support" : supportUsername.trim();
        this.supportMaxMinutes = Math.min(240, Math.max(5, supportMaxMinutes));
    }

    public boolean isEnabled() { return enabled; }
    public String getSecret() { return secret; }
    public boolean hasUsableSecret() { return secret.length() >= MIN_SECRET_LENGTH; }
    public long getMaxClockSkewSeconds() { return maxClockSkewSeconds; }
    public boolean isSupportAccessEnabled() { return supportAccessEnabled; }
    public String getSupportUsername() { return supportUsername; }
    public int getSupportMaxMinutes() { return supportMaxMinutes; }
}
