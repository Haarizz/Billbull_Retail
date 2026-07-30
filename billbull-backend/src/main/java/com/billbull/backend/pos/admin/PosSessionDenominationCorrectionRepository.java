package com.billbull.backend.pos.admin;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PosSessionDenominationCorrectionRepository extends JpaRepository<PosSessionDenominationCorrection, Long> {

    Optional<PosSessionDenominationCorrection> findByCorrectionRequestId(Long correctionRequestId);

    /** All non-terminal statuses (REQUESTED, PENDING_APPROVAL, APPROVED, EXECUTING) for a
     *  session — used to block a second concurrent request (§ Validation: "prevent another
     *  request until the first is resolved"). */
    @Query("SELECT c FROM PosSessionDenominationCorrection c WHERE c.sessionId = :sessionId AND "
            + "c.status IN ('REQUESTED','PENDING_APPROVAL','APPROVED','EXECUTING')")
    List<PosSessionDenominationCorrection> findActiveForSession(@Param("sessionId") Long sessionId);

    /** The single effective correction for a session, if any — the most recently APPLIED row.
     *  Multiple historical corrections may exist per session (§ Versioning); only the latest
     *  APPLIED one is ever effective, and earlier ones are never modified or deleted. */
    @Query("SELECT c FROM PosSessionDenominationCorrection c WHERE c.sessionId = :sessionId AND "
            + "c.status = 'APPLIED' ORDER BY c.appliedAt DESC")
    List<PosSessionDenominationCorrection> findAppliedForSessionOrderByAppliedAtDesc(@Param("sessionId") Long sessionId);

    /** Back-office list/filter for the Session Denomination Corrections tab. */
    @Query("SELECT c FROM PosSessionDenominationCorrection c WHERE "
            + "(:branchId IS NULL OR c.branchId = :branchId) AND "
            + "(:sessionId IS NULL OR c.sessionId = :sessionId) AND "
            + "(:status IS NULL OR c.status = :status) "
            + "ORDER BY c.requestedAt DESC")
    Page<PosSessionDenominationCorrection> search(@Param("branchId") Long branchId,
                                                    @Param("sessionId") Long sessionId,
                                                    @Param("status") CorrectionRequestStatus status,
                                                    Pageable pageable);
}
