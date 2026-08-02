package com.billbull.backend.pos.session;

/**
 * Session Roaming Phase 9 — structured result of {@link PosSessionTransferPolicy#evaluate}.
 * Immutable and side-effect free: the policy only decides, callers act on the decision.
 */
public final class PosSessionTransferDecision {

    private final PosSessionTransferAuthorization authorization;
    private final PosSessionTransferReasonCode reasonCode;
    private final String message;

    private PosSessionTransferDecision(PosSessionTransferAuthorization authorization,
                                        PosSessionTransferReasonCode reasonCode, String message) {
        this.authorization = authorization;
        this.reasonCode = reasonCode;
        this.message = message;
    }

    public static PosSessionTransferDecision allowed(PosSessionTransferReasonCode reasonCode, String message) {
        return new PosSessionTransferDecision(PosSessionTransferAuthorization.ALLOWED, reasonCode, message);
    }

    public static PosSessionTransferDecision supervisorRequired(PosSessionTransferReasonCode reasonCode, String message) {
        return new PosSessionTransferDecision(PosSessionTransferAuthorization.SUPERVISOR_REQUIRED, reasonCode, message);
    }

    public static PosSessionTransferDecision denied(PosSessionTransferReasonCode reasonCode, String message) {
        return new PosSessionTransferDecision(PosSessionTransferAuthorization.DENIED, reasonCode, message);
    }

    public PosSessionTransferAuthorization getAuthorization() { return authorization; }
    public PosSessionTransferReasonCode getReasonCode() { return reasonCode; }
    public String getMessage() { return message; }

    public boolean isAllowed() { return authorization == PosSessionTransferAuthorization.ALLOWED; }
    public boolean isSupervisorRequired() { return authorization == PosSessionTransferAuthorization.SUPERVISOR_REQUIRED; }
    public boolean isDenied() { return authorization == PosSessionTransferAuthorization.DENIED; }
}
