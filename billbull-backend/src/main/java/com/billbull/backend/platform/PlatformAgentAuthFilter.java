package com.billbull.backend.platform;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * Authenticates control-plane calls to {@code /api/platform/**} with an HMAC signature over the
 * method, path, timestamp, nonce and body hash ({@link PlatformSignature}).
 *
 * <ul>
 *   <li>Agent disabled → 404, so an unmanaged tenant looks exactly as before.</li>
 *   <li>Missing/short secret → 503: the agent never runs with a weak key.</li>
 *   <li>Timestamp outside the allowed skew, a reused nonce, or a bad signature → 401.</li>
 * </ul>
 * A tenant JWT is never accepted here — {@code JwtFilter} skips this path, so even a tenant ADMIN
 * cannot reach the platform API. On success the principal is {@code platform-agent} with
 * {@code ROLE_PLATFORM_AGENT}, which {@code SecurityConfig} requires for the path.
 */
@Component
public class PlatformAgentAuthFilter extends OncePerRequestFilter {

    public static final String PATH_PREFIX = "/api/platform/";
    public static final String ROLE = "ROLE_PLATFORM_AGENT";
    /** Request attribute holding the control-plane user named in {@code X-Platform-Actor}. */
    public static final String ACTOR_ATTRIBUTE = "billbull.platform.actor";

    private static final Logger log = LoggerFactory.getLogger(PlatformAgentAuthFilter.class);

    private final PlatformAgentProperties properties;
    private final Cache<String, Boolean> seenNonces;

    public PlatformAgentAuthFilter(PlatformAgentProperties properties) {
        this.properties = properties;
        // Remember every nonce for twice the allowed skew: a replay outside that window already
        // fails the timestamp check.
        this.seenNonces = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(properties.getMaxClockSkewSeconds() * 2))
                .maximumSize(200_000)
                .build();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !isPlatformPath(request);
    }

    public static boolean isPlatformPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && uri.startsWith(context)) {
            uri = uri.substring(context.length());
        }
        return uri.startsWith(PATH_PREFIX) || uri.equals("/api/platform");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!properties.isEnabled()) {
            reject(response, HttpServletResponse.SC_NOT_FOUND, "NOT_FOUND", "Not found");
            return;
        }
        if (!properties.hasUsableSecret()) {
            log.error("Platform agent is enabled but PLATFORM_AGENT_SECRET is missing or shorter than {} characters;"
                    + " refusing every platform call.", PlatformAgentProperties.MIN_SECRET_LENGTH);
            reject(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "AGENT_NOT_CONFIGURED",
                    "Platform agent secret is not configured");
            return;
        }

        String timestamp = request.getHeader(PlatformSignature.HEADER_TIMESTAMP);
        String nonce = request.getHeader(PlatformSignature.HEADER_NONCE);
        String signature = request.getHeader(PlatformSignature.HEADER_SIGNATURE);
        if (isBlank(timestamp) || isBlank(nonce) || isBlank(signature) || nonce.length() > 128) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "SIGNATURE_MISSING", "Signed request required");
            return;
        }

        long ts;
        try {
            ts = Long.parseLong(timestamp.trim());
        } catch (NumberFormatException e) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "SIGNATURE_INVALID", "Bad timestamp");
            return;
        }
        long now = Instant.now().getEpochSecond();
        if (Math.abs(now - ts) > properties.getMaxClockSkewSeconds()) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "SIGNATURE_EXPIRED", "Request timestamp outside allowed window");
            return;
        }

        CachedBodyRequest wrapped = CachedBodyRequest.wrap(request);
        if (wrapped == null) {
            reject(response, HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, "BODY_TOO_LARGE", "Request body too large");
            return;
        }

        String expected = PlatformSignature.sign(properties.getSecret(), request.getMethod(),
                request.getRequestURI(), timestamp.trim(), nonce, wrapped.body());
        if (!PlatformSignature.matches(expected, signature)) {
            log.warn("Rejected platform call {} {} from {}: bad signature", request.getMethod(),
                    request.getRequestURI(), request.getRemoteAddr());
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "SIGNATURE_INVALID", "Bad signature");
            return;
        }
        // Only a correctly signed request may consume a nonce, so garbage can't poison the cache.
        if (seenNonces.asMap().putIfAbsent(nonce, Boolean.TRUE) != null) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "SIGNATURE_REPLAYED", "Nonce already used");
            return;
        }

        String actor = request.getHeader(PlatformSignature.HEADER_ACTOR);
        wrapped.setAttribute(ACTOR_ATTRIBUTE, isBlank(actor) ? "platform" : truncate(actor.trim(), 200));

        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "platform-agent", null, List.of(new SimpleGrantedAuthority(ROLE)));
        SecurityContextHolder.getContext().setAuthentication(auth);
        try {
            chain.doFilter(wrapped, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    static void reject(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message.replace("\"", "'") + "\"}");
    }
}
