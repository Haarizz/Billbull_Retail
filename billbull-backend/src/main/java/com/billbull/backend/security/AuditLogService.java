package com.billbull.backend.security;

import com.billbull.backend.logging.LogContext;
import com.billbull.backend.user.UserRepository;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.Locale;

/**
 * Service for RBAC access logs and ERP business audit events.
 *
 * Every method snapshots all caller-thread state (SecurityContext, MDC,
 * HttpServletRequest) into plain values before handing off to {@link AuditLogWriter},
 * whose @Async methods perform the DB write on the shared task-executor pool.
 * This removes audit persistence from the HTTP response critical path.
 */
@Service
public class AuditLogService {

    private static final Long SYSTEM_USER_ID = -1L;
    private static final int MAX_DETAIL_LENGTH = 4000;

    private final AuditLogWriter writer;

    @Autowired(required = false)
    private UserRepository userRepository;

    public AuditLogService(AuditLogWriter writer) {
        this.writer = writer;
    }

    public void logAccess(
            Long userId,
            String username,
            String role,
            String endpoint,
            String httpMethod,
            boolean allowed,
            String denialReason,
            HttpServletRequest request) {
        writer.saveAccessLog(
                resolveUserId(userId, username),
                safe(username, currentUsername()),
                safe(role, currentRoles()),
                safe(endpoint, "-"),
                safe(httpMethod, "-"),
                allowed,
                truncate(denialReason),
                getClientIp(request),
                request != null ? request.getHeader("User-Agent") : null,
                LogContext.get(LogContext.REQUEST_ID),
                LogContext.getLong(LogContext.BRANCH_ID),
                LogContext.getOrDefault(LogContext.CLIENT_HOST, request != null ? request.getServerName() : null));
    }

    public void logAllowedAccess(String endpoint, String httpMethod, HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return;
        }
        String roles = auth.getAuthorities().stream()
                .map(Object::toString)
                .reduce((a, b) -> a + "," + b)
                .orElse("NONE");
        writer.saveAccessLog(
                resolveUserId(LogContext.getLong(LogContext.USER_ID), auth.getName()),
                auth.getName(),
                roles,
                safe(endpoint, "-"),
                safe(httpMethod, "-"),
                true,
                null,
                getClientIp(request),
                request != null ? request.getHeader("User-Agent") : null,
                LogContext.get(LogContext.REQUEST_ID),
                LogContext.getLong(LogContext.BRANCH_ID),
                LogContext.getOrDefault(LogContext.CLIENT_HOST, request != null ? request.getServerName() : null));
    }

    public void logDeniedAccess(
            String username,
            String endpoint,
            String httpMethod,
            String reason,
            HttpServletRequest request) {
        writer.saveAccessLog(
                SYSTEM_USER_ID,
                username != null ? username : "ANONYMOUS",
                "NONE",
                safe(endpoint, "-"),
                safe(httpMethod, "-"),
                false,
                truncate(reason),
                getClientIp(request),
                request != null ? request.getHeader("User-Agent") : null,
                LogContext.get(LogContext.REQUEST_ID),
                LogContext.getLong(LogContext.BRANCH_ID),
                LogContext.getOrDefault(LogContext.CLIENT_HOST, request != null ? request.getServerName() : null));
    }

    public void logDomainEvent(String entityType, String entityId, String action, String detail) {
        String username = currentUsername();
        writer.saveDomainEvent(
                resolveUserId(null, username),
                username,
                entityType,
                entityId,
                action,
                truncate(detail),
                LogContext.get(LogContext.REQUEST_ID),
                LogContext.getLong(LogContext.BRANCH_ID),
                LogContext.get(LogContext.CLIENT_HOST));
    }

    public void logApiRequestEvent(HttpServletRequest request, int status, long durationMs) {
        String username = currentUsername();
        writer.saveApiEvent(
                resolveUserId(LogContext.getLong(LogContext.USER_ID), username),
                username,
                currentRoles(),
                request != null ? request.getRequestURI()
                                : LogContext.getOrDefault(LogContext.HTTP_PATH, "-"),
                request != null ? request.getMethod()
                                : LogContext.getOrDefault(LogContext.HTTP_METHOD, "-"),
                getClientIp(request),
                request != null ? request.getHeader("User-Agent") : null,
                LogContext.get(LogContext.REQUEST_ID),
                LogContext.getLong(LogContext.BRANCH_ID),
                LogContext.getOrDefault(LogContext.CLIENT_HOST, request != null ? request.getServerName() : null),
                status,
                durationMs);
    }

    public void logClientIssueEvent(String level, String message, String url, String details,
                                    HttpServletRequest request) {
        String normalizedLevel = safe(level, "INFO").toUpperCase(Locale.ROOT);
        if (!"ERROR".equals(normalizedLevel) && !"WARN".equals(normalizedLevel)
                && !"WARNING".equals(normalizedLevel)) {
            return;
        }
        String username = currentUsername();
        writer.saveClientIssue(
                resolveUserId(LogContext.getLong(LogContext.USER_ID), username),
                username,
                currentRoles(),
                safe(url, "/api/client-logs"),
                normalizedLevel,
                truncate(message),
                truncate(details),
                getClientIp(request),
                request != null ? request.getHeader("User-Agent") : null,
                LogContext.get(LogContext.REQUEST_ID),
                LogContext.getLong(LogContext.BRANCH_ID),
                LogContext.getOrDefault(LogContext.CLIENT_HOST, request != null ? request.getServerName() : null));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Long resolveUserId(Long explicitUserId, String username) {
        if (explicitUserId != null) {
            return explicitUserId;
        }

        if (userRepository != null && username != null
                && !"SYSTEM".equalsIgnoreCase(username)
                && !"anonymous".equalsIgnoreCase(username)
                && !"ANONYMOUS".equalsIgnoreCase(username)) {
            try {
                return userRepository.findByUsername(username).map(u -> u.getId()).orElse(SYSTEM_USER_ID);
            } catch (Exception ignored) {
                // best-effort lookup
            }
        }

        return SYSTEM_USER_ID;
    }

    private String currentUsername() {
        String username = LogContext.get(LogContext.USERNAME);
        if (!username.isBlank()) {
            return username;
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null) {
            return auth.getName();
        }

        return "SYSTEM";
    }

    private String currentRoles() {
        String roles = LogContext.get(LogContext.ROLES);
        if (!roles.isBlank()) {
            return roles;
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getAuthorities() != null) {
            return auth.getAuthorities().stream()
                    .map(Object::toString)
                    .reduce((a, b) -> a + "," + b)
                    .orElse("NONE");
        }

        return "NONE";
    }

    private String getClientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private String safe(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private String truncate(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.length() <= MAX_DETAIL_LENGTH ? text : text.substring(0, MAX_DETAIL_LENGTH) + "...";
    }
}
