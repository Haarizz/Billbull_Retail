package com.billbull.backend.pos.terminal;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionTerminalHistory;
import com.billbull.backend.pos.session.PosSessionTerminalHistoryRepository;

/**
 * Session Roaming Phase 2 (backend plumbing only — not called by any production flow yet).
 * Read/prepare helpers for "which terminal is currently hosting a session" and the future LOCKED
 * terminal state (Phase 6). No controller or existing service invokes this class; it exists so
 * later phases don't have to duplicate the lookup/segment-bookkeeping logic below.
 */
@Service
public class PosTerminalHostingService {

    private final PosTerminalRepository terminalRepository;
    private final PosSessionTerminalHistoryRepository historyRepository;

    public PosTerminalHostingService(PosTerminalRepository terminalRepository,
                                      PosSessionTerminalHistoryRepository historyRepository) {
        this.terminalRepository = terminalRepository;
        this.historyRepository = historyRepository;
    }

    /**
     * The terminal currently hosting a session, resolved terminal-first via
     * {@code PosSession#terminalId} — the same field/lookup {@code PosSessionService} already uses
     * everywhere. Introduces no new query semantics, just a named, reusable entry point.
     */
    @Transactional(readOnly = true)
    public Optional<PosTerminal> resolveHostingTerminal(PosSession session) {
        if (session == null || session.getTerminalId() == null) {
            return Optional.empty();
        }
        return terminalRepository.findByTerminalId(session.getTerminalId());
    }

    /**
     * True when the terminal carries a Phase 1 lock pointer. {@link PosTerminalStatus} has no
     * LOCKED value yet and nothing sets these columns in production — this only reads them so a
     * later phase's guard has a single place to check rather than re-deriving the null-check.
     */
    public boolean isLocked(PosTerminal terminal) {
        return terminal != null && terminal.getLockedSessionId() != null;
    }

    /**
     * Opens a new hosting segment for a session on a terminal. Not invoked by any production
     * flow — reserved for the future terminal-hop/transfer logic (Phase 3/7), which will call this
     * instead of writing {@link PosSessionTerminalHistory} rows ad hoc.
     */
    @Transactional
    public PosSessionTerminalHistory beginHostingSegment(PosSession session, PosTerminal terminal) {
        PosSessionTerminalHistory segment = new PosSessionTerminalHistory();
        segment.setSessionId(session.getId());
        segment.setTerminalId(terminal != null ? terminal.getId() : null);
        segment.setCounterId(terminal != null ? terminal.getCounterId() : null);
        segment.setCounterName(terminal != null ? terminal.getCounterName() : null);
        segment.setStartedAt(LocalDateTime.now());
        return historyRepository.save(segment);
    }

    /**
     * Closes the still-open hosting segment for a session, if one exists. Not invoked by any
     * production flow — the counterpart to {@link #beginHostingSegment}, reserved for the same
     * future phases.
     */
    @Transactional
    public Optional<PosSessionTerminalHistory> endOpenHostingSegment(Long sessionId) {
        return historyRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(sessionId)
                .map(segment -> {
                    segment.setEndedAt(LocalDateTime.now());
                    return historyRepository.save(segment);
                });
    }
}
