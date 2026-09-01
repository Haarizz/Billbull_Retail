package com.billbull.backend.pos.admin;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Enterprise Console &gt; POS Administration &gt; Session Denomination Corrections (Phase 3,
 * architectural review §3). Append-only overlay record for a closed {@code PosSession}'s cash
 * denomination breakdown — never edits {@code PosSession.closingDenominationsJson}, any
 * {@code PosXReportSnapshot}, or any {@code PosDayClose} row. Those remain the untouched
 * historical source of truth; this row is purely additive presentation data consulted only
 * when computing the "effective" denomination overlay for display.
 *
 * <p>One row per correction lifecycle, one-to-one with the generic {@link CorrectionRequest}
 * that drives its {@code REQUESTED -> PENDING_APPROVAL -> APPROVED -> APPLIED} (or
 * {@code REJECTED}/{@code CANCELLED}) state machine — {@code status} here is a denormalized
 * mirror of that request's status, updated in lockstep by {@link
 * PosSessionDenominationCorrectionService}, never independently. Denomination snapshots,
 * totals, and reason are set once at creation and never rewritten afterward — only the
 * lifecycle actor/timestamp/status columns advance as the correction progresses. Correcting a
 * session again after an APPLIED correction creates a brand-new row (a new "version"); this
 * row is never updated or deleted to reflect a later correction (§ Versioning).
 */
@Entity
@Table(name = "pos_session_denomination_corrections")
public class PosSessionDenominationCorrection extends BaseEntity {

    @Column(name = "correction_request_id", nullable = false, unique = true)
    private Long correctionRequestId;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "branch_id")
    private Long branchId;

    /** Copied verbatim from {@code PosSession.closingDenominationsJson} at request time — the
     *  session row itself is never touched. Null/blank source is stored as {@code "{}"}. */
    @Column(name = "original_denomination_json", columnDefinition = "TEXT", nullable = false)
    private String originalDenominationJson;

    @Column(name = "corrected_denomination_json", columnDefinition = "TEXT", nullable = false)
    private String correctedDenominationJson;

    @Column(name = "original_total", precision = 15, scale = 2, nullable = false)
    private BigDecimal originalTotal;

    @Column(name = "corrected_total", precision = 15, scale = 2, nullable = false)
    private BigDecimal correctedTotal;

    /** {@code correctedTotal - originalTotal} — presentation only; never posted anywhere. */
    @Column(name = "difference", precision = 15, scale = 2, nullable = false)
    private BigDecimal difference;

    @Column(name = "reason", length = 1000, nullable = false)
    private String reason;

    // ── The accounting this correction produced ──────────────────────────────────────
    // Applying a correction moves effective counted cash, so it must move the ledger too.
    // The original close journal is never rewritten; a separate adjustment entry reverses it
    // and reposts the corrected state, and these columns are the link to it.

    /** {@code SCLADJ-{sessionId}-v{version}}. Also the idempotency key: a retried apply
     *  resolves to the same reference and posts once. */
    @Column(name = "adjustment_journal_reference", length = 100)
    private String adjustmentJournalReference;

    @Column(name = "adjustment_posted_at")
    private LocalDateTime adjustmentPostedAt;

    /** Kept rather than swallowed, so a correction whose accounting did not land is visible
     *  and retryable instead of leaving the ledger quietly stale. */
    @Column(name = "adjustment_posting_error", length = 1000)
    private String adjustmentPostingError;

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

    public Long getCorrectionRequestId() { return correctionRequestId; }
    public void setCorrectionRequestId(Long correctionRequestId) { this.correctionRequestId = correctionRequestId; }

    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getOriginalDenominationJson() { return originalDenominationJson; }
    public void setOriginalDenominationJson(String originalDenominationJson) { this.originalDenominationJson = originalDenominationJson; }

    public String getCorrectedDenominationJson() { return correctedDenominationJson; }
    public void setCorrectedDenominationJson(String correctedDenominationJson) { this.correctedDenominationJson = correctedDenominationJson; }

    public BigDecimal getOriginalTotal() { return originalTotal; }
    public void setOriginalTotal(BigDecimal originalTotal) { this.originalTotal = originalTotal; }

    public BigDecimal getCorrectedTotal() { return correctedTotal; }
    public void setCorrectedTotal(BigDecimal correctedTotal) { this.correctedTotal = correctedTotal; }

    public BigDecimal getDifference() { return difference; }
    public void setDifference(BigDecimal difference) { this.difference = difference; }

    public String getAdjustmentJournalReference() { return adjustmentJournalReference; }
    public void setAdjustmentJournalReference(String v) { this.adjustmentJournalReference = v; }

    public LocalDateTime getAdjustmentPostedAt() { return adjustmentPostedAt; }
    public void setAdjustmentPostedAt(LocalDateTime v) { this.adjustmentPostedAt = v; }

    public String getAdjustmentPostingError() { return adjustmentPostingError; }
    public void setAdjustmentPostingError(String v) { this.adjustmentPostingError = v; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

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
}
