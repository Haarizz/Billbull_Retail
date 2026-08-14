package com.billbull.backend.pos.session;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface PosCashMovementRepository extends JpaRepository<PosCashMovement, Long> {

    /** Detail rows for the Cash Drop / Cash Out report section across a resolved set of
     *  sessions (X-Report: one session; Z-Report: the business date's resolved range) —
     *  a single batch query instead of relying on each PosSession's lazy {@code
     *  cashMovements} collection, which would otherwise trigger one query per session.
     *  Includes VOIDED rows deliberately — report detail must show voided movements
     *  (with a status badge), only the summed totals exclude them. */
    List<PosCashMovement> findByPosSession_IdInOrderByPerformedAtAsc(List<Long> sessionIds);

    /**
     * Movements carrying a specific reference, direction and status. Backs the Sales Return
     * cash-refund duplicate guard, which stores the return number in {@code reference} — a
     * retried confirmation must never pay the customer out of the drawer twice.
     *
     * <p>Callers pass {@code ACTIVE}: a voided refund movement means the cash went back into
     * the drawer, so re-issuing the refund is legitimate rather than a duplicate.
     */
    List<PosCashMovement> findByReferenceAndMovementTypeAndStatus(String reference,
                                                                  PosCashMovementType movementType,
                                                                  PosCashMovementStatus status);

    /** SUM(amount) grouped by movementType across a set of sessions, restricted to the
     *  given status — backs both the Day Close cash reconciliation and the Consolidated
     *  Cash Position drop-in/drop-out totals. Callers pass {@code ACTIVE} so voided
     *  movements never affect reconciliation or reporting totals. */
    @Query("SELECT m.movementType, COALESCE(SUM(m.amount), 0) FROM PosCashMovement m " +
           "WHERE m.posSession.id IN :sessionIds AND m.status = :status GROUP BY m.movementType")
    List<Object[]> sumAmountByMovementTypeForSessionIds(@Param("sessionIds") List<Long> sessionIds,
                                                          @Param("status") PosCashMovementStatus status);

    /** Back-office list/filter for the Cash Drop / Outs module. Every filter is optional
     *  (null = don't filter on it). */
    @Query("SELECT m FROM PosCashMovement m WHERE "
            + "(:branchId IS NULL OR m.branchId = :branchId) AND "
            + "(:sessionId IS NULL OR m.posSession.id = :sessionId) AND "
            + "(:status IS NULL OR m.status = :status) AND "
            + "(:movementType IS NULL OR m.movementType = :movementType) AND "
            + "(:fromDate IS NULL OR m.businessDate >= :fromDate) AND "
            + "(:toDate IS NULL OR m.businessDate <= :toDate) AND "
            + "(:performedBy IS NULL OR m.performedBy = :performedBy) "
            + "ORDER BY m.performedAt DESC")
    Page<PosCashMovement> search(@Param("branchId") Long branchId,
                                  @Param("sessionId") Long sessionId,
                                  @Param("status") PosCashMovementStatus status,
                                  @Param("movementType") PosCashMovementType movementType,
                                  @Param("fromDate") LocalDate fromDate,
                                  @Param("toDate") LocalDate toDate,
                                  @Param("performedBy") String performedBy,
                                  Pageable pageable);
}
