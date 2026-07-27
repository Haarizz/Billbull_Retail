package com.billbull.backend.pos.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PosCashMovementRepository extends JpaRepository<PosCashMovement, Long> {

    /** Detail rows for the Cash Drop / Cash Out report section across a resolved set of
     *  sessions (X-Report: one session; Z-Report: the business date's resolved range) —
     *  a single batch query instead of relying on each PosSession's lazy {@code
     *  cashMovements} collection, which would otherwise trigger one query per session. */
    List<PosCashMovement> findByPosSession_IdInOrderByPerformedAtAsc(List<Long> sessionIds);

    /** SUM(amount) grouped by movementType across a set of sessions, in one query —
     *  backs both the Day Close cash reconciliation and the Consolidated Cash Position
     *  drop-in/drop-out totals. */
    @Query("SELECT m.movementType, COALESCE(SUM(m.amount), 0) FROM PosCashMovement m " +
           "WHERE m.posSession.id IN :sessionIds GROUP BY m.movementType")
    List<Object[]> sumAmountByMovementTypeForSessionIds(@Param("sessionIds") List<Long> sessionIds);
}
