package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * One device-role slot within a {@link PosHardwareProfile} — e.g. role
 * {@code PRIMARY_RECEIPT_PRINTER} pointing at a specific registered {@code PosDevice}. A role
 * is unique within a profile (one device per role), but the same physical device may appear in
 * more than one profile — the assignment engine is what prevents two profiles bound to two
 * *different active terminals* from claiming the same device at the same time (§ conflict
 * detection in {@link HardwareProfileAssignmentEngine}).
 */
@Entity
@Table(name = "pos_hardware_profile_device", indexes = {
        @Index(name = "idx_hardware_profile_device_profile", columnList = "hardware_profile_id"),
        @Index(name = "idx_hardware_profile_device_device", columnList = "device_id")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uq_hardware_profile_role", columnNames = {"hardware_profile_id", "role"})
})
public class PosHardwareProfileDevice extends BaseEntity {

    @Column(name = "hardware_profile_id", nullable = false)
    private Long hardwareProfileId;

    @Column(name = "device_id", nullable = false)
    private Long deviceId;

    @Column(name = "role", nullable = false, length = 50)
    private String role;

    public Long getHardwareProfileId() { return hardwareProfileId; }
    public void setHardwareProfileId(Long hardwareProfileId) { this.hardwareProfileId = hardwareProfileId; }

    public Long getDeviceId() { return deviceId; }
    public void setDeviceId(Long deviceId) { this.deviceId = deviceId; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
}
