package com.billbull.backend.pos.session;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;

/**
 * Dedicated service for lightweight POS session synchronization.
 * Extracted from PosSessionController/PosSessionService to isolate
 * the high-frequency polling logic from heavy business operations.
 */
@Service
public class PosSessionSyncService {

    private final PosSessionRepository sessionRepository;

    public PosSessionSyncService(PosSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    @Transactional(readOnly = true)
    public PosSessionSyncResponse syncSession(Long sessionId, String terminalId) {
        Optional<PosSession> sessionOpt = sessionRepository.findById(sessionId);
        
        if (sessionOpt.isEmpty()) {
            return PosSessionSyncResponse.invalid(PosSessionSyncReason.INVALID, "Session does not exist.");
        }

        PosSession session = sessionOpt.get();

        if (session.getStatus() == PosSessionStatus.CLOSED) {
            return PosSessionSyncResponse.invalid(PosSessionSyncReason.CLOSED, "This session has been closed.");
        }

        if (session.getStatus() != PosSessionStatus.OPEN && session.getStatus() != PosSessionStatus.SUSPENDED) {
            return PosSessionSyncResponse.invalid(PosSessionSyncReason.INVALID, "Session is no longer active.");
        }

        if (terminalId != null && !terminalId.equals(session.getTerminalId())) {
            return PosSessionSyncResponse.invalid(PosSessionSyncReason.TRANSFERRED, "This session has been transferred to another terminal.");
        }

        return PosSessionSyncResponse.valid();
    }
}
