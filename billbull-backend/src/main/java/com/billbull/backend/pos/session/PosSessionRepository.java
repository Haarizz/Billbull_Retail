package com.billbull.backend.pos.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PosSessionRepository extends JpaRepository<PosSession, Long> {

    Optional<PosSession> findByBranchIdAndTerminalIdAndStatus(Long branchId, String terminalId, PosSessionStatus status);

    // Session Roaming Phase 2 (backend plumbing) — not called by any production flow yet. Reserved
    // for the future user-first session resolution (see PosSessionResolutionStrategy); existing
    // lookups above remain terminal-first and unchanged.
    List<PosSession> findByOwnerUserIdAndStatus(Long ownerUserId, PosSessionStatus status);
    
    List<PosSession> findByOwnerUserIdAndBranchIdAndStatus(Long ownerUserId, Long branchId, PosSessionStatus status);


    Optional<PosSession> findByTerminalIdAndStatus(String terminalId, PosSessionStatus status);

    /**
     * The session row, locked for the rest of the enclosing transaction.
     *
     * <p>Closing a drawer reads its status, spends a single-use approval grant, freezes a
     * financial snapshot, posts a journal and writes an audit completion. Without a lock two
     * simultaneous closes can both pass the status check under read-committed and interleave
     * through all of it. GL idempotency on {@code SCL-{id}} prevents a duplicate journal, but
     * not a duplicate finalization, a doubly-spent grant, or two audit completions.
     *
     * <p>Same pattern as {@code ReceiptVoucherRepository#findByIdForUpdate}, which serialises
     * concurrent advance applications for the same reason.
     */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT s FROM PosSession s WHERE s.id = :id")
    Optional<PosSession> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);

    Optional<PosSession> findByTerminalPkAndStatus(Long terminalPk, PosSessionStatus status);

    // Most recent session regardless of status — used by the Terminal Auto-Archive lifecycle
    // to compute "last activity" and to snapshot archive context (one-off lookup, not hot-path).
    Optional<PosSession> findTopByTerminalPkOrderByOpenedAtDesc(Long terminalPk);

    List<PosSession> findByBranchIdAndStatusOrderByOpenedAtDesc(Long branchId, PosSessionStatus status);

    List<PosSession> findByBranchIdAndSessionDateOrderByOpenedAtDesc(Long branchId, LocalDate sessionDate);

    // Day Close domain ONLY (resolveSessionRange/closeDay session grouping) — keyed on
    // tradingDate (the real calendar day the session opened), not sessionDate (the
    // Business-Date accounting bucket every other consumer still uses).
    List<PosSession> findByBranchIdAndTradingDateOrderByOpenedAtDesc(Long branchId, LocalDate tradingDate);

    // Date-range browsing for the Session/X-Report history picker.
    List<PosSession> findByBranchIdAndSessionDateBetweenOrderByOpenedAtDesc(Long branchId, LocalDate from, LocalDate to);

    @Query("SELECT s FROM PosSession s WHERE s.branchId = :branchId AND s.sessionDate = :date AND s.status = 'OPEN'")
    List<PosSession> findOpenSessionsByBranchAndDate(@Param("branchId") Long branchId, @Param("date") LocalDate date);

    // Unclosed sessions (OPEN or SUSPENDED) from a prior business day — used to block
    // opening a new day/session until the stale one is explicitly closed.
    @Query("SELECT s FROM PosSession s WHERE s.branchId = :branchId AND s.sessionDate < :date " +
           "AND s.status IN ('OPEN', 'SUSPENDED') ORDER BY s.sessionDate ASC")
    List<PosSession> findUnclosedSessionsBeforeDate(@Param("branchId") Long branchId, @Param("date") LocalDate date);

    // Session-driven Day Close resolution (PosPendingDayCloseResolver): the trading
    // date (real calendar open day, not the Business Date accounting bucket) of the
    // earliest session strictly after the branch's last closed date is the next date
    // requiring a Day Close. Any calendar date with zero sessions is simply never
    // returned by these queries — no "skip" is ever needed for it.
    @Query("select min(s.tradingDate) from PosSession s where s.branchId = :branchId and s.tradingDate > :afterDate")
    Optional<LocalDate> findEarliestTradingDateAfter(@Param("branchId") Long branchId, @Param("afterDate") LocalDate afterDate);

    @Query("select min(s.tradingDate) from PosSession s where s.branchId = :branchId")
    Optional<LocalDate> findEarliestTradingDate(@Param("branchId") Long branchId);

    // Business Day Engine (Phase 1 — shadow mode, not yet wired into any production
    // decision). BusinessDayStateService's read-only view of "does this branch have
    // an unclosed Business Day, and if so which one" — the oldest tradingDate with
    // sessions but no matching PosDayClose row. Deliberately reuses tradingDate
    // rather than introducing a new column: per the approved architecture, sessionDate
    // and tradingDate/businessDay stay separate, and tradingDate already represents
    // exactly the day a session's trading activity belongs to for Day-Close purposes.
    @Query("select min(s.tradingDate) from PosSession s where s.branchId = :branchId and s.tradingDate is not null " +
           "and not exists (select 1 from com.billbull.backend.pos.dayclose.PosDayClose d " +
           "where d.branchId = s.branchId and d.closeDate = s.tradingDate)")
    Optional<LocalDate> findOldestUnclosedTradingDate(@Param("branchId") Long branchId);

    boolean existsByBranchIdAndTerminalIdAndStatus(Long branchId, String terminalId, PosSessionStatus status);

    /**
     * Every session on a branch — <b>any</b> terminal, <b>any</b> Trading Date — that would be
     * damaged by re-timing the Business Day underneath it: sessions still OPEN, plus sessions
     * whose closure workflow has been started but which are not yet CLOSED (the
     * {@code closingStartedAt IS NOT NULL} case that {@code PosSessionClosureWorkflowGate}
     * recognises, where the status is deliberately still OPEN/SUSPENDED).
     *
     * <p>Not a second definition of "active session": this is the exact
     * {@code OPEN} ∪ {@code isInClosureWorkflow} set those two existing authorities already
     * describe, expressed as one query so the schedule guard cannot drift from them. A plain
     * SUSPENDED session with no closure started is excluded for the same reason
     * {@code PosSessionClosureWorkflowGate} excludes it — it is not in the workflow — and it
     * remains protected by {@code BusinessDayContinuationGate} when it is resumed.
     *
     * <p>Ordered oldest-first so the rejection message can name the longest-running session.
     */
    @Query("SELECT s FROM PosSession s WHERE s.branchId = :branchId AND ("
            + "s.status = com.billbull.backend.pos.session.PosSessionStatus.OPEN "
            + "OR (s.status = com.billbull.backend.pos.session.PosSessionStatus.SUSPENDED "
            + "AND s.closingStartedAt IS NOT NULL)) "
            + "ORDER BY s.openedAt ASC")
    List<PosSession> findBusinessDayScheduleLockingSessions(@Param("branchId") Long branchId);

    // Sessions idle past the threshold — used by PosSessionScheduler to auto-suspend
    @Query("SELECT s FROM PosSession s WHERE s.status = 'OPEN' " +
           "AND s.idleTimeoutMinutes IS NOT NULL AND s.idleTimeoutMinutes > 0 " +
           "AND (s.lastActivityAt IS NULL OR s.lastActivityAt < :threshold)")
    List<PosSession> findIdleSessionsBefore(@Param("threshold") LocalDateTime threshold);

    // Sessions that hit their hard wall-clock limit — used by PosSessionScheduler
    @Query("SELECT s FROM PosSession s WHERE s.status = 'OPEN' " +
           "AND s.sessionTimeoutAt IS NOT NULL AND s.sessionTimeoutAt < :now")
    List<PosSession> findTimedOutSessions(@Param("now") LocalDateTime now);

    // Update last activity timestamp without a full entity round-trip
    @Modifying
    @Query("UPDATE PosSession s SET s.lastActivityAt = :now WHERE s.id = :sessionId AND s.status = 'OPEN'")
    int touchLastActivity(@Param("sessionId") Long sessionId, @Param("now") LocalDateTime now);

    /**
     * Atomic session-total increment: avoids a SELECT then UPDATE hot-row pattern
     * under concurrent checkout load. Each column is a blind add — the DB enforces
     * the arithmetic without loading the entity first.
     */
    @Modifying
    @Query(value = """
            UPDATE pos_sessions SET
              total_sales       = COALESCE(total_sales, 0)       + :totalSales,
              total_cash_sales  = COALESCE(total_cash_sales, 0)  + :cashDelta,
              total_card_sales  = COALESCE(total_card_sales, 0)  + :cardDelta,
              total_credit_sales= COALESCE(total_credit_sales,0) + :creditDelta,
              total_mixed_sales = COALESCE(total_mixed_sales, 0) + :mixedDelta,
              total_online_sales= COALESCE(total_online_sales,0) + :onlineDelta,
              total_voids       = COALESCE(total_voids, 0)       + :voidDelta,
              invoice_count     = COALESCE(invoice_count, 0)     + 1
            WHERE id = :sessionId AND status = 'OPEN'
            """, nativeQuery = true)
    int incrementSessionTotals(
            @Param("sessionId")   Long sessionId,
            @Param("totalSales")  BigDecimal totalSales,
            @Param("cashDelta")   BigDecimal cashDelta,
            @Param("cardDelta")   BigDecimal cardDelta,
            @Param("creditDelta") BigDecimal creditDelta,
            @Param("mixedDelta")  BigDecimal mixedDelta,
            @Param("onlineDelta") BigDecimal onlineDelta,
            @Param("voidDelta")   int voidDelta);
}
