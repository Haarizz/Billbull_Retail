package com.billbull.backend.pos.admin;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface CorrectionRequestRepository extends JpaRepository<CorrectionRequest, Long> {

    /** Back-office list/filter for the Correction Approvals tab. Every filter is optional
     *  (null = don't filter on it), mirroring PosCashMovementRepository#search. */
    @Query("SELECT c FROM CorrectionRequest c WHERE "
            + "(:branchId IS NULL OR c.branchId = :branchId) AND "
            + "(:status IS NULL OR c.status = :status) AND "
            + "(:targetType IS NULL OR c.targetType = :targetType) AND "
            + "(:correctionType IS NULL OR c.correctionType = :correctionType) "
            + "ORDER BY c.requestedAt DESC")
    Page<CorrectionRequest> search(@Param("branchId") Long branchId,
                                    @Param("status") CorrectionRequestStatus status,
                                    @Param("targetType") CorrectionTargetType targetType,
                                    @Param("correctionType") CorrectionType correctionType,
                                    Pageable pageable);

    // ── Phase 5: unified History search (reporting only — read-only, no new workflow) ──────

    /** Every filter optional. {@code search} matches requestNumber or reason (case-insensitive
     *  substring) — the "correction number / reason / reference" search the History tab needs,
     *  since requestNumber is this system's reference/correction-number. */
    @Query("SELECT c FROM CorrectionRequest c WHERE "
            + "(:branchId IS NULL OR c.branchId = :branchId) AND "
            + "(:status IS NULL OR c.status = :status) AND "
            + "(:targetType IS NULL OR c.targetType = :targetType) AND "
            + "(:correctionType IS NULL OR c.correctionType = :correctionType) AND "
            + "(:targetId IS NULL OR c.targetId = :targetId) AND "
            + "(:requestedBy IS NULL OR LOWER(c.requestedBy) = LOWER(:requestedBy)) AND "
            + "(:approvedBy IS NULL OR LOWER(c.approvedBy) = LOWER(:approvedBy)) AND "
            + "(:fromDate IS NULL OR c.requestedAt >= :fromDate) AND "
            + "(:toDate IS NULL OR c.requestedAt <= :toDate) AND "
            + "(:search IS NULL OR LOWER(c.requestNumber) LIKE LOWER(CONCAT('%', :search, '%')) "
            + "     OR LOWER(c.reason) LIKE LOWER(CONCAT('%', :search, '%'))) "
            + "ORDER BY c.requestedAt DESC")
    Page<CorrectionRequest> searchHistory(@Param("branchId") Long branchId,
                                           @Param("status") CorrectionRequestStatus status,
                                           @Param("targetType") CorrectionTargetType targetType,
                                           @Param("correctionType") CorrectionType correctionType,
                                           @Param("targetId") Long targetId,
                                           @Param("requestedBy") String requestedBy,
                                           @Param("approvedBy") String approvedBy,
                                           @Param("fromDate") LocalDateTime fromDate,
                                           @Param("toDate") LocalDateTime toDate,
                                           @Param("search") String search,
                                           Pageable pageable);

    // ── Phase 5: dashboard / analytics aggregates — SQL-side grouping, never loaded row-by-row ──

    @Query("SELECT c.status, COUNT(c) FROM CorrectionRequest c GROUP BY c.status")
    List<Object[]> countByStatus();

    @Query("SELECT c.correctionType, COUNT(c) FROM CorrectionRequest c GROUP BY c.correctionType")
    List<Object[]> countByCorrectionType();

    @Query("SELECT COUNT(c) FROM CorrectionRequest c WHERE c.requestedAt >= :since")
    long countRequestedSince(@Param("since") LocalDateTime since);

    @Query("SELECT c.requestedBy, COUNT(c) FROM CorrectionRequest c WHERE c.requestedBy IS NOT NULL "
            + "GROUP BY c.requestedBy ORDER BY COUNT(c) DESC")
    Page<Object[]> topRequesters(Pageable pageable);

    @Query("SELECT c.branchId, COUNT(c) FROM CorrectionRequest c WHERE c.branchId IS NOT NULL "
            + "GROUP BY c.branchId ORDER BY COUNT(c) DESC")
    Page<Object[]> topBranches(Pageable pageable);

    @Query("SELECT c.businessDate, COUNT(c) FROM CorrectionRequest c WHERE c.businessDate IS NOT NULL "
            + "GROUP BY c.businessDate ORDER BY c.businessDate DESC")
    Page<Object[]> countByBusinessDate(Pageable pageable);

    /** requestedAt/approvedAt pairs for terminal-or-later requests — used to compute average
     *  approval turnaround time in Java (row count here is bounded to this governance module's
     *  own correction volume, not a system-wide table, so in-memory averaging is proportionate). */
    @Query("SELECT c.requestedAt, c.approvedAt FROM CorrectionRequest c WHERE c.approvedAt IS NOT NULL")
    List<Object[]> findApprovalDurations();

    @Query("SELECT c.approvedAt, c.executedAt FROM CorrectionRequest c WHERE c.executedAt IS NOT NULL AND c.approvedAt IS NOT NULL")
    List<Object[]> findExecutionDurations();

    List<CorrectionRequest> findByTargetTypeAndTargetIdOrderByRequestedAtDesc(CorrectionTargetType targetType, Long targetId);
}
