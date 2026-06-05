package com.billbull.backend.financials.audit;

import com.billbull.backend.logging.LogContext;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Service for recording financial audit events.
 * Called from service classes when financial transactions occur.
 */
@Service
public class FinancialAuditService {

    private final FinancialAuditLogRepository repository;

    public FinancialAuditService(FinancialAuditLogRepository repository) {
        this.repository = repository;
    }

    /**
     * Log a financial event.
     */
    public void logEvent(String entityType, String entityId, String action, String username, String details) {
        FinancialAuditLog log = new FinancialAuditLog();
        log.setEntityType(entityType);
        log.setEntityId(entityId);
        log.setAction(action);
        log.setUsername(username);
        log.setTimestamp(LocalDateTime.now());
        log.setDetails(details);
        applyContext(log);
        repository.save(log);
    }

    /**
     * Log a financial event with previous state snapshot.
     */
    public void logEventWithState(String entityType, String entityId, String action,
            String username, String details, String previousState) {
        FinancialAuditLog log = new FinancialAuditLog();
        log.setEntityType(entityType);
        log.setEntityId(entityId);
        log.setAction(action);
        log.setUsername(username);
        log.setTimestamp(LocalDateTime.now());
        log.setDetails(details);
        log.setPreviousState(previousState);
        applyContext(log);
        repository.save(log);
    }

    /**
     * Get audit trail for a specific entity.
     */
    public List<FinancialAuditLog> getAuditTrail(String entityType, String entityId) {
        return repository.findByEntityTypeAndEntityIdOrderByTimestampDesc(entityType, entityId);
    }

    /**
     * Get all audit logs by entity type.
     */
    public List<FinancialAuditLog> getByEntityType(String entityType) {
        return repository.findByEntityTypeOrderByTimestampDesc(entityType);
    }

    /**
     * Get all audit logs within a date range.
     */
    public List<FinancialAuditLog> getByDateRange(LocalDateTime start, LocalDateTime end) {
        return repository.findByTimestampBetweenOrderByTimestampDesc(start, end);
    }

    /**
     * Get all audit logs.
     */
    public List<FinancialAuditLog> getAllLogs() {
        return repository.findAllByOrderByTimestampDesc();
    }

    private void applyContext(FinancialAuditLog log) {
        log.setRequestId(LogContext.get(LogContext.REQUEST_ID));
        log.setBranchId(LogContext.getLong(LogContext.BRANCH_ID));
        log.setClientHost(LogContext.get(LogContext.CLIENT_HOST));
        if ((log.getUsername() == null || log.getUsername().isBlank() || "System".equalsIgnoreCase(log.getUsername()))
                && !LogContext.get(LogContext.USERNAME).isBlank()) {
            log.setUsername(LogContext.get(LogContext.USERNAME));
        }
    }
}
