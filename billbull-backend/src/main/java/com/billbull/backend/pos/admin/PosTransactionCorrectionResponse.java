package com.billbull.backend.pos.admin;

import java.time.LocalDateTime;

/** Enterprise Console management view of a {@link PosTransactionCorrection}. */
public class PosTransactionCorrectionResponse {

    private Long id;
    private Long correctionRequestId;
    private String requestNumber;
    private CorrectionTargetType targetType;
    private Long targetId;
    private CorrectionType correctionType;
    private Long branchId;
    private String originalSnapshotJson;
    private String correctedSnapshotJson;
    private String differenceSummaryJson;
    private String reason;
    private Integer version;
    private CorrectionRequestStatus status;

    private String requestedBy;
    private LocalDateTime requestedAt;
    private String approvedBy;
    private LocalDateTime approvedAt;
    private String rejectedBy;
    private LocalDateTime rejectedAt;
    private String rejectionReason;
    private String appliedBy;
    private LocalDateTime appliedAt;
    private String executionError;

    private boolean submittable;
    private boolean approvable;
    private boolean rejectable;
    private boolean applicable;

    public static PosTransactionCorrectionResponse from(PosTransactionCorrection c, String requestNumber) {
        PosTransactionCorrectionResponse r = new PosTransactionCorrectionResponse();
        r.id = c.getId();
        r.correctionRequestId = c.getCorrectionRequestId();
        r.requestNumber = requestNumber;
        r.targetType = c.getTargetType();
        r.targetId = c.getTargetId();
        r.correctionType = c.getCorrectionType();
        r.branchId = c.getBranchId();
        r.originalSnapshotJson = c.getOriginalSnapshotJson();
        r.correctedSnapshotJson = c.getCorrectedSnapshotJson();
        r.differenceSummaryJson = c.getDifferenceSummaryJson();
        r.reason = c.getReason();
        r.version = c.getVersion();
        r.status = c.getStatus();
        r.requestedBy = c.getRequestedBy();
        r.requestedAt = c.getRequestedAt();
        r.approvedBy = c.getApprovedBy();
        r.approvedAt = c.getApprovedAt();
        r.rejectedBy = c.getRejectedBy();
        r.rejectedAt = c.getRejectedAt();
        r.rejectionReason = c.getRejectionReason();
        r.appliedBy = c.getAppliedBy();
        r.appliedAt = c.getAppliedAt();
        r.executionError = c.getExecutionError();

        r.submittable = c.getStatus() == CorrectionRequestStatus.REQUESTED;
        r.approvable = c.getStatus() == CorrectionRequestStatus.PENDING_APPROVAL;
        r.rejectable = c.getStatus() == CorrectionRequestStatus.PENDING_APPROVAL;
        r.applicable = c.getStatus() == CorrectionRequestStatus.APPROVED;
        return r;
    }

    public Long getId() { return id; }
    public Long getCorrectionRequestId() { return correctionRequestId; }
    public String getRequestNumber() { return requestNumber; }
    public CorrectionTargetType getTargetType() { return targetType; }
    public Long getTargetId() { return targetId; }
    public CorrectionType getCorrectionType() { return correctionType; }
    public Long getBranchId() { return branchId; }
    public String getOriginalSnapshotJson() { return originalSnapshotJson; }
    public String getCorrectedSnapshotJson() { return correctedSnapshotJson; }
    public String getDifferenceSummaryJson() { return differenceSummaryJson; }
    public String getReason() { return reason; }
    public Integer getVersion() { return version; }
    public CorrectionRequestStatus getStatus() { return status; }
    public String getRequestedBy() { return requestedBy; }
    public LocalDateTime getRequestedAt() { return requestedAt; }
    public String getApprovedBy() { return approvedBy; }
    public LocalDateTime getApprovedAt() { return approvedAt; }
    public String getRejectedBy() { return rejectedBy; }
    public LocalDateTime getRejectedAt() { return rejectedAt; }
    public String getRejectionReason() { return rejectionReason; }
    public String getAppliedBy() { return appliedBy; }
    public LocalDateTime getAppliedAt() { return appliedAt; }
    public String getExecutionError() { return executionError; }
    public boolean isSubmittable() { return submittable; }
    public boolean isApprovable() { return approvable; }
    public boolean isRejectable() { return rejectable; }
    public boolean isApplicable() { return applicable; }
}
