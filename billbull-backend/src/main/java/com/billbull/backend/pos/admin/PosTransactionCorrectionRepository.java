package com.billbull.backend.pos.admin;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PosTransactionCorrectionRepository extends JpaRepository<PosTransactionCorrection, Long> {

    /** Single indexed lookup (unique per the entity's DB constraint) — used by Phase 5's Audit
     *  View to resolve which transaction correction a given generic CorrectionRequest maps to,
     *  without scanning the table. */
    Optional<PosTransactionCorrection> findByCorrectionRequestId(Long correctionRequestId);

    /** Non-terminal statuses (REQUESTED, PENDING_APPROVAL, APPROVED, EXECUTING) for a target —
     *  blocks a second concurrent request against the same transaction (§ Validation). */
    @Query("SELECT c FROM PosTransactionCorrection c WHERE c.targetType = :targetType AND c.targetId = :targetId "
            + "AND c.status IN ('REQUESTED','PENDING_APPROVAL','APPROVED','EXECUTING')")
    List<PosTransactionCorrection> findActiveForTarget(@Param("targetType") CorrectionTargetType targetType,
                                                        @Param("targetId") Long targetId);

    /** Highest version number ever requested for a target (0 if none) — the next correction's
     *  version is this + 1, whether or not the previous one was ever applied. */
    @Query("SELECT COALESCE(MAX(c.version), 0) FROM PosTransactionCorrection c WHERE "
            + "c.targetType = :targetType AND c.targetId = :targetId")
    Integer findMaxVersionForTarget(@Param("targetType") CorrectionTargetType targetType,
                                     @Param("targetId") Long targetId);

    /** The current effective correction for a target — the most recently APPLIED row.
     *  Earlier corrections (superseded or never applied) are never modified or deleted. */
    @Query("SELECT c FROM PosTransactionCorrection c WHERE c.targetType = :targetType AND c.targetId = :targetId "
            + "AND c.status = 'APPLIED' ORDER BY c.appliedAt DESC")
    List<PosTransactionCorrection> findAppliedForTargetOrderByAppliedAtDesc(@Param("targetType") CorrectionTargetType targetType,
                                                                            @Param("targetId") Long targetId);

    /** Back-office list/filter for the Transaction Corrections tab. */
    @Query("SELECT c FROM PosTransactionCorrection c WHERE "
            + "(:branchId IS NULL OR c.branchId = :branchId) AND "
            + "(:targetType IS NULL OR c.targetType = :targetType) AND "
            + "(:correctionType IS NULL OR c.correctionType = :correctionType) AND "
            + "(:targetId IS NULL OR c.targetId = :targetId) AND "
            + "(:status IS NULL OR c.status = :status) "
            + "ORDER BY c.requestedAt DESC")
    Page<PosTransactionCorrection> search(@Param("branchId") Long branchId,
                                           @Param("targetType") CorrectionTargetType targetType,
                                           @Param("correctionType") CorrectionType correctionType,
                                           @Param("targetId") Long targetId,
                                           @Param("status") CorrectionRequestStatus status,
                                           Pageable pageable);
}
