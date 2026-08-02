package com.billbull.backend.pos.admin;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Enterprise Console &gt; POS Administration — the single, append-only correction-request
 * record backing every correction type (denomination, transaction, cash-movement category).
 * Never mutates the record it corrects (architectural review §5) — the original
 * PosSession/PosXReportSnapshot/PosDayClose/SalesInvoice/etc. row is untouched, and this row
 * is the entire audit trail (§11): every lifecycle field below is only ever forward-appended
 * by {@link CorrectionRequestService}, never reset or overwritten.
 *
 * <p>Phase 1 only drives the lifecycle up to APPROVED/REJECTED/CANCELLED — {@code
 * executedBy}/{@code executedAt}/{@code failureReason} exist so the schema is ready for the
 * Phase 3/4 executors, but nothing in this phase sets them.
 */
@Entity
@Table(name = "pos_correction_requests")
public class CorrectionRequest extends BaseEntity {

    @Column(name = "request_number", length = 60, nullable = false, unique = true)
    private String requestNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", length = 30, nullable = false)
    private CorrectionTargetType targetType;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "correction_type", length = 30, nullable = false)
    private CorrectionType correctionType;

    /** Snapshot of the affected fields as they stood at request time — copied once, never
     *  re-derived later, so the correction record stays meaningful even if the source
     *  document keeps evolving underneath it. Heterogeneous per target type, so stored as
     *  JSON text, matching the existing reportJson/zReportJson blob convention. */
    @Column(name = "original_values_json", columnDefinition = "TEXT")
    private String originalValuesJson;

    @Column(name = "proposed_values_json", columnDefinition = "TEXT")
    private String proposedValuesJson;

    @Column(name = "reason", length = 1000)
    private String reason;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "business_date")
    private LocalDate businessDate;

    @jakarta.persistence.Version
    @Column(name = "version", nullable = false)
    private Integer version = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private CorrectionRequestStatus status = CorrectionRequestStatus.REQUESTED;

    @Column(name = "requested_by")
    private String requestedBy;

    @Column(name = "requested_at")
    private LocalDateTime requestedAt;

    @Column(name = "approved_by")
    private String approvedBy;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "approval_notes", length = 1000)
    private String approvalNotes;

    @Column(name = "rejected_by")
    private String rejectedBy;

    @Column(name = "rejected_at")
    private LocalDateTime rejectedAt;

    @Column(name = "rejection_reason", length = 1000)
    private String rejectionReason;

    @Column(name = "cancelled_by")
    private String cancelledBy;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "executed_by")
    private String executedBy;

    @Column(name = "executed_at")
    private LocalDateTime executedAt;

    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    // Getters & setters

    public String getRequestNumber() { return requestNumber; }
    public void setRequestNumber(String requestNumber) { this.requestNumber = requestNumber; }

    public CorrectionTargetType getTargetType() { return targetType; }
    public void setTargetType(CorrectionTargetType targetType) { this.targetType = targetType; }

    public Long getTargetId() { return targetId; }
    public void setTargetId(Long targetId) { this.targetId = targetId; }

    public CorrectionType getCorrectionType() { return correctionType; }
    public void setCorrectionType(CorrectionType correctionType) { this.correctionType = correctionType; }

    public String getOriginalValuesJson() { return originalValuesJson; }
    public void setOriginalValuesJson(String originalValuesJson) { this.originalValuesJson = originalValuesJson; }

    public String getProposedValuesJson() { return proposedValuesJson; }
    public void setProposedValuesJson(String proposedValuesJson) { this.proposedValuesJson = proposedValuesJson; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public LocalDate getBusinessDate() { return businessDate; }
    public void setBusinessDate(LocalDate businessDate) { this.businessDate = businessDate; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public CorrectionRequestStatus getStatus() { return status; }
    public void setStatus(CorrectionRequestStatus status) { this.status = status; }

    public String getRequestedBy() { return requestedBy; }
    public void setRequestedBy(String requestedBy) { this.requestedBy = requestedBy; }

    public LocalDateTime getRequestedAt() { return requestedAt; }
    public void setRequestedAt(LocalDateTime requestedAt) { this.requestedAt = requestedAt; }

    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }

    public LocalDateTime getApprovedAt() { return approvedAt; }
    public void setApprovedAt(LocalDateTime approvedAt) { this.approvedAt = approvedAt; }

    public String getApprovalNotes() { return approvalNotes; }
    public void setApprovalNotes(String approvalNotes) { this.approvalNotes = approvalNotes; }

    public String getRejectedBy() { return rejectedBy; }
    public void setRejectedBy(String rejectedBy) { this.rejectedBy = rejectedBy; }

    public LocalDateTime getRejectedAt() { return rejectedAt; }
    public void setRejectedAt(LocalDateTime rejectedAt) { this.rejectedAt = rejectedAt; }

    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }

    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String cancelledBy) { this.cancelledBy = cancelledBy; }

    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }

    public String getExecutedBy() { return executedBy; }
    public void setExecutedBy(String executedBy) { this.executedBy = executedBy; }

    public LocalDateTime getExecutedAt() { return executedAt; }
    public void setExecutedAt(LocalDateTime executedAt) { this.executedAt = executedAt; }

    public String getFailureReason() { return failureReason; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }
}
