package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * A named, reusable bundle of device-role assignments (e.g. "Standard Counter" = a receipt
 * printer + cash drawer + scanner). Deploying a new terminal becomes "assign a profile" instead
 * of configuring every device individually — the operational win this phase exists to deliver.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §5.
 */
@Entity
@Table(name = "pos_hardware_profile", indexes = {
        @Index(name = "idx_hardware_profile_branch", columnList = "branch_id")
})
public class PosHardwareProfile extends BaseEntity {

    @Column(name = "profile_name", nullable = false, length = 120)
    private String profileName;

    /** Null = a global template assignable to any branch; set = scoped to one branch. */
    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "description", length = 500)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PosHardwareProfileStatus status = PosHardwareProfileStatus.ACTIVE;

    /** Bumped on every configuration change (name/description, or a device-role slot change).
     *  Lets a terminal record which version it was assigned, so staleness ("this terminal's
     *  profile binding predates the profile's latest edit") can be detected — see
     *  HardwareProfileService#isTerminalSynced. */
    @Column(name = "version", nullable = false)
    private int version = 1;

    public String getProfileName() { return profileName; }
    public void setProfileName(String profileName) { this.profileName = profileName; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public PosHardwareProfileStatus getStatus() { return status; }
    public void setStatus(PosHardwareProfileStatus status) { this.status = status; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }
}
