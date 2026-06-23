package com.billbull.backend.pos.device;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Registered POS terminal. Device must exist and be ACTIVE before it can open a
 * POS session. §2.7 of the POS gap analysis.
 */
@Entity
@Table(name = "pos_devices", indexes = {
    @Index(name = "idx_pos_device_code",   columnList = "device_code",  unique = true),
    @Index(name = "idx_pos_device_branch", columnList = "branch_id"),
    @Index(name = "idx_pos_device_status", columnList = "status")
})
public class PosDevice extends BaseEntity {

    @Column(name = "device_code", nullable = false, length = 50, unique = true)
    private String deviceCode;

    @Column(name = "device_name", length = 100)
    private String deviceName;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "branch_name", length = 100)
    private String branchName;

    /** Cashier counter this device is permanently assigned to (optional). */
    @Column(name = "counter_name", length = 100)
    private String counterName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PosDeviceStatus status = PosDeviceStatus.ACTIVE;

    /** ISO 8601 timestamp of the device's last heartbeat ping. */
    @Column(name = "last_heartbeat")
    private LocalDateTime lastHeartbeat;

    @Column(name = "notes", length = 500)
    private String notes;

    public String getDeviceCode() { return deviceCode; }
    public void setDeviceCode(String deviceCode) { this.deviceCode = deviceCode; }

    public String getDeviceName() { return deviceName; }
    public void setDeviceName(String deviceName) { this.deviceName = deviceName; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public PosDeviceStatus getStatus() { return status; }
    public void setStatus(PosDeviceStatus status) { this.status = status; }

    public LocalDateTime getLastHeartbeat() { return lastHeartbeat; }
    public void setLastHeartbeat(LocalDateTime lastHeartbeat) { this.lastHeartbeat = lastHeartbeat; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
