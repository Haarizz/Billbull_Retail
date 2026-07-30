package com.billbull.backend.pos.admin;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Back-office view of a {@link CorrectionRequest} — the Correction Approvals tab's list/view
 *  DTO, mirrors PosCashMovementResponse's shape and convenience-flag pattern. */
public class CorrectionRequestResponse {

    private Long id;
    private String requestNumber;
    private CorrectionTargetType targetType;
    private Long targetId;
    private CorrectionType correctionType;
    private String originalValuesJson;
    private String proposedValuesJson;
    private String reason;
    private Long branchId;
    private LocalDate businessDate;
    private CorrectionRequestStatus status;

    private String requestedBy;
    private LocalDateTime requestedAt;
    private String approvedBy;
    private LocalDateTime approvedAt;
    private String approvalNotes;
    private String rejectedBy;
    private LocalDateTime rejectedAt;
    private String rejectionReason;
    private String cancelledBy;
    private LocalDateTime cancelledAt;
    private String executedBy;
    private LocalDateTime executedAt;
    private String failureReason;

    /** Convenience flags so the UI can disable Approve/Reject/Cancel without re-deriving the
     *  state-machine rules itself (same convenience pattern as PosCashMovementResponse). */
    private boolean approvable;
    private boolean rejectable;
    private boolean cancellable;

    public static CorrectionRequestResponse from(CorrectionRequest c) {
        CorrectionRequestResponse r = new CorrectionRequestResponse();
        r.id = c.getId();
        r.requestNumber = c.getRequestNumber();
        r.targetType = c.getTargetType();
        r.targetId = c.getTargetId();
        r.correctionType = c.getCorrectionType();
        r.originalValuesJson = c.getOriginalValuesJson();
        r.proposedValuesJson = c.getProposedValuesJson();
        r.reason = c.getReason();
        r.branchId = c.getBranchId();
        r.businessDate = c.getBusinessDate();
        r.status = c.getStatus();
        r.requestedBy = c.getRequestedBy();
        r.requestedAt = c.getRequestedAt();
        r.approvedBy = c.getApprovedBy();
        r.approvedAt = c.getApprovedAt();
        r.approvalNotes = c.getApprovalNotes();
        r.rejectedBy = c.getRejectedBy();
        r.rejectedAt = c.getRejectedAt();
        r.rejectionReason = c.getRejectionReason();
        r.cancelledBy = c.getCancelledBy();
        r.cancelledAt = c.getCancelledAt();
        r.executedBy = c.getExecutedBy();
        r.executedAt = c.getExecutedAt();
        r.failureReason = c.getFailureReason();

        boolean pending = c.getStatus() == CorrectionRequestStatus.PENDING_APPROVAL;
        r.approvable = pending;
        r.rejectable = pending;
        r.cancellable = c.getStatus() == CorrectionRequestStatus.REQUESTED || pending;
        return r;
    }

    public Long getId() { return id; }
    public String getRequestNumber() { return requestNumber; }
    public CorrectionTargetType getTargetType() { return targetType; }
    public Long getTargetId() { return targetId; }
    public CorrectionType getCorrectionType() { return correctionType; }
    public String getOriginalValuesJson() { return originalValuesJson; }
    public String getProposedValuesJson() { return proposedValuesJson; }
    public String getReason() { return reason; }
    public Long getBranchId() { return branchId; }
    public LocalDate getBusinessDate() { return businessDate; }
    public CorrectionRequestStatus getStatus() { return status; }
    public String getRequestedBy() { return requestedBy; }
    public LocalDateTime getRequestedAt() { return requestedAt; }
    public String getApprovedBy() { return approvedBy; }
    public LocalDateTime getApprovedAt() { return approvedAt; }
    public String getApprovalNotes() { return approvalNotes; }
    public String getRejectedBy() { return rejectedBy; }
    public LocalDateTime getRejectedAt() { return rejectedAt; }
    public String getRejectionReason() { return rejectionReason; }
    public String getCancelledBy() { return cancelledBy; }
    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public String getExecutedBy() { return executedBy; }
    public LocalDateTime getExecutedAt() { return executedAt; }
    public String getFailureReason() { return failureReason; }
    public boolean isApprovable() { return approvable; }
    public boolean isRejectable() { return rejectable; }
    public boolean isCancellable() { return cancellable; }
}
