package com.billbull.backend.security;

import com.billbull.backend.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Service for logging all RBAC access attempts.
 */
@Service
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    @Autowired(required = false)
    private UserRepository userRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    /**
     * Log an access attempt (allowed or denied).
     */
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
        log.setUserId(userId);
        log.setUsername(username);
        log.setRole(role);
        log.setEndpoint(endpoint);
        log.setHttpMethod(httpMethod);
        log.setAction(allowed ? "ALLOWED" : "DENIED");
        log.setDenialReason(denialReason);
        log.setIpAddress(getClientIp(request));
        log.setUserAgent(request.getHeader("User-Agent"));
        log.setAccessTime(LocalDateTime.now());

        auditLogRepository.save(log);
    }

    /**
     * Log allowed access from current authentication context.
     */
    @Transactional
    public void logAllowedAccess(String endpoint, String httpMethod, HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof org.springframework.security.core.userdetails.User) {
            org.springframework.security.core.userdetails.User userDetails = (org.springframework.security.core.userdetails.User) auth
                    .getPrincipal();

            String roles = userDetails.getAuthorities().stream()
                    .map(Object::toString)
                    .reduce((a, b) -> a + "," + b)
                    .orElse("NONE");

            logAccess(
                    null, // userId not easily available from UserDetails
                    userDetails.getUsername(),
                    roles,
                    endpoint,
                    httpMethod,
                    true,
                    null,
                    request);
        }
    }

    /**
     * Log denied access.
     */
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

    /**
     * Log a domain event (no HTTP context) — for service-layer audit such as
     * Branch CRUD, HQ-change, and user-branch-assignment changes (PDF §11.3).
     *
     * Uses REQUIRES_NEW so an audit-log insert failure (NOT-NULL violations,
     * stale repo lookup, etc.) doesn't roll back the caller's business
     * transaction. The caller wraps this in try/catch as a second line of
     * defense.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logDomainEvent(String entityType, String entityId, String action, String detail) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth != null && auth.getName() != null ? auth.getName() : "SYSTEM";

        Long userId = null;
        if (userRepository != null && !"SYSTEM".equals(username)) {
            try {
                userId = userRepository.findByUsername(username).map(u -> u.getId()).orElse(null);
            } catch (Exception ignored) {
                // best-effort lookup
            }
        }
        // audit_logs.user_id is NOT NULL — fall back to a sentinel that won't
        // collide with a real user (0 would conflict with sequence; use -1
        // which the schema accepts as a Long but never matches a real PK).
        if (userId == null) {
            userId = -1L;
        }

        AuditLog log = new AuditLog();
        log.setUserId(userId);
        log.setUsername(username);
        log.setRole("DOMAIN");
        log.setEndpoint(entityType + ":" + (entityId != null ? entityId : "-"));
        log.setHttpMethod(action);
        log.setAction("ALLOWED");
        log.setDenialReason(detail);
        log.setAccessTime(LocalDateTime.now());

        auditLogRepository.save(log);
    }

    /**
     * Extract client IP address from request.
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
