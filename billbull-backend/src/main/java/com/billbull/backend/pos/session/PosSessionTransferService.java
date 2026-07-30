package com.billbull.backend.pos.session;

import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalHostingService;
import com.billbull.backend.pos.terminal.PosTerminalRepository;

/**
 * Session Roaming Phase 7 — explicit, operator-confirmed session transfer between terminals.
 *
 * <p>Not wired into any controller yet: no API exposes it, and nothing calls it automatically.
 * {@link PosSessionDiscoveryService} only reports OWNER_SESSION/CONFLICT/MULTIPLE_OWNER_SESSIONS;
 * this service is where a later phase's explicit "yes, move it" confirmation would land. It never
 * writes hosting-history or terminal-lock rows directly — those go through
 * {@link PosTerminalHostingService} and {@link PosTerminalRepository#setOpenSession}/
 * {@link PosTerminalRepository#clearOpenSession}, the same primitives {@code PosSessionService}
 * already uses for open/close/resume, so a session is never hosted by more than one terminal.
 */
@Service
public class PosSessionTransferService {

    private final PosSessionRepository sessionRepository;
    private final PosTerminalRepository terminalRepository;
    private final PosTerminalHostingService terminalHostingService;
    private final PosSessionTransferLogRepository transferLogRepository;

    public PosSessionTransferService(PosSessionRepository sessionRepository,
                                      PosTerminalRepository terminalRepository,
                                      PosTerminalHostingService terminalHostingService,
                                      PosSessionTransferLogRepository transferLogRepository) {
        this.sessionRepository = sessionRepository;
        this.terminalRepository = terminalRepository;
        this.terminalHostingService = terminalHostingService;
        this.transferLogRepository = transferLogRepository;
    }

    /**
     * Moves an OPEN or SUSPENDED session's hosting from its current terminal to
     * {@code destinationTerminalId}, preserving the session's owner/openedBy unchanged. Atomic:
     * if any step (eligibility, lock hand-off, hosting update, or log write) fails, the whole
     * transfer rolls back and neither terminal's lock nor the session is left in a partial state.
     *
     * @param sessionId the session to move
     * @param destinationTerminalId the {@code PosTerminal#terminalId} to move it to
     * @param initiatedByUserId stable user id of whoever confirmed the transfer (cashier or supervisor)
     * @param supervisorAuthorized whether a supervisor explicitly authorized this transfer
     */
    @Transactional
    public PosSession transfer(Long sessionId, String destinationTerminalId,
                                Long initiatedByUserId, boolean supervisorAuthorized) {
        PosSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "POS session not found: " + sessionId));

        if (session.getStatus() != PosSessionStatus.OPEN && session.getStatus() != PosSessionStatus.SUSPENDED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only OPEN or SUSPENDED sessions can be transferred; session " + sessionId
                            + " is " + session.getStatus());
        }

        PosTerminal destination = terminalRepository.findByTerminalId(destinationTerminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Destination terminal not found: " + destinationTerminalId));

        if (Objects.equals(destination.getId(), session.getTerminalPk())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Session " + sessionId + " is already hosted on terminal " + destinationTerminalId + ".");
        }
        if (destination.getCurrentOpenSessionId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Destination terminal " + destinationTerminalId + " already hosts an open session (#"
                            + destination.getCurrentOpenSessionId() + ").");
        }

        Long sourceTerminalPk = session.getTerminalPk();

        // Hand off the DB-level terminal lock — same partial-unique-index safety net
        // PosSessionService#openSession relies on for concurrent claims.
        if (sourceTerminalPk != null) {
            terminalRepository.clearOpenSession(sourceTerminalPk, session.getId());
        }
        int acquired = terminalRepository.setOpenSession(destination.getId(), session.getId());
        if (acquired == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Destination terminal " + destinationTerminalId + " was claimed concurrently; transfer aborted.");
        }

        session.setTerminalId(destination.getTerminalId());
        session.setTerminalPk(destination.getId());
        session.setCounterId(destination.getCounterId());
        session.setCounterName(destination.getCounterName());
        PosSession moved = sessionRepository.save(session);

        // Closes the old hosting segment and opens a new one for the destination terminal.
        terminalHostingService.ensureHostingSegment(moved, destination);

        PosSessionTransferLog logEntry = new PosSessionTransferLog();
        logEntry.setSessionId(moved.getId());
        logEntry.setFromTerminalId(sourceTerminalPk);
        logEntry.setToTerminalId(destination.getId());
        logEntry.setInitiatedByUserId(initiatedByUserId);
        logEntry.setSupervisorAuthorized(supervisorAuthorized);
        transferLogRepository.save(logEntry);

        return moved;
    }
}
