package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * Append-only operational/technical log for every device lifecycle event. Distinct from the
 * existing {@code AuditLogService}, which remains the compliance trail for business actions
 * (e.g. invoice reprint); this log captures high-frequency technical events (health changes,
 * print attempts, agent lifecycle) that would otherwise flood the audit log.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §12.
 */
@Entity
@Table(name = "pos_device_event_log", indexes = {
        @Index(name = "idx_device_event_log_device", columnList = "device_id, created_at"),
        @Index(name = "idx_device_event_log_type", columnList = "event_type")
})
public class PosDeviceEventLog extends BaseEntity {

    @Column(name = "device_id", nullable = false)
    private Long deviceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40)
    private PosDeviceEventType eventType;

    @Column(name = "operation", length = 100)
    private String operation;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", length = 20)
    private PosDeviceEventResult result;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "terminal_id", length = 80)
    private String terminalId;

    @Column(name = "actor_user", length = 100)
    private String actorUser;

    public Long getDeviceId() { return deviceId; }
    public void setDeviceId(Long deviceId) { this.deviceId = deviceId; }

    public PosDeviceEventType getEventType() { return eventType; }
    public void setEventType(PosDeviceEventType eventType) { this.eventType = eventType; }

    public String getOperation() { return operation; }
    public void setOperation(String operation) { this.operation = operation; }

    public PosDeviceEventResult getResult() { return result; }
    public void setResult(PosDeviceEventResult result) { this.result = result; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public String getActorUser() { return actorUser; }
    public void setActorUser(String actorUser) { this.actorUser = actorUser; }
}
