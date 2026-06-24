package com.billbull.backend.pos.audit;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "pos_audit_log", indexes = {
        @Index(name = "idx_pal_session", columnList = "session_id"),
        @Index(name = "idx_pal_branch_action", columnList = "branch_id, action"),
        @Index(name = "idx_pal_created", columnList = "created_at")
})
public class PosAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id")
    private Long sessionId;

    @Column(name = "terminal_id", length = 100)
    private String terminalId;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "user_id", length = 100)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", length = 50, nullable = false)
    private PosAuditAction action;

    /** Type of the related business object, e.g. "INVOICE", "LAYAWAY", "SESSION". */
    @Column(name = "entity_type", length = 50)
    private String entityType;

    /** Primary key of the related object (as string for flexibility). */
    @Column(name = "entity_id", length = 100)
    private String entityId;

    /** Human-readable description of what changed. */
    @Column(name = "description", length = 500)
    private String description;

    /** Optional JSON blob capturing before-state for sensitive changes (price override etc.). */
    @Column(name = "old_value_json", columnDefinition = "TEXT")
    private String oldValueJson;

    /** Optional JSON blob capturing after-state. */
    @Column(name = "new_value_json", columnDefinition = "TEXT")
    private String newValueJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /* ===== GETTERS & SETTERS ===== */

    public Long getId() { return id; }

    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public PosAuditAction getAction() { return action; }
    public void setAction(PosAuditAction action) { this.action = action; }

    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }

    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getOldValueJson() { return oldValueJson; }
    public void setOldValueJson(String oldValueJson) { this.oldValueJson = oldValueJson; }

    public String getNewValueJson() { return newValueJson; }
    public void setNewValueJson(String newValueJson) { this.newValueJson = newValueJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
