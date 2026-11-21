package com.billbull.backend.security.accessaudit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.LocalDateTime;

/**
 * One immutable row of the access-control audit ledger ({@code access_audit_events}, V144).
 *
 * <p>Does NOT extend {@code BaseEntity} on purpose: that base adds {@code updatedAt/updatedBy} and
 * the soft-delete {@code isActive} flag, none of which can apply to an append-only record. The
 * actor is captured explicitly ({@link #actorUsername}) rather than through JPA auditing.
 *
 * <p>{@link Immutable} makes Hibernate ignore any change to a loaded instance; the database
 * triggers in V144 reject UPDATE/DELETE/TRUNCATE regardless of what the application does.
 * Rows are only ever created by {@link AccessAuditService#record}.
 */
@Entity
@Immutable
@Table(name = "access_audit_events")
public class AccessAuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Column(name = "actor_username", nullable = false, length = 120)
    private String actorUsername;

    @Column(name = "actor_roles", length = 500)
    private String actorRoles;

    @Column(name = "action", nullable = false, length = 60)
    private String action;

    @Column(name = "target_type", nullable = false, length = 40)
    private String targetType;

    @Column(name = "target_id", length = 120)
    private String targetId;

    @Column(name = "target_label", length = 255)
    private String targetLabel;

    @Column(name = "role_name", length = 120)
    private String roleName;

    @Column(name = "module", length = 160)
    private String module;

    @Column(name = "previous_value", columnDefinition = "TEXT")
    private String previousValue;

    @Column(name = "new_value", columnDefinition = "TEXT")
    private String newValue;

    @Column(name = "change_summary", length = 1000)
    private String changeSummary;

    @Column(name = "reason", length = 1000)
    private String reason;

    @Column(name = "affected_user_ids", columnDefinition = "TEXT")
    private String affectedUserIds;

    @Column(name = "affected_usernames", columnDefinition = "TEXT")
    private String affectedUsernames;

    @Column(name = "affected_user_count", nullable = false)
    private int affectedUserCount;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "tenant", length = 200)
    private String tenant;

    @Column(name = "ip_address", length = 80)
    private String ipAddress;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Column(name = "request_id", length = 120)
    private String requestId;

    @Column(name = "change_set_id", length = 64)
    private String changeSetId;

    @Column(name = "prev_hash", length = 64)
    private String prevHash;

    @Column(name = "row_hash", nullable = false, length = 64)
    private String rowHash;

    protected AccessAuditEvent() {
        // JPA
    }

    /** Package-private: only {@link AccessAuditService} builds rows. */
    AccessAuditEvent(LocalDateTime occurredAt) {
        this.occurredAt = occurredAt;
    }

    public Long getId() { return id; }
    public LocalDateTime getOccurredAt() { return occurredAt; }
    public Long getActorUserId() { return actorUserId; }
    public String getActorUsername() { return actorUsername; }
    public String getActorRoles() { return actorRoles; }
    public String getAction() { return action; }
    public String getTargetType() { return targetType; }
    public String getTargetId() { return targetId; }
    public String getTargetLabel() { return targetLabel; }
    public String getRoleName() { return roleName; }
    public String getModule() { return module; }
    public String getPreviousValue() { return previousValue; }
    public String getNewValue() { return newValue; }
    public String getChangeSummary() { return changeSummary; }
    public String getReason() { return reason; }
    public String getAffectedUserIds() { return affectedUserIds; }
    public String getAffectedUsernames() { return affectedUsernames; }
    public int getAffectedUserCount() { return affectedUserCount; }
    public Long getBranchId() { return branchId; }
    public String getTenant() { return tenant; }
    public String getIpAddress() { return ipAddress; }
    public String getUserAgent() { return userAgent; }
    public String getRequestId() { return requestId; }
    public String getChangeSetId() { return changeSetId; }
    public String getPrevHash() { return prevHash; }
    public String getRowHash() { return rowHash; }

    // Package-private setters: populated once by AccessAuditService before the single INSERT.
    void setActorUserId(Long v) { this.actorUserId = v; }
    void setActorUsername(String v) { this.actorUsername = v; }
    void setActorRoles(String v) { this.actorRoles = v; }
    void setAction(String v) { this.action = v; }
    void setTargetType(String v) { this.targetType = v; }
    void setTargetId(String v) { this.targetId = v; }
    void setTargetLabel(String v) { this.targetLabel = v; }
    void setRoleName(String v) { this.roleName = v; }
    void setModule(String v) { this.module = v; }
    void setPreviousValue(String v) { this.previousValue = v; }
    void setNewValue(String v) { this.newValue = v; }
    void setChangeSummary(String v) { this.changeSummary = v; }
    void setReason(String v) { this.reason = v; }
    void setAffectedUserIds(String v) { this.affectedUserIds = v; }
    void setAffectedUsernames(String v) { this.affectedUsernames = v; }
    void setAffectedUserCount(int v) { this.affectedUserCount = v; }
    void setBranchId(Long v) { this.branchId = v; }
    void setTenant(String v) { this.tenant = v; }
    void setIpAddress(String v) { this.ipAddress = v; }
    void setUserAgent(String v) { this.userAgent = v; }
    void setRequestId(String v) { this.requestId = v; }
    void setChangeSetId(String v) { this.changeSetId = v; }
    void setPrevHash(String v) { this.prevHash = v; }
    void setRowHash(String v) { this.rowHash = v; }
}
