package com.billbull.backend.logging;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.billbull.backend.security.AuditLogService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {

    public static final String REQUEST_ID_HEADER = "X-Request-Id";
    public static final String REQUEST_ID_MDC_KEY = LogContext.REQUEST_ID;

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    private final AuditLogService auditLogService;
    private final long slowRequestThresholdMs;
    private final boolean autoAuditMutations;

    public RequestLoggingFilter(
            AuditLogService auditLogService,
            @Value("${app.logging.slow-request-threshold-ms:2000}") long slowRequestThresholdMs,
            @Value("${app.audit.auto-log-mutating-requests:true}") boolean autoAuditMutations) {
        this.auditLogService = auditLogService;
        this.slowRequestThresholdMs = slowRequestThresholdMs;
        this.autoAuditMutations = autoAuditMutations;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        String requestId = resolveRequestId(request);
        long startedAt = System.currentTimeMillis();

        LogContext.put(LogContext.REQUEST_ID, requestId);
        LogContext.put(LogContext.CLIENT_HOST, request.getServerName());
        LogContext.put(LogContext.HTTP_METHOD, request.getMethod());
        LogContext.put(LogContext.HTTP_PATH, request.getRequestURI());
        response.setHeader(REQUEST_ID_HEADER, requestId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = System.currentTimeMillis() - startedAt;
            int status = response.getStatus();
            String username = resolveUsername();
            String path = request.getRequestURI();
            String query = request.getQueryString();
            String target = query == null || query.isBlank() ? path : path + "?...";
            String branchId = LogContext.getOrDefault(LogContext.BRANCH_ID, "-");
            String roles = LogContext.getOrDefault(LogContext.ROLES, "-");
            String clientHost = LogContext.getOrDefault(LogContext.CLIENT_HOST, request.getServerName());
            boolean slow = durationMs >= slowRequestThresholdMs;

            if (status >= 500) {
                log.error("HTTP {} {} -> {} in {} ms user={} roles={} branch={} host={} ip={} slow={}",
                        request.getMethod(), target, status, durationMs, username, roles, branchId, clientHost,
                        clientIp(request), slow);
            } else if (status >= 400) {
                log.warn("HTTP {} {} -> {} in {} ms user={} roles={} branch={} host={} ip={} slow={}",
                        request.getMethod(), target, status, durationMs, username, roles, branchId, clientHost,
                        clientIp(request), slow);
            } else if (slow) {
                log.warn("SLOW_HTTP {} {} -> {} in {} ms user={} roles={} branch={} host={} ip={}",
                        request.getMethod(), target, status, durationMs, username, roles, branchId, clientHost,
                        clientIp(request));
            } else {
                log.info("HTTP {} {} -> {} in {} ms user={} roles={} branch={} host={} ip={}",
                        request.getMethod(), target, status, durationMs, username, roles, branchId, clientHost,
                        clientIp(request));
            }

            auditMutatingRequest(request, status, durationMs);
            LogContext.clearRequestContext();
        }
    }

    private String resolveRequestId(HttpServletRequest request) {
        String existing = request.getHeader(REQUEST_ID_HEADER);
        if (existing != null && !existing.isBlank() && existing.length() <= 120) {
            return existing.trim();
        }
        return UUID.randomUUID().toString();
    }

    private String resolveUsername() {
        String username = LogContext.get(LogContext.USERNAME);
        if (!username.isBlank()) {
            return username;
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return "anonymous";
        }
        return authentication.getName();
    }

    private void auditMutatingRequest(HttpServletRequest request, int status, long durationMs) {
        if (!autoAuditMutations || !isAuditableMutation(request)) {
            return;
        }
        try {
            auditLogService.logApiRequestEvent(request, status, durationMs);
        } catch (Exception ex) {
            log.debug("API audit logging failed for {} {}", request.getMethod(), request.getRequestURI(), ex);
        }
    }

    private boolean isAuditableMutation(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if (path == null || !path.startsWith("/api/") || path.startsWith("/api/client-logs")) {
            return false;
        }
        return "POST".equalsIgnoreCase(method)
                || "PUT".equalsIgnoreCase(method)
                || "PATCH".equalsIgnoreCase(method)
                || "DELETE".equalsIgnoreCase(method);
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
