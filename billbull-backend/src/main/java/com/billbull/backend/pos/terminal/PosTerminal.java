package com.billbull.backend.pos.terminal;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "pos_terminals", indexes = {
    @Index(name = "idx_pos_terminal_branch", columnList = "branch_id"),
    @Index(name = "idx_pos_terminal_device", columnList = "device_fingerprint", unique = true),
    @Index(name = "idx_pos_terminal_counter", columnList = "counter_id"),
    @Index(name = "idx_pos_terminal_heartbeat", columnList = "last_heartbeat_at")
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

    // Legacy string label — kept for backward compat. FK is counter_id.
    @Column(name = "counter_name", length = 100)
    private String counterName;

    // FK to pos_counters; nullable — terminals registered before counter entity existed.
    @Column(name = "counter_id")
    private Long counterId;

    @Column(name = "device_fingerprint", length = 200)
    private String deviceFingerprint;

    @Column(name = "device_info", length = 500)
    private String deviceInfo;

    @Column(name = "operating_system", length = 100)
    private String operatingSystem;

    @Column(name = "browser", length = 100)
    private String browser;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "is_main_pos")
    private Boolean isMainPos = false;

    // Legacy field — kept for backward compat. Updated together with last_heartbeat_at.
    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    // Updated by the dedicated heartbeat endpoint; used by the offline-detection scheduler.
    @Column(name = "last_heartbeat_at")
    private LocalDateTime lastHeartbeatAt;

    @Column(name = "registered_by")
    private String registeredBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PosTerminalStatus status = PosTerminalStatus.ACTIVE;

    // PENDING | APPROVED | REJECTED
    @Column(name = "registration_status", length = 20)
    private String registrationStatus = "APPROVED";

    // Holds the session ID of the currently OPEN session — null when terminal is free.
    // Updated atomically in PosTerminalRepository.setOpenSession / clearOpenSession.
    @Column(name = "current_open_session_id")
    private Long currentOpenSessionId;

    // Soft-archive fields (ARCHIVED status)
    @Column(name = "archived_at")
    private LocalDateTime archivedAt;

    @Column(name = "archive_reason", length = 255)
    private String archiveReason;

    /** Phase D — optional Hardware Profile assignment. */
    @Column(name = "hardware_profile_id")
    private Long hardwareProfileId;

    @Column(name = "assigned_profile_version")
    private Integer assignedProfileVersion;

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

    public Long getCounterId() { return counterId; }
    public void setCounterId(Long counterId) { this.counterId = counterId; }

    public String getDeviceFingerprint() { return deviceFingerprint; }
    public void setDeviceFingerprint(String deviceFingerprint) { this.deviceFingerprint = deviceFingerprint; }

    public String getDeviceInfo() { return deviceInfo; }
    public void setDeviceInfo(String deviceInfo) { this.deviceInfo = deviceInfo; }

    public String getOperatingSystem() { return operatingSystem; }
    public void setOperatingSystem(String operatingSystem) { this.operatingSystem = operatingSystem; }

    public String getBrowser() { return browser; }
    public void setBrowser(String browser) { this.browser = browser; }

    public String getIpAddress() { return ipAddress; }
    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }

    public Boolean getIsMainPos() { return isMainPos; }
    public void setIsMainPos(Boolean isMainPos) { this.isMainPos = isMainPos; }

    public LocalDateTime getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(LocalDateTime lastSeenAt) { this.lastSeenAt = lastSeenAt; }

    public LocalDateTime getLastHeartbeatAt() { return lastHeartbeatAt; }
    public void setLastHeartbeatAt(LocalDateTime lastHeartbeatAt) { this.lastHeartbeatAt = lastHeartbeatAt; }

    public String getRegisteredBy() { return registeredBy; }
    public void setRegisteredBy(String registeredBy) { this.registeredBy = registeredBy; }

    public PosTerminalStatus getStatus() { return status; }
    public void setStatus(PosTerminalStatus status) { this.status = status; }

    public String getRegistrationStatus() { return registrationStatus; }
    public void setRegistrationStatus(String registrationStatus) { this.registrationStatus = registrationStatus; }

    public Long getCurrentOpenSessionId() { return currentOpenSessionId; }
    public void setCurrentOpenSessionId(Long currentOpenSessionId) { this.currentOpenSessionId = currentOpenSessionId; }

    public LocalDateTime getArchivedAt() { return archivedAt; }
    public void setArchivedAt(LocalDateTime archivedAt) { this.archivedAt = archivedAt; }

    public String getArchiveReason() { return archiveReason; }
    public void setArchiveReason(String archiveReason) { this.archiveReason = archiveReason; }

    public Long getHardwareProfileId() { return hardwareProfileId; }
    public void setHardwareProfileId(Long hardwareProfileId) { this.hardwareProfileId = hardwareProfileId; }

    public Integer getAssignedProfileVersion() { return assignedProfileVersion; }
    public void setAssignedProfileVersion(Integer assignedProfileVersion) { this.assignedProfileVersion = assignedProfileVersion; }
}
