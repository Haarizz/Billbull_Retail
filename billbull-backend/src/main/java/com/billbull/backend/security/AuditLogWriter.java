package com.billbull.backend.security;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Async persistence layer for audit log entries.
 * All methods run on Spring's default task executor so that audit writes
 * never block the HTTP response path.
 */
@Component
class AuditLogWriter {

    private final AuditLogRepository auditLogRepository;

    AuditLogWriter(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Async
    @Transactional
    void saveAccessLog(
            Long userId, String username, String role,
            String endpoint, String httpMethod, boolean allowed, String denialReason,
            String ip, String userAgent, String requestId, Long branchId, String host) {
        AuditLog log = new AuditLog();
        log.setUserId(userId);
        log.setUsername(username);
        log.setRole(role);
        log.setEndpoint(endpoint);
        log.setHttpMethod(httpMethod);
        log.setAction(allowed ? "ALLOWED" : "DENIED");
        log.setDenialReason(denialReason);
        log.setIpAddress(ip);
        log.setUserAgent(userAgent);
        log.setAccessTime(LocalDateTime.now());
        log.setEventType("ACCESS");
        log.setRequestId(requestId);
        log.setBranchId(branchId);
        log.setClientHost(host);
        auditLogRepository.save(log);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void saveDomainEvent(
            Long userId, String username,
            String entityType, String entityId, String action, String detail,
            String requestId, Long branchId, String host) {
        AuditLog log = new AuditLog();
        log.setUserId(userId);
        log.setUsername(username);
        log.setRole("DOMAIN");
        log.setEndpoint(blankOr(entityType, "ENTITY") + ":" + blankOr(entityId, "-"));
        log.setHttpMethod(blankOr(action, "EVENT"));
        log.setAction("ALLOWED");
        // denialReason is a plain String, i.e. varchar(255), while details is TEXT — and this
        // line writes the SAME value to both. A domain detail longer than 255 characters
        // therefore failed the whole INSERT, and because this method is @Async the exception
        // was swallowed by the uncaught-exception handler: the event was silently never audited.
        // The Phase 2 RETURN_APPROVED detail (return number, split figures, invoice, customer,
        // branch, authorization) is ~354 characters for ordinary customer and branch names, so
        // every approved return lost its audit row. Truncated here rather than widened in the
        // schema: details already holds the full, untruncated string, so this field is only a
        // short mirror for the denial/reason column that ACCESS rows use.
        log.setDenialReason(truncate(detail, DENIAL_REASON_MAX));
        log.setEventType("BUSINESS");
        log.setEntityType(blankOr(entityType, "ENTITY"));
        log.setEntityId(blankOr(entityId, "-"));
        log.setDetails(detail);
        log.setAccessTime(LocalDateTime.now());
        log.setRequestId(requestId);
        log.setBranchId(branchId);
        log.setClientHost(host);
        auditLogRepository.save(log);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void saveApiEvent(
            Long userId, String username, String roles,
            String endpoint, String method, String ip, String userAgent,
            String requestId, Long branchId, String host, int status, long durationMs) {
        AuditLog log = new AuditLog();
        log.setUserId(userId);
        log.setUsername(username);
        log.setRole(roles);
        log.setEndpoint(endpoint);
        log.setHttpMethod(method);
        log.setAction(status >= 400 ? "FAILED" : "SUCCESS");
        log.setEventType("API_MUTATION");
        log.setEntityType("API");
        log.setEntityId(endpoint);
        log.setHttpStatus(status);
        log.setDurationMs(durationMs);
        log.setDenialReason(status >= 400 ? "HTTP " + status : null);
        log.setDetails("status=" + status + ", durationMs=" + durationMs);
        log.setIpAddress(ip);
        log.setUserAgent(userAgent);
        log.setAccessTime(LocalDateTime.now());
        log.setRequestId(requestId);
        log.setBranchId(branchId);
        log.setClientHost(host);
        auditLogRepository.save(log);
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void saveClientIssue(
            Long userId, String username, String roles,
            String url, String level, String message, String details,
            String ip, String userAgent, String requestId, Long branchId, String host) {
        AuditLog log = new AuditLog();
        log.setUserId(userId);
        log.setUsername(username);
        log.setRole(roles);
        log.setEndpoint(url);
        log.setHttpMethod("CLIENT");
        log.setAction("WARNING".equals(level) ? "WARN" : level);
        log.setEventType("CLIENT_ISSUE");
        log.setEntityType("CLIENT_LOG");
        log.setEntityId(requestId != null ? requestId : "-");
        log.setDenialReason(message);
        log.setDetails(details);
        log.setIpAddress(ip);
        log.setUserAgent(userAgent);
        log.setAccessTime(LocalDateTime.now());
        log.setRequestId(requestId);
        log.setBranchId(branchId);
        log.setClientHost(host);
        auditLogRepository.save(log);
    }

    private static String blankOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    /** Column width of {@code audit_logs.denial_reason} — a plain String, so varchar(255). */
    private static final int DENIAL_REASON_MAX = 255;

    private static String truncate(String value, int max) {
        if (value == null || value.length() <= max) return value;
        return value.substring(0, max);
    }
}
