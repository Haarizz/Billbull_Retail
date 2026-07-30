package com.billbull.backend.pos.admin;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Enterprise Console management view of a {@link PosSessionDenominationCorrection}. Carries
 *  every lifecycle timestamp/actor so the frontend can render an audit timeline without a
 *  second query. */
public class PosSessionDenominationCorrectionResponse {

    private Long id;
    private Long correctionRequestId;
    private String requestNumber;
    private Long sessionId;
    private Long branchId;
    private String originalDenominationJson;
    private String correctedDenominationJson;
    private BigDecimal originalTotal;
    private BigDecimal correctedTotal;
    private BigDecimal difference;
    private String reason;
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

    private boolean submittable;
    private boolean approvable;
    private boolean rejectable;
    private boolean applicable;

    public static PosSessionDenominationCorrectionResponse from(PosSessionDenominationCorrection c, String requestNumber) {
        PosSessionDenominationCorrectionResponse r = new PosSessionDenominationCorrectionResponse();
        r.id = c.getId();
        r.correctionRequestId = c.getCorrectionRequestId();
        r.requestNumber = requestNumber;
        r.sessionId = c.getSessionId();
        r.branchId = c.getBranchId();
        r.originalDenominationJson = c.getOriginalDenominationJson();
        r.correctedDenominationJson = c.getCorrectedDenominationJson();
        r.originalTotal = c.getOriginalTotal();
        r.correctedTotal = c.getCorrectedTotal();
        r.difference = c.getDifference();
        r.reason = c.getReason();
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

        r.submittable = c.getStatus() == CorrectionRequestStatus.REQUESTED;
        r.approvable = c.getStatus() == CorrectionRequestStatus.PENDING_APPROVAL;
        r.rejectable = c.getStatus() == CorrectionRequestStatus.PENDING_APPROVAL;
        r.applicable = c.getStatus() == CorrectionRequestStatus.APPROVED;
        return r;
    }

    public Long getId() { return id; }
    public Long getCorrectionRequestId() { return correctionRequestId; }
    public String getRequestNumber() { return requestNumber; }
    public Long getSessionId() { return sessionId; }
    public Long getBranchId() { return branchId; }
    public String getOriginalDenominationJson() { return originalDenominationJson; }
    public String getCorrectedDenominationJson() { return correctedDenominationJson; }
    public BigDecimal getOriginalTotal() { return originalTotal; }
    public BigDecimal getCorrectedTotal() { return correctedTotal; }
    public BigDecimal getDifference() { return difference; }
    public String getReason() { return reason; }
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
    public boolean isSubmittable() { return submittable; }
    public boolean isApprovable() { return approvable; }
    public boolean isRejectable() { return rejectable; }
    public boolean isApplicable() { return applicable; }
}
