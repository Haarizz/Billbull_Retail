package com.billbull.backend.pos.terminal;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "pos_terminals", indexes = {
    @Index(name = "idx_pos_terminal_branch", columnList = "branch_id"),
    @Index(name = "idx_pos_terminal_device", columnList = "device_fingerprint", unique = true)
})
public class PosTerminal extends BaseEntity {

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "branch_name")
    private String branchName;

    @Column(name = "terminal_id", unique = true, length = 50)
    private String terminalId;

    @Column(name = "terminal_name", length = 100)
    private String terminalName;

    @Column(name = "counter_name", length = 100)
    private String counterName;

    @Column(name = "device_fingerprint", length = 200)
    private String deviceFingerprint;

    @Column(name = "device_info", length = 500)
    private String deviceInfo;

    @Column(name = "is_main_pos")
    private Boolean isMainPos = false;

    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    @Column(name = "registered_by")
    private String registeredBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PosTerminalStatus status = PosTerminalStatus.ACTIVE;

    // Getters & Setters

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public String getTerminalName() { return terminalName; }
    public void setTerminalName(String terminalName) { this.terminalName = terminalName; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public String getDeviceFingerprint() { return deviceFingerprint; }
    public void setDeviceFingerprint(String deviceFingerprint) { this.deviceFingerprint = deviceFingerprint; }

    public String getDeviceInfo() { return deviceInfo; }
    public void setDeviceInfo(String deviceInfo) { this.deviceInfo = deviceInfo; }

    public Boolean getIsMainPos() { return isMainPos; }
    public void setIsMainPos(Boolean isMainPos) { this.isMainPos = isMainPos; }

    public LocalDateTime getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(LocalDateTime lastSeenAt) { this.lastSeenAt = lastSeenAt; }

    public String getRegisteredBy() { return registeredBy; }
    public void setRegisteredBy(String registeredBy) { this.registeredBy = registeredBy; }

    public PosTerminalStatus getStatus() { return status; }
    public void setStatus(PosTerminalStatus status) { this.status = status; }
}
