package com.billbull.backend.pos.admin;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Enterprise Console &gt; POS Administration &gt; Transaction Corrections (Phase 4,
 * architectural review §4/§5). Append-only overlay for a governed correction to a completed
 * transaction (receipt voucher, customer advance allocation, or POS cash movement) — never
 * edits the original {@code ReceiptVoucher}/{@code AdvanceApplication}/{@code PosCashMovement}
 * row, never rewrites an existing {@code JournalEntry}, never touches {@code StockMovement}.
 * Every correction becomes a brand-new GL event (reverse the original effect, post the
 * corrected one) via {@code PostingEngineService.postCorrectionEntry} — see {@link
 * PosTransactionCorrectionService} for the execution engine.
 *
 * <p>One row per correction lifecycle, one-to-one with the generic {@link CorrectionRequest}
 * that drives its state machine (same pattern as Phase 3's {@code
 * PosSessionDenominationCorrection}) — {@code status} here mirrors that request's status,
 * updated in lockstep, never independently. Snapshots/reason are set once at creation and
 * never rewritten; only lifecycle actor/timestamp/status columns advance. {@code version}
 * lets multiple corrections accumulate against the same target over time (each a new row,
 * never modifying an earlier one) while {@link PosTransactionCorrectionRepository} exposes
 * which is the current effective one.
 */
@Entity
@Table(name = "pos_transaction_corrections")
public class PosTransactionCorrection extends BaseEntity {

    @Column(name = "correction_request_id", nullable = false, unique = true)
    private Long correctionRequestId;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", length = 30, nullable = false)
    private CorrectionTargetType targetType;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "correction_type", length = 30, nullable = false)
    private CorrectionType correctionType;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "original_snapshot_json", columnDefinition = "TEXT", nullable = false)
    private String originalSnapshotJson;

    @Column(name = "corrected_snapshot_json", columnDefinition = "TEXT", nullable = false)
    private String correctedSnapshotJson;

    /** Small precomputed summary (e.g. amountDifference, paymentModeChanged, customerChanged) —
     *  presentation convenience only, never a source of truth. */
    @Column(name = "difference_summary_json", columnDefinition = "TEXT")
    private String differenceSummaryJson;

    @Column(name = "reason", length = 1000, nullable = false)
    private String reason;

    /** Which numbered correction this is against the same target (1 = first ever). Never
     *  modified after creation — a later correction against the same target gets its own row
     *  with the next version number, this one is left exactly as applied/rejected/cancelled. */
    @Column(name = "version", nullable = false)
    private Integer version = 1;

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

    @Column(name = "rejected_by")
    private String rejectedBy;

    @Column(name = "rejected_at")
    private LocalDateTime rejectedAt;

    @Column(name = "rejection_reason", length = 1000)
    private String rejectionReason;

    @Column(name = "applied_by")
    private String appliedBy;

    @Column(name = "applied_at")
    private LocalDateTime appliedAt;

    @Column(name = "execution_error", length = 1000)
    private String executionError;

    public Long getCorrectionRequestId() { return correctionRequestId; }
    public void setCorrectionRequestId(Long correctionRequestId) { this.correctionRequestId = correctionRequestId; }

    public CorrectionTargetType getTargetType() { return targetType; }
    public void setTargetType(CorrectionTargetType targetType) { this.targetType = targetType; }

    public Long getTargetId() { return targetId; }
    public void setTargetId(Long targetId) { this.targetId = targetId; }

    public CorrectionType getCorrectionType() { return correctionType; }
    public void setCorrectionType(CorrectionType correctionType) { this.correctionType = correctionType; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getOriginalSnapshotJson() { return originalSnapshotJson; }
    public void setOriginalSnapshotJson(String originalSnapshotJson) { this.originalSnapshotJson = originalSnapshotJson; }

    public String getCorrectedSnapshotJson() { return correctedSnapshotJson; }
    public void setCorrectedSnapshotJson(String correctedSnapshotJson) { this.correctedSnapshotJson = correctedSnapshotJson; }

    public String getDifferenceSummaryJson() { return differenceSummaryJson; }
    public void setDifferenceSummaryJson(String differenceSummaryJson) { this.differenceSummaryJson = differenceSummaryJson; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

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

    public String getRejectedBy() { return rejectedBy; }
    public void setRejectedBy(String rejectedBy) { this.rejectedBy = rejectedBy; }

    public LocalDateTime getRejectedAt() { return rejectedAt; }
    public void setRejectedAt(LocalDateTime rejectedAt) { this.rejectedAt = rejectedAt; }

    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }

    public String getAppliedBy() { return appliedBy; }
    public void setAppliedBy(String appliedBy) { this.appliedBy = appliedBy; }

    public LocalDateTime getAppliedAt() { return appliedAt; }
    public void setAppliedAt(LocalDateTime appliedAt) { this.appliedAt = appliedAt; }

    public String getExecutionError() { return executionError; }
    public void setExecutionError(String executionError) { this.executionError = executionError; }
}
