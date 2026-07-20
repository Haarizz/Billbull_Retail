package com.billbull.backend.ratelimit;

import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Maps a request (path + method + principal) to a {@link RateLimitPolicy} (design §4, §6). Kept
 * deliberately cheap — it runs on every request: a shared {@link AntPathMatcher} and a short list of
 * precompiled prefix checks, no per-request regex compilation (design §10).
 *
 * <p>Classification order:
 * <ol>
 *   <li>Non-API and static paths → {@link RateLimitPolicy#NONE}.</li>
 *   <li>{@code /api/auth/**} → {@code NONE} (Layer-2 {@link AuthBruteForceLimiter} owns auth).</li>
 *   <li>{@code /api/client-logs/**} (unauthenticated permitAll) → {@link RateLimitPolicy#PUBLIC}.</li>
 *   <li>Heavy report/export/document paths → {@link RateLimitPolicy#REPORT}.</li>
 *   <li>Everything else: GET → {@link RateLimitPolicy#READ}; mutating verbs → {@link RateLimitPolicy#WRITE}.</li>
 * </ol>
 */
@Component
public class RateLimitPolicyResolver {

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    /** Heavy endpoints backed by Playwright/POI or large row payloads (design §4 report-export). */
    private static final List<String> REPORT_PATTERNS = List.of(
            "/api/documents/**",
            "/api/**/reports/**",
            "/api/**/reports",
            "/api/financials/statement/**",
            "/api/financials/statement");

    public RateLimitPolicy resolve(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();

        if (path == null || !path.startsWith("/api/")) {
            return RateLimitPolicy.NONE; // static resources, /uploads, /tools, /actuator, etc.
        }

        // Auth endpoints are governed by the Layer-2 brute-force limiter, not the generic filter.
        if (path.startsWith("/api/auth/")) {
            return RateLimitPolicy.NONE;
        }

        // Unauthenticated, permitAll, abuse-prone.
        if (path.startsWith("/api/client-logs")) {
            return RateLimitPolicy.PUBLIC;
        }

        for (String pattern : REPORT_PATTERNS) {
            if (MATCHER.match(pattern, path)) {
                return RateLimitPolicy.REPORT;
            }
        }

        if ("GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method)
                || "OPTIONS".equalsIgnoreCase(method)) {
            return RateLimitPolicy.READ;
        }
        return RateLimitPolicy.WRITE;
    }
}
