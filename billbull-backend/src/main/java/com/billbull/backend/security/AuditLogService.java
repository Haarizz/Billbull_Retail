package com.billbull.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Service for logging all RBAC access attempts.
 */
@Service
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

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
