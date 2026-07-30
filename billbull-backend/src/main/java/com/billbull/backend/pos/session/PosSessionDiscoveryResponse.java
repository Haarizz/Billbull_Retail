package com.billbull.backend.pos.session;

/**
 * Session Roaming Phase 7 — structured, read-only response surfaced to the caller when
 * {@link PosSessionDiscoveryService#discover} reports {@code OWNER_SESSION}, {@code CONFLICT}, or
 * {@code MULTIPLE_OWNER_SESSIONS} during {@code PosSessionService#openSession}. Reports what was
 * found so the operator can decide explicitly; never moves, hosts, or transfers anything itself.
 */
public class PosSessionDiscoveryResponse {

    private PosSessionDiscoveryStatus status;
    private String message;

    // OWNER_SESSION / CONFLICT — the user's existing OPEN session elsewhere.
    private Long ownerSessionId;
    private Long ownerSessionBranchId;
    private String ownerSessionTerminalId;

    // CONFLICT only — the session currently occupying the requested terminal.
    private Long terminalSessionId;
    private String terminalSessionOpenedBy;

    // MULTIPLE_OWNER_SESSIONS only.
    private Integer ownerSessionCount;

    // Session Roaming Phase 9 — whether the owner's session found above could instead be
    // *transferred* to the terminal the caller is trying to open on, per PosSessionTransferPolicy.
    // Only populated for OWNER_SESSION/CONFLICT, where an owner session actually exists to move;
    // never exposes internal policy reasoning beyond the same reason-code enum the transfer
    // endpoint itself returns.
    private PosSessionTransferAuthorization transferAuthorization;
    private PosSessionTransferReasonCode transferReasonCode;
    private String transferMessage;

    public static PosSessionDiscoveryResponse ownerSessionElsewhere(PosSession ownerSession,
                                                                      PosSessionTransferDecision transferDecision) {
        PosSessionDiscoveryResponse response = new PosSessionDiscoveryResponse();
        response.status = PosSessionDiscoveryStatus.OWNER_SESSION;
        response.message = "An OPEN session already exists for this user on another terminal. "
                + "Confirm explicitly before opening a new one.";
        response.ownerSessionId = ownerSession.getId();
        response.ownerSessionBranchId = ownerSession.getBranchId();
        response.ownerSessionTerminalId = ownerSession.getTerminalId();
        response.applyTransferDecision(transferDecision);
        return response;
    }

    public static PosSessionDiscoveryResponse conflict(PosSession terminalSession, PosSession ownerSession,
                                                         PosSessionTransferDecision transferDecision) {
        PosSessionDiscoveryResponse response = new PosSessionDiscoveryResponse();
        response.status = PosSessionDiscoveryStatus.CONFLICT;
        response.message = "This terminal already has an OPEN session, and this user separately owns "
                + "another OPEN session elsewhere. Manual resolution required — neither session was modified.";
        response.terminalSessionId = terminalSession.getId();
        response.terminalSessionOpenedBy = terminalSession.getOpenedBy();
        response.ownerSessionId = ownerSession.getId();
        response.ownerSessionBranchId = ownerSession.getBranchId();
        response.ownerSessionTerminalId = ownerSession.getTerminalId();
        response.applyTransferDecision(transferDecision);
        return response;
    }

    private void applyTransferDecision(PosSessionTransferDecision decision) {
        if (decision == null) return;
        this.transferAuthorization = decision.getAuthorization();
        this.transferReasonCode = decision.getReasonCode();
        this.transferMessage = decision.getMessage();
    }

    public static PosSessionDiscoveryResponse multipleOwnerSessions(int ownerSessionCount) {
        PosSessionDiscoveryResponse response = new PosSessionDiscoveryResponse();
        response.status = PosSessionDiscoveryStatus.MULTIPLE_OWNER_SESSIONS;
        response.message = "This user owns " + ownerSessionCount + " OPEN sessions. Refusing to guess — "
                + "resolve manually before opening or resuming a session.";
        response.ownerSessionCount = ownerSessionCount;
        return response;
    }

    public PosSessionDiscoveryStatus getStatus() { return status; }
    public String getMessage() { return message; }
    public Long getOwnerSessionId() { return ownerSessionId; }
    public Long getOwnerSessionBranchId() { return ownerSessionBranchId; }
    public String getOwnerSessionTerminalId() { return ownerSessionTerminalId; }
    public Long getTerminalSessionId() { return terminalSessionId; }
    public String getTerminalSessionOpenedBy() { return terminalSessionOpenedBy; }
    public Integer getOwnerSessionCount() { return ownerSessionCount; }
    public PosSessionTransferAuthorization getTransferAuthorization() { return transferAuthorization; }
    public PosSessionTransferReasonCode getTransferReasonCode() { return transferReasonCode; }
    public String getTransferMessage() { return transferMessage; }
}
