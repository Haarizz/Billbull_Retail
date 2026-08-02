package com.billbull.backend.pos.session;

import java.time.LocalDateTime;

/**
 * Session Roaming Phase 8 — structured success response for an explicit, operator-confirmed
 * session transfer ({@code POST /api/pos/sessions/{id}/transfer}). Built entirely from what
 * {@link PosSessionTransferService#transfer} already persisted; never recomputes hosting or log
 * state itself.
 */
public class PosSessionTransferResponse {

    private Long sessionId;
    private String sourceTerminalId;
    private String destinationTerminalId;
    private Long ownerUserId;
    private String openedBy;
    private LocalDateTime transferredAt;
    private Long transferLogId;
    private boolean supervisorAuthorized;
    private String reason;
    private PosSessionTransferAuthorization policyAuthorization;
    private PosSessionTransferReasonCode policyReasonCode;

    public static PosSessionTransferResponse of(PosSession movedSession, String sourceTerminalId,
                                                  PosSessionTransferLog logEntry, String reason,
                                                  PosSessionTransferDecision decision) {
        PosSessionTransferResponse response = new PosSessionTransferResponse();
        response.sessionId = movedSession.getId();
        response.sourceTerminalId = sourceTerminalId;
        response.destinationTerminalId = movedSession.getTerminalId();
        response.ownerUserId = movedSession.getOwnerUserId();
        response.openedBy = movedSession.getOpenedBy();
        response.reason = reason;
        if (logEntry != null) {
            response.transferLogId = logEntry.getId();
            response.transferredAt = logEntry.getCreatedAt();
            response.supervisorAuthorized = Boolean.TRUE.equals(logEntry.getSupervisorAuthorized());
        }
        if (decision != null) {
            response.policyAuthorization = decision.getAuthorization();
            response.policyReasonCode = decision.getReasonCode();
        }
        return response;
    }

    public Long getSessionId() { return sessionId; }
    public String getSourceTerminalId() { return sourceTerminalId; }
    public String getDestinationTerminalId() { return destinationTerminalId; }
    public Long getOwnerUserId() { return ownerUserId; }
    public String getOpenedBy() { return openedBy; }
    public LocalDateTime getTransferredAt() { return transferredAt; }
    public Long getTransferLogId() { return transferLogId; }
    public boolean isSupervisorAuthorized() { return supervisorAuthorized; }
    public String getReason() { return reason; }
    public PosSessionTransferAuthorization getPolicyAuthorization() { return policyAuthorization; }
    public PosSessionTransferReasonCode getPolicyReasonCode() { return policyReasonCode; }
}
