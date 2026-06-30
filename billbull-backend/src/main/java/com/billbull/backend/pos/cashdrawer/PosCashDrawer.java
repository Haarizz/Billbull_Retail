package com.billbull.backend.pos.cashdrawer;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Registration record for a cash drawer. A drawer kick rides the attached receipt printer's
 * cable (ESC/POS drawer-kick byte sequence sent with a print job) — there is no standalone
 * "open drawer" hardware connection, which is why {@link #attachedPrinterId} is mandatory.
 * {@link #lastKickAt}/{@link #lastKickResult} close the confirmation gap flagged in the original
 * architecture research: previously, kick success was only ever implicit in whether the receipt
 * printed, never explicitly confirmed by the agent.
 */
@Entity
@Table(name = "pos_cash_drawers", indexes = {
        @Index(name = "idx_pos_cash_drawer_branch", columnList = "branch_id"),
        @Index(name = "idx_pos_cash_drawer_terminal", columnList = "terminal_id"),
        @Index(name = "idx_pos_cash_drawer_device", columnList = "device_id"),
        @Index(name = "idx_pos_cash_drawer_printer", columnList = "attached_printer_id")
})
public class PosCashDrawer extends BaseEntity {

    @Column(name = "device_code", nullable = false, length = 50, unique = true)
    private String deviceCode;

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

    @Column(name = "attached_printer_id", nullable = false)
    private Long attachedPrinterId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PosCashDrawerStatus status = PosCashDrawerStatus.ACTIVE;

    @Column(name = "last_kick_at")
    private LocalDateTime lastKickAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "last_kick_result", nullable = false, length = 20)
    private PosCashDrawerKickResult lastKickResult = PosCashDrawerKickResult.UNKNOWN;

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

    public Long getAttachedPrinterId() { return attachedPrinterId; }
    public void setAttachedPrinterId(Long attachedPrinterId) { this.attachedPrinterId = attachedPrinterId; }

    public PosCashDrawerStatus getStatus() { return status; }
    public void setStatus(PosCashDrawerStatus status) { this.status = status; }

    public LocalDateTime getLastKickAt() { return lastKickAt; }
    public void setLastKickAt(LocalDateTime lastKickAt) { this.lastKickAt = lastKickAt; }

    public PosCashDrawerKickResult getLastKickResult() { return lastKickResult; }
    public void setLastKickResult(PosCashDrawerKickResult lastKickResult) { this.lastKickResult = lastKickResult; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
