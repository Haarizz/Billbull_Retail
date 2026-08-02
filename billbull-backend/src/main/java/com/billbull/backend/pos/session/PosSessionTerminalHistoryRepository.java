package com.billbull.backend.pos.session;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Session Roaming Phase 1 (schema foundation) / Phase 2 (finder methods added, still not called
 * by any production flow). These finders exist for the future hosting-history read paths (session
 * detail "hosted on" timeline, Phase 6 LOCKED-terminal resolution) — {@link
 * com.billbull.backend.pos.terminal.PosTerminalHostingService} is the only current caller, and it
 * is itself dormant.
 */
public interface PosSessionTerminalHistoryRepository extends JpaRepository<PosSessionTerminalHistory, Long> {

    List<PosSessionTerminalHistory> findBySessionIdOrderByStartedAtDesc(Long sessionId);

    /** The still-open hosting segment (endedAt IS NULL) for a session, if any. At most one should
     *  ever exist per session — a later phase's segment-open logic is responsible for that invariant. */
    Optional<PosSessionTerminalHistory> findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(Long sessionId);
}
