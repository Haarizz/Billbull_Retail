package com.billbull.backend.pos.terminal;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionTerminalHistory;
import com.billbull.backend.pos.session.PosSessionTerminalHistoryRepository;

/**
 * Session Roaming Phase 4: read/prepare helpers for "which terminal is currently hosting a
 * session," plus the single place that opens/closes {@link PosSessionTerminalHistory} segments so
 * a session is never hosted by more than one terminal at a time. {@link PosTerminalRepository} and
 * {@link PosSessionTerminalHistoryRepository} live here only; callers (e.g. {@code
 * PosSessionService}) never write hosting-history rows directly.
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
     * Opens a new hosting segment for a session on a terminal. Callers that need the
     * single-open-segment invariant enforced should go through {@link #ensureHostingSegment}
     * instead of calling this directly.
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
     * Closes the still-open hosting segment for a session, if one exists. The counterpart to
     * {@link #beginHostingSegment} — called when a session closes or its hosting terminal changes.
     */
    @Transactional
    public Optional<PosSessionTerminalHistory> endOpenHostingSegment(Long sessionId) {
        return historyRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(sessionId)
                .map(segment -> {
                    segment.setEndedAt(LocalDateTime.now());
                    return historyRepository.save(segment);
                });
    }

    /**
     * Single entry point for keeping hosting history consistent with "which terminal currently
     * hosts this session," used by session open/resume/takeover. Enforces the invariant that at
     * most one hosting segment is open per session at a time:
     * <ul>
     *   <li>no open segment yet → opens one for {@code terminal} (first hosting, e.g. session open)</li>
     *   <li>an open segment already points at {@code terminal} → no-op, returns it unchanged
     *       (resume/takeover on the same terminal must not create a duplicate row)</li>
     *   <li>an open segment points at a different terminal → closes it, then opens a new one for
     *       {@code terminal} (a hosting-terminal change)</li>
     * </ul>
     */
    @Transactional
    public PosSessionTerminalHistory ensureHostingSegment(PosSession session, PosTerminal terminal) {
        Long terminalPk = terminal != null ? terminal.getId() : null;
        Optional<PosSessionTerminalHistory> open =
                historyRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(session.getId());
        if (open.isPresent()) {
            PosSessionTerminalHistory current = open.get();
            if (Objects.equals(current.getTerminalId(), terminalPk)) {
                return current;
            }
            current.setEndedAt(LocalDateTime.now());
            historyRepository.save(current);
        }
        return beginHostingSegment(session, terminal);
    }
}
