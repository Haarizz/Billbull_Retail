package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * A point-in-time health reading pushed by a device's owning agent. The latest snapshot per
 * device also updates that device's {@code PosDevice.runtimeHealth} (via
 * {@link DeviceManager#updateRuntimeHealth}); this table is the history behind that single
 * current value, surfaced via the dashboard's per-device detail view.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §9.
 */
@Entity
@Table(name = "pos_device_health_snapshot", indexes = {
        @Index(name = "idx_device_health_snapshot_device", columnList = "device_id, captured_at")
})
public class PosDeviceHealthSnapshot extends BaseEntity {

    @Column(name = "device_id", nullable = false)
    private Long deviceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "health_state", nullable = false, length = 20)
    private PosDeviceRuntimeHealth healthState;

    @Column(name = "driver_status", length = 100)
    private String driverStatus;

    @Column(name = "firmware_version", length = 50)
    private String firmwareVersion;

    @Column(name = "paper_status", length = 20)
    private String paperStatus;

    @Column(name = "cover_status", length = 20)
    private String coverStatus;

    @Column(name = "busy", nullable = false)
    private boolean busy;

    @Column(name = "queue_length")
    private Integer queueLength;

    @Column(name = "captured_at", nullable = false)
    private LocalDateTime capturedAt;

    public Long getDeviceId() { return deviceId; }
    public void setDeviceId(Long deviceId) { this.deviceId = deviceId; }

    public PosDeviceRuntimeHealth getHealthState() { return healthState; }
    public void setHealthState(PosDeviceRuntimeHealth healthState) { this.healthState = healthState; }

    public String getDriverStatus() { return driverStatus; }
    public void setDriverStatus(String driverStatus) { this.driverStatus = driverStatus; }

    public String getFirmwareVersion() { return firmwareVersion; }
    public void setFirmwareVersion(String firmwareVersion) { this.firmwareVersion = firmwareVersion; }

    public String getPaperStatus() { return paperStatus; }
    public void setPaperStatus(String paperStatus) { this.paperStatus = paperStatus; }

    public String getCoverStatus() { return coverStatus; }
    public void setCoverStatus(String coverStatus) { this.coverStatus = coverStatus; }

    public boolean isBusy() { return busy; }
    public void setBusy(boolean busy) { this.busy = busy; }

    public Integer getQueueLength() { return queueLength; }
    public void setQueueLength(Integer queueLength) { this.queueLength = queueLength; }

    public LocalDateTime getCapturedAt() { return capturedAt; }
    public void setCapturedAt(LocalDateTime capturedAt) { this.capturedAt = capturedAt; }
}
