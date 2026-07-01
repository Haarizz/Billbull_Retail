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

    Optional<PosSession> findByTerminalIdAndStatus(String terminalId, PosSessionStatus status);

    Optional<PosSession> findByTerminalPkAndStatus(Long terminalPk, PosSessionStatus status);

    List<PosSession> findByBranchIdAndStatusOrderByOpenedAtDesc(Long branchId, PosSessionStatus status);

    List<PosSession> findByBranchIdAndSessionDateOrderByOpenedAtDesc(Long branchId, LocalDate sessionDate);

    @Query("SELECT s FROM PosSession s WHERE s.branchId = :branchId AND s.sessionDate = :date AND s.status = 'OPEN'")
    List<PosSession> findOpenSessionsByBranchAndDate(@Param("branchId") Long branchId, @Param("date") LocalDate date);

    boolean existsByBranchIdAndTerminalIdAndStatus(Long branchId, String terminalId, PosSessionStatus status);

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
            @Param("voidDelta")   int voidDelta);
}
