package com.billbull.backend.pos.session;

/**
 * Lightweight DTO for POS session synchronization polling.
 * Avoids serializing the full PosSession graph.
 */
public record PosSessionSyncResponse(
        boolean sessionValid,
        PosSessionSyncReason reason,
        String message
) {
    public static PosSessionSyncResponse valid() {
        return new PosSessionSyncResponse(true, null, null);
    }

    public static PosSessionSyncResponse invalid(PosSessionSyncReason reason, String message) {
        return new PosSessionSyncResponse(false, reason, message);
    }
}
