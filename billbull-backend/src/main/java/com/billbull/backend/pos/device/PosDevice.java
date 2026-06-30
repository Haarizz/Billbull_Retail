package com.billbull.backend.pos.device;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Shared parent row for every piece of POS hardware (printer, scanner, cash drawer, card
 * terminal, ...). Type-specific configuration lives in the matching feature package's own
 * entity (e.g. {@code pos.printer.PosPrinter}), linked back here via a {@code device_id} FK;
 * this row exists so Hardware Profiles, Discovery, Health and the Device Dashboard can refer
 * to "a device" generically without knowing its concrete type.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §6.5.
 */
@Entity
@Table(name = "pos_devices", indexes = {
    @Index(name = "idx_pos_device_code",     columnList = "device_code",  unique = true),
    @Index(name = "idx_pos_device_branch",   columnList = "branch_id"),
    @Index(name = "idx_pos_device_status",   columnList = "status"),
    @Index(name = "idx_pos_device_type",     columnList = "device_type"),
    @Index(name = "idx_pos_device_terminal", columnList = "terminal_id")
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
    @Column(name = "device_type", nullable = false, length = 30)
    private PosDeviceType deviceType = PosDeviceType.GENERIC;

    /** Optional terminal scope — matches {@code PosTerminal.terminalId} (string identifier). */
    @Column(name = "terminal_id", length = 80)
    private String terminalId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PosDeviceStatus status = PosDeviceStatus.ACTIVE;

    /** System-observed health, distinct from the admin-controlled {@link #status}. */
    @Enumerated(EnumType.STRING)
    @Column(name = "runtime_health", nullable = false, length = 20)
    private PosDeviceRuntimeHealth runtimeHealth = PosDeviceRuntimeHealth.UNKNOWN;

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

    public PosDeviceType getDeviceType() { return deviceType; }
    public void setDeviceType(PosDeviceType deviceType) { this.deviceType = deviceType; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public PosDeviceStatus getStatus() { return status; }
    public void setStatus(PosDeviceStatus status) { this.status = status; }

    public PosDeviceRuntimeHealth getRuntimeHealth() { return runtimeHealth; }
    public void setRuntimeHealth(PosDeviceRuntimeHealth runtimeHealth) { this.runtimeHealth = runtimeHealth; }

    public LocalDateTime getLastHeartbeat() { return lastHeartbeat; }
    public void setLastHeartbeat(LocalDateTime lastHeartbeat) { this.lastHeartbeat = lastHeartbeat; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
