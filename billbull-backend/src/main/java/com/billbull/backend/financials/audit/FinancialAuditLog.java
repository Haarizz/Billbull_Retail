package com.billbull.backend.financials.audit;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Financial Audit Log entity.
 * Records all significant financial events for IFRS/GAAP compliance.
 * Separate from RBAC AuditLog — this tracks financial transactions.
 */
@Entity
@Table(name = "financial_audit_logs")
public class FinancialAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String entityType; // "JOURNAL_VOUCHER", "SALES_INVOICE", "PURCHASE_INVOICE", "PAYMENT", etc.

    private String entityId; // ID of the affected entity

    @Column(nullable = false)
    private String action; // "CREATED", "POSTED", "UPDATED", "DELETED", "REVERSED"

    private String userId;
    private String username;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    @Column(columnDefinition = "TEXT")
    private String details; // JSON or text description of what changed

    @Column(columnDefinition = "TEXT")
    private String previousState; // Snapshot of previous state (for reversals)

    private String requestId;

    private Long branchId;

    private String clientHost;

    @PrePersist
    protected void onCreate() {
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
    }

    public FinancialAuditLog() {
    }

    // --- GETTERS & SETTERS ---
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEntityType() {
        return entityType;
    }

    public void setEntityType(String entityType) {
        this.entityType = entityType;
    }

    public String getEntityId() {
        return entityId;
    }

    public void setEntityId(String entityId) {
        this.entityId = entityId;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public String getDetails() {
        return details;
    }

    public void setDetails(String details) {
        this.details = details;
    }

    public String getPreviousState() {
        return previousState;
    }

    public void setPreviousState(String previousState) {
        this.previousState = previousState;
    }

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public String getClientHost() {
        return clientHost;
    }

    public void setClientHost(String clientHost) {
        this.clientHost = clientHost;
    }
}
