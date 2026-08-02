package com.billbull.backend.pos.admin;

import jakarta.persistence.*;

@Entity
@Table(name = "pos_correction_overlays")
public class CorrectionOverlay {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", length = 50, nullable = false)
    private CorrectionTargetType targetType;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Column(name = "original_snapshot_json", columnDefinition = "TEXT")
    private String originalSnapshotJson;

    @Column(name = "corrected_snapshot_json", columnDefinition = "TEXT")
    private String correctedSnapshotJson;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 50, nullable = false)
    private CorrectionRequestStatus status;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public CorrectionTargetType getTargetType() { return targetType; }
    public void setTargetType(CorrectionTargetType targetType) { this.targetType = targetType; }
    public Long getTargetId() { return targetId; }
    public void setTargetId(Long targetId) { this.targetId = targetId; }
    public String getOriginalSnapshotJson() { return originalSnapshotJson; }
    public void setOriginalSnapshotJson(String originalSnapshotJson) { this.originalSnapshotJson = originalSnapshotJson; }
    public String getCorrectedSnapshotJson() { return correctedSnapshotJson; }
    public void setCorrectedSnapshotJson(String correctedSnapshotJson) { this.correctedSnapshotJson = correctedSnapshotJson; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public CorrectionRequestStatus getStatus() { return status; }
    public void setStatus(CorrectionRequestStatus status) { this.status = status; }
}
