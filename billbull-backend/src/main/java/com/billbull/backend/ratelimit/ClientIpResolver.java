package com.billbull.backend.ratelimit;

import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Centralised, trusted-proxy-aware client-IP resolution (design §6 / §9).
 *
 * <p>{@code X-Forwarded-For} is client-controllable: everything up to the first proxy that a client
 * can reach is forgeable. Only the last {@code trustedProxyCount} hops (rightmost entries, appended
 * by our own reverse proxies) are trustworthy. We therefore walk XFF from the right, skipping
 * {@code trustedProxyCount - 1} trusted-proxy entries, and take the next value as the real client —
 * or fall back to the socket peer ({@code getRemoteAddr()}) when XFF is absent, malformed, or when
 * {@code trustedProxyCount == 0} (no proxy in front → ignore XFF entirely).
 *
 * <p>This replaces the three duplicated "first XFF token" resolvers (AuthController, AuditLogService,
 * RequestLoggingFilter), which trusted the <em>left-most</em> value — exactly the attacker-controlled
 * one — and so could be bypassed by rotating the header.
 */
@Component
public class ClientIpResolver {

    private final int trustedProxyCount;

    public ClientIpResolver(RateLimitProperties properties) {
        this.trustedProxyCount = properties.getTrustedProxyCount();
    }

    /** Resolve the effective client IP, honouring the configured trusted-proxy count. */
    public String resolve(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String remoteAddr = request.getRemoteAddr();

        // No proxy in front → the socket peer IS the client; never trust XFF.
        if (trustedProxyCount <= 0) {
            return remoteAddr;
        }

        String xff = request.getHeader("X-Forwarded-For");
        if (xff == null || xff.isBlank()) {
            return remoteAddr;
        }

        String[] hops = xff.split(",");
        // Walk from the right: index (len - trustedProxyCount) is the first hop our trusted
        // proxies did NOT append, i.e. the real client. If the chain is shorter than the trusted
        // count (misconfiguration or spoof attempt), fall back to the socket peer.
        int clientIndex = hops.length - trustedProxyCount;
        if (clientIndex < 0 || clientIndex >= hops.length) {
            return remoteAddr;
        }
        String candidate = hops[clientIndex].trim();
        return candidate.isEmpty() ? remoteAddr : candidate;
    }
}
