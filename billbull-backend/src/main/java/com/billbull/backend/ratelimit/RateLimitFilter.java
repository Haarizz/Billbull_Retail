package com.billbull.backend.ratelimit;

import java.io.IOException;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.billbull.backend.logging.LogContext;
import com.billbull.backend.security.AuditLogService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Layer-1 generic request rate limiter (design §4 Layer 1, roadmap Phases 2–4). Registered
 * <b>after</b> {@link com.billbull.backend.config.JwtFilter} (see SecurityConfig) so the
 * authenticated principal is available for per-user bucket keys.
 *
 * <p>Lifecycle per request:
 * <ol>
 *   <li>If {@code ratelimit.enabled=false} → pure pass-through (byte-identical to pre-feature).</li>
 *   <li>Classify → policy. {@code NONE} (auth/static/non-API) → pass through.</li>
 *   <li>Exempt roles / no-principal-but-user-scoped edge cases → pass through.</li>
 *   <li>Consume a token (+ report-concurrency slot for REPORT). Add {@code X-RateLimit-*} headers.</li>
 *   <li>If a token was unavailable:
 *     <ul>
 *       <li><b>dry-run</b> (default while rolling out): log "would-limit", block nothing.</li>
 *       <li><b>enforce</b>: write a 429 with {@code Retry-After} and stop the chain.</li>
 *     </ul>
 *   </li>
 * </ol>
 *
 * <p>Because filters run outside {@code @RestControllerAdvice}, the 429 is written directly here in a
 * shape that matches {@link com.billbull.backend.exception.GlobalExceptionHandler}'s envelope.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    private final RateLimitProperties props;
    private final RateLimitPolicyResolver policyResolver;
    private final RateLimitService rateLimitService;
    private final ReportConcurrencyGuard reportConcurrencyGuard;
    private final ClientIpResolver clientIpResolver;
    private final AuditLogService auditLogService;

    public RateLimitFilter(
            RateLimitProperties props,
            RateLimitPolicyResolver policyResolver,
            RateLimitService rateLimitService,
            ReportConcurrencyGuard reportConcurrencyGuard,
            ClientIpResolver clientIpResolver,
            AuditLogService auditLogService) {
        this.props = props;
        this.policyResolver = policyResolver;
        this.rateLimitService = rateLimitService;
        this.reportConcurrencyGuard = reportConcurrencyGuard;
        this.clientIpResolver = clientIpResolver;
        this.auditLogService = auditLogService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        if (!props.isEnabled()) {
            filterChain.doFilter(request, response);
            return;
        }

        RateLimitPolicy policy = policyResolver.resolve(request);
        if (!policy.isLimited() || isExempt(policy)) {
            filterChain.doFilter(request, response);
            return;
        }

        String scopeKey = scopeKey(policy, request);
        RateLimitService.Result result = rateLimitService.tryConsume(policy, scopeKey);

        // Informational headers on every limited response (design §4.4, §8).
        if (result.limit() >= 0) {
            response.setHeader("X-RateLimit-Limit", String.valueOf(result.limit()));
            response.setHeader("X-RateLimit-Remaining", String.valueOf(Math.max(0, result.remaining())));
        }

        boolean overLimit = !result.allowed();

        // REPORT also enforces a concurrency cap. Acquire only when the rate check passed AND we are
        // actually enforcing (dry-run must not hold real permits / affect live traffic).
        boolean acquiredReportSlot = false;
        long reportRetryAfter = 0;
        if (policy == RateLimitPolicy.REPORT && !overLimit && !props.isDryRun()) {
            acquiredReportSlot = reportConcurrencyGuard.tryAcquire(scopeKey);
            if (!acquiredReportSlot) {
                overLimit = true;
                reportRetryAfter = 5; // short backoff; the caller should retry shortly
            }
        }

        if (overLimit) {
            long retryAfter = reportRetryAfter > 0 ? reportRetryAfter : result.retryAfterSeconds();
            if (props.isDryRun()) {
                log.info("RATELIMIT_DRYRUN would-limit policy={} key={} path={} retryAfter={}s",
                        policy.label(), hashedKey(policy, scopeKey), request.getRequestURI(), retryAfter);
                // Dry-run blocks nothing — fall through to the chain.
            } else {
                reject(request, response, policy, scopeKey, retryAfter);
                return;
            }
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            if (acquiredReportSlot) {
                reportConcurrencyGuard.release(scopeKey);
            }
        }
    }

    // ── policy helpers ─────────────────────────────────────────────────────────

    /** A caller whose authorities include any configured exempt role bypasses Layer-1 limits. */
    private boolean isExempt(RateLimitPolicy policy) {
        if (props.exemptRolesUpper().isEmpty()) {
            return false;
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return false;
        }
        for (var authority : auth.getAuthorities()) {
            String a = authority.getAuthority();
            if (a == null) {
                continue;
            }
            String role = a.startsWith("ROLE_") ? a.substring(5) : a;
            if (props.isExemptRole(role.toUpperCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Per-user key when authenticated (userId from LogContext/principal), else client IP. Falls back
     * to IP for user-scoped policies with no principal — an unauthenticated request to an
     * authenticated route (it will 401 downstream anyway, but we still bound it cheaply).
     */
    private String scopeKey(RateLimitPolicy policy, HttpServletRequest request) {
        if (policy.scopeKind() == RateLimitPolicy.ScopeKind.USER) {
            Long userId = LogContext.getLong(LogContext.USER_ID);
            if (userId != null) {
                return "u:" + userId;
            }
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && auth.getName() != null) {
                return "u:" + auth.getName();
            }
        }
        return "ip:" + clientIpResolver.resolve(request);
    }

    /** Hashed key for logs/metrics — never emit a raw IP or username (design §12). */
    private String hashedKey(RateLimitPolicy policy, String scopeKey) {
        return policy.label() + ":" + Integer.toHexString((scopeKey == null ? "" : scopeKey).hashCode());
    }

    // ── rejection ──────────────────────────────────────────────────────────────

    private void reject(HttpServletRequest request, HttpServletResponse response,
            RateLimitPolicy policy, String scopeKey, long retryAfter) throws IOException {

        String requestId = LogContext.get(LogContext.REQUEST_ID);
        log.warn("RATELIMIT_REJECT policy={} key={} path={} retryAfter={}s requestId={}",
                policy.label(), hashedKey(policy, scopeKey), request.getRequestURI(), retryAfter, requestId);

        // Forensic trail for the security audit log (best-effort; must never break the response).
        try {
            auditLogService.logDeniedAccess(
                    currentUsername(),
                    request.getRequestURI(),
                    request.getMethod(),
                    "RATE_LIMITED:" + policy.label(),
                    request);
        } catch (Exception ex) {
            log.debug("Rate-limit audit logging failed", ex);
        }

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfter));
        response.setHeader("X-RateLimit-Policy", policy.label());

        String body = "{"
                + "\"code\":\"RATE_LIMITED\","
                + "\"policy\":\"" + policy.label() + "\","
                + "\"message\":\"Too many requests. Please slow down and try again shortly.\","
                + "\"retryAfterSeconds\":" + retryAfter + ","
                + "\"requestId\":\"" + (requestId == null ? "" : requestId) + "\""
                + "}";
        response.getWriter().write(body);
    }

    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && auth.getName() != null) {
            return auth.getName();
        }
        return "ANONYMOUS";
    }
}
