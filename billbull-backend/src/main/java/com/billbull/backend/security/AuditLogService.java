package com.billbull.backend.security;

import com.billbull.backend.logging.LogContext;
import com.billbull.backend.user.UserRepository;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Locale;

/**
 * Service for RBAC access logs and ERP business audit events.
 */
@Service
public class AuditLogService {

    private static final Long SYSTEM_USER_ID = -1L;
    private static final int MAX_DETAIL_LENGTH = 4000;

    private final AuditLogRepository auditLogRepository;

    @Autowired(required = false)
    private UserRepository userRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional
    public void logAccess(
            Long userId,
            String username,
            String role,
            String endpoint,
            String httpMethod,
            boolean allowed,
            String denialReason,
            HttpServletRequest request) {
        AuditLog log = new AuditLog();
        log.setUserId(resolveUserId(userId, username));
        log.setUsername(safe(username, currentUsername()));
        log.setRole(safe(role, currentRoles()));
        log.setEndpoint(safe(endpoint, "-"));
        log.setHttpMethod(safe(httpMethod, "-"));
        log.setAction(allowed ? "ALLOWED" : "DENIED");
        log.setDenialReason(truncate(denialReason));
        log.setIpAddress(getClientIp(request));
        log.setUserAgent(request != null ? request.getHeader("User-Agent") : null);
        log.setAccessTime(LocalDateTime.now());
        log.setEventType("ACCESS");
        applyRequestContext(log, request);

        auditLogRepository.save(log);
    }

    @Transactional
    public void logAllowedAccess(String endpoint, String httpMethod, HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return;
        }

        String roles = auth.getAuthorities().stream()
                .map(Object::toString)
                .reduce((a, b) -> a + "," + b)
                .orElse("NONE");

        logAccess(
                LogContext.getLong(LogContext.USER_ID),
                auth.getName(),
                roles,
                endpoint,
                httpMethod,
                true,
                null,
                request);
    }

    @Transactional
    public void logDeniedAccess(
            String username,
            String endpoint,
            String httpMethod,
            String reason,
            HttpServletRequest request) {
        logAccess(
                null,
                username != null ? username : "ANONYMOUS",
                "NONE",
                endpoint,
                httpMethod,
                false,
                reason,
                request);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logDomainEvent(String entityType, String entityId, String action, String detail) {
        AuditLog log = new AuditLog();
        log.setUserId(resolveUserId(null, currentUsername()));
        log.setUsername(currentUsername());
        log.setRole("DOMAIN");
        log.setEndpoint(safe(entityType, "ENTITY") + ":" + safe(entityId, "-"));
        log.setHttpMethod(safe(action, "EVENT"));
        log.setAction("ALLOWED");
        log.setDenialReason(truncate(detail));
        log.setEventType("BUSINESS");
        log.setEntityType(safe(entityType, "ENTITY"));
        log.setEntityId(safe(entityId, "-"));
        log.setDetails(truncate(detail));
        log.setAccessTime(LocalDateTime.now());
        applyRequestContext(log, null);

        auditLogRepository.save(log);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logApiRequestEvent(HttpServletRequest request, int status, long durationMs) {
        AuditLog log = new AuditLog();
        log.setUserId(resolveUserId(LogContext.getLong(LogContext.USER_ID), currentUsername()));
        log.setUsername(currentUsername());
        log.setRole(currentRoles());
        log.setEndpoint(request != null ? request.getRequestURI() : LogContext.getOrDefault(LogContext.HTTP_PATH, "-"));
        log.setHttpMethod(request != null ? request.getMethod() : LogContext.getOrDefault(LogContext.HTTP_METHOD, "-"));
        log.setAction(status >= 400 ? "FAILED" : "SUCCESS");
        log.setEventType("API_MUTATION");
        log.setEntityType("API");
        log.setEntityId(log.getEndpoint());
        log.setHttpStatus(status);
        log.setDurationMs(durationMs);
        log.setDenialReason(status >= 400 ? "HTTP " + status : null);
        log.setDetails("status=" + status + ", durationMs=" + durationMs);
        log.setIpAddress(getClientIp(request));
        log.setUserAgent(request != null ? request.getHeader("User-Agent") : null);
        log.setAccessTime(LocalDateTime.now());
        applyRequestContext(log, request);

        auditLogRepository.save(log);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logClientIssueEvent(String level, String message, String url, String details, HttpServletRequest request) {
        String normalizedLevel = safe(level, "INFO").toUpperCase(Locale.ROOT);
        if (!"ERROR".equals(normalizedLevel) && !"WARN".equals(normalizedLevel) && !"WARNING".equals(normalizedLevel)) {
            return;
        }

        AuditLog log = new AuditLog();
        log.setUserId(resolveUserId(LogContext.getLong(LogContext.USER_ID), currentUsername()));
        log.setUsername(currentUsername());
        log.setRole(currentRoles());
        log.setEndpoint(safe(url, "/api/client-logs"));
        log.setHttpMethod("CLIENT");
        log.setAction("WARNING".equals(normalizedLevel) ? "WARN" : normalizedLevel);
        log.setEventType("CLIENT_ISSUE");
        log.setEntityType("CLIENT_LOG");
        log.setEntityId(LogContext.getOrDefault(LogContext.REQUEST_ID, "-"));
        log.setDenialReason(truncate(message));
        log.setDetails(truncate(details));
        log.setIpAddress(getClientIp(request));
        log.setUserAgent(request != null ? request.getHeader("User-Agent") : null);
        log.setAccessTime(LocalDateTime.now());
        applyRequestContext(log, request);

        auditLogRepository.save(log);
    }

    private void applyRequestContext(AuditLog log, HttpServletRequest request) {
        log.setRequestId(LogContext.get(LogContext.REQUEST_ID));
        log.setBranchId(LogContext.getLong(LogContext.BRANCH_ID));
        log.setClientHost(LogContext.getOrDefault(LogContext.CLIENT_HOST, request != null ? request.getServerName() : null));
    }

    private Long resolveUserId(Long explicitUserId, String username) {
        if (explicitUserId != null) {
            return explicitUserId;
        }

        Long mdcUserId = LogContext.getLong(LogContext.USER_ID);
        if (mdcUserId != null) {
            return mdcUserId;
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
