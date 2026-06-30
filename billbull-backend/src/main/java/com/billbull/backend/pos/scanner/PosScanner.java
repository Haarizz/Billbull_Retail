package com.billbull.backend.pos.scanner;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Registration record for a barcode scanner — deliberately lightweight. A USB/Bluetooth HID
 * "keyboard wedge" scanner needs no driver and no runtime configuration to actually scan (see
 * PosScannerInputMode); this entity exists purely for Device Manager visibility (registration,
 * branch/terminal scoping, Hardware Profile membership, dashboard listing) — registering or
 * editing a scanner here has zero effect on how scanning works in the POS UI.
 */
@Entity
@Table(name = "pos_scanners", indexes = {
        @Index(name = "idx_pos_scanner_branch", columnList = "branch_id"),
        @Index(name = "idx_pos_scanner_terminal", columnList = "terminal_id"),
        @Index(name = "idx_pos_scanner_device", columnList = "device_id")
})
public class PosScanner extends BaseEntity {

    @Column(name = "device_code", nullable = false, length = 50, unique = true)
    private String deviceCode;

    /** Parent row in the shared device registry (pos.device.PosDevice). */
    @Column(name = "device_id")
    private Long deviceId;

    @Column(name = "device_name", nullable = false, length = 100)
    private String deviceName;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "branch_name", length = 120)
    private String branchName;

    @Column(name = "terminal_id", length = 80)
    private String terminalId;

    @Column(name = "counter_name", length = 120)
    private String counterName;

    @Enumerated(EnumType.STRING)
    @Column(name = "connection_type", nullable = false, length = 20)
    private PosScannerConnectionType connectionType = PosScannerConnectionType.USB;

    @Enumerated(EnumType.STRING)
    @Column(name = "input_mode", nullable = false, length = 20)
    private PosScannerInputMode inputMode = PosScannerInputMode.KEYBOARD_WEDGE;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PosScannerStatus status = PosScannerStatus.ACTIVE;

    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    @Column(name = "notes", length = 500)
    private String notes;

    public String getDeviceCode() { return deviceCode; }
    public void setDeviceCode(String deviceCode) { this.deviceCode = deviceCode; }

    public Long getDeviceId() { return deviceId; }
    public void setDeviceId(Long deviceId) { this.deviceId = deviceId; }

    public String getDeviceName() { return deviceName; }
    public void setDeviceName(String deviceName) { this.deviceName = deviceName; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public PosScannerConnectionType getConnectionType() { return connectionType; }
    public void setConnectionType(PosScannerConnectionType connectionType) { this.connectionType = connectionType; }

    public PosScannerInputMode getInputMode() { return inputMode; }
    public void setInputMode(PosScannerInputMode inputMode) { this.inputMode = inputMode; }

    public PosScannerStatus getStatus() { return status; }
    public void setStatus(PosScannerStatus status) { this.status = status; }

    public LocalDateTime getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(LocalDateTime lastSeenAt) { this.lastSeenAt = lastSeenAt; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
