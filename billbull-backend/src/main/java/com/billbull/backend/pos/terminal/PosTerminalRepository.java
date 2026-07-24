package com.billbull.backend.pos.terminal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PosTerminalRepository extends JpaRepository<PosTerminal, Long> {
    // Terminal identity is scoped per branch: the same device fingerprint may legitimately match
    // a different terminal row in every branch it has been used in.
    Optional<PosTerminal> findByDeviceFingerprintAndBranchId(String deviceFingerprint, Long branchId);
    Optional<PosTerminal> findByTerminalId(String terminalId);
    List<PosTerminal> findByBranchIdAndStatus(Long branchId, PosTerminalStatus status);
    List<PosTerminal> findByBranchIdOrderByTerminalIdAsc(Long branchId);
    List<PosTerminal> findByBranchId(Long branchId);
    int countByBranchIdAndStatus(Long branchId, PosTerminalStatus status);

    /** Phase D — terminals currently bound to a given Hardware Profile. */
    List<PosTerminal> findByHardwareProfileId(Long hardwareProfileId);

    // Counter association queries (used by PosCounterService validation)
    long countByCounterId(Long counterId);

    // Counts terminals that are operationally active at a counter (excludes archived/decomm/blocked)
    @Query("SELECT COUNT(t) FROM PosTerminal t WHERE t.counterId = :counterId " +
           "AND t.status NOT IN ('ARCHIVED', 'DECOMMISSIONED', 'BLOCKED')")
    long countByCounterIdAndStatusIn(@Param("counterId") Long counterId);

    // Heartbeat / offline-detection queries (used by PosTerminalScheduler)
    @Query("SELECT t FROM PosTerminal t WHERE t.branchId = :branchId " +
           "AND t.status IN ('ACTIVE', 'IDLE') " +
           "AND (t.lastHeartbeatAt IS NULL OR t.lastHeartbeatAt < :threshold)")
    List<PosTerminal> findStaleTerminals(@Param("branchId") Long branchId,
                                         @Param("threshold") LocalDateTime threshold);

    @Query("SELECT t FROM PosTerminal t WHERE t.status IN ('ACTIVE', 'IDLE') " +
           "AND (t.lastHeartbeatAt IS NULL OR t.lastHeartbeatAt < :threshold)")
    List<PosTerminal> findAllStaleTerminals(@Param("threshold") LocalDateTime threshold);

    // Atomic session lock — returns 1 if the lock was acquired, 0 if terminal was already occupied
    @Modifying
    @Query(value = "UPDATE pos_terminals SET current_open_session_id = :sessionId " +
                   "WHERE id = :terminalId AND current_open_session_id IS NULL",
           nativeQuery = true)
    int setOpenSession(@Param("terminalId") Long terminalId, @Param("sessionId") Long sessionId);

    @Modifying
    @Query(value = "UPDATE pos_terminals SET current_open_session_id = NULL " +
                   "WHERE id = :terminalId AND current_open_session_id = :sessionId",
           nativeQuery = true)
    int clearOpenSession(@Param("terminalId") Long terminalId, @Param("sessionId") Long sessionId);

    // Pending-registration terminals for a branch (awaiting supervisor approval)
    List<PosTerminal> findByBranchIdAndRegistrationStatus(Long branchId, String registrationStatus);

    // Count terminals that occupy a branch's terminal-license slot: excludes ARCHIVED (temporary,
    // reversible — see restore()) and DECOMMISSIONED (permanent retirement — see decommission()).
    // Both statuses represent capacity the branch is no longer using, so neither should count
    // against maxTerminalsPerBranch; only BLOCKED and every operational status still hold a slot.
    @Query("SELECT COUNT(t) FROM PosTerminal t WHERE t.branchId = :branchId " +
           "AND t.status NOT IN ('ARCHIVED', 'DECOMMISSIONED')")
    long countActiveLimitByBranchId(@Param("branchId") Long branchId);

    // Terminal Auto-Archive lifecycle: sweep candidates for a branch — everything except
    // terminals already archived/decommissioned/blocked or exempted from the sweep.
    @Query("SELECT t FROM PosTerminal t WHERE t.branchId = :branchId " +
           "AND t.status NOT IN ('ARCHIVED', 'DECOMMISSIONED', 'BLOCKED') " +
           "AND t.autoArchiveExempt = false")
    List<PosTerminal> findAutoArchiveCandidates(@Param("branchId") Long branchId);

    // Atomic "touch" of last_activity_at: only ever advances, never regresses, and never loads the
    // full entity on this hot path (called from every activity-producing POS flow).
    @Modifying
    @Query(value = "UPDATE pos_terminals SET last_activity_at = :now " +
                   "WHERE terminal_id = :terminalId " +
                   "AND (last_activity_at IS NULL OR last_activity_at < :now)",
           nativeQuery = true)
    int touchLastActivity(@Param("terminalId") String terminalId, @Param("now") LocalDateTime now);
}
