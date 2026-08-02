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
     *  (null = don't filter on it), mirroring PosCashMovementRepository#search.
     *
     *  Native query so every optional param can be CAST at every occurrence — an untyped null
     *  bind in PostgreSQL resolves to an undeterminable/bytea parameter type and breaks
     *  execution, and JPQL's CAST(... AS string) only shields the occurrence it wraps, leaving
     *  any bare "IS NULL" check on the same named parameter unresolved (see
     *  PosLayawayRepository#search / PosDayCloseRepository#search for the same pattern). Status/
     *  targetType/correctionType are passed as their enum {@code name()} strings so they can be
     *  CAST like any other varchar filter. */
    @Query(value = "SELECT * FROM pos_correction_requests cr WHERE "
            + "(CAST(:branchId AS bigint) IS NULL OR cr.branch_id = CAST(:branchId AS bigint)) AND "
            + "(CAST(:status AS varchar) IS NULL OR cr.status = CAST(:status AS varchar)) AND "
            + "(CAST(:targetType AS varchar) IS NULL OR cr.target_type = CAST(:targetType AS varchar)) AND "
            + "(CAST(:correctionType AS varchar) IS NULL OR cr.correction_type = CAST(:correctionType AS varchar)) "
            + "ORDER BY cr.requested_at DESC",
            countQuery = "SELECT count(*) FROM pos_correction_requests cr WHERE "
            + "(CAST(:branchId AS bigint) IS NULL OR cr.branch_id = CAST(:branchId AS bigint)) AND "
            + "(CAST(:status AS varchar) IS NULL OR cr.status = CAST(:status AS varchar)) AND "
            + "(CAST(:targetType AS varchar) IS NULL OR cr.target_type = CAST(:targetType AS varchar)) AND "
            + "(CAST(:correctionType AS varchar) IS NULL OR cr.correction_type = CAST(:correctionType AS varchar))",
            nativeQuery = true)
    Page<CorrectionRequest> search(@Param("branchId") Long branchId,
                                    @Param("status") String status,
                                    @Param("targetType") String targetType,
                                    @Param("correctionType") String correctionType,
                                    Pageable pageable);

    // ── Phase 5: unified History search (reporting only — read-only, no new workflow) ──────

    /** Every filter optional. {@code search} matches requestNumber or reason (case-insensitive
     *  substring) — the "correction number / reason / reference" search the History tab needs,
     *  since requestNumber is this system's reference/correction-number. Native query, CAST at
     *  every occurrence — see {@link #search} for why. */
    @Query(value = "SELECT * FROM pos_correction_requests cr WHERE "
            + "(CAST(:branchId AS bigint) IS NULL OR cr.branch_id = CAST(:branchId AS bigint)) AND "
            + "(CAST(:status AS varchar) IS NULL OR cr.status = CAST(:status AS varchar)) AND "
            + "(CAST(:targetType AS varchar) IS NULL OR cr.target_type = CAST(:targetType AS varchar)) AND "
            + "(CAST(:correctionType AS varchar) IS NULL OR cr.correction_type = CAST(:correctionType AS varchar)) AND "
            + "(CAST(:targetId AS bigint) IS NULL OR cr.target_id = CAST(:targetId AS bigint)) AND "
            + "(CAST(:requestedBy AS varchar) IS NULL OR LOWER(cr.requested_by) = LOWER(CAST(:requestedBy AS varchar))) AND "
            + "(CAST(:approvedBy AS varchar) IS NULL OR LOWER(cr.approved_by) = LOWER(CAST(:approvedBy AS varchar))) AND "
            + "(CAST(:fromDate AS timestamp) IS NULL OR cr.requested_at >= CAST(:fromDate AS timestamp)) AND "
            + "(CAST(:toDate AS timestamp) IS NULL OR cr.requested_at <= CAST(:toDate AS timestamp)) AND "
            + "(CAST(:search AS varchar) IS NULL OR LOWER(cr.request_number) LIKE CONCAT('%', LOWER(CAST(:search AS varchar)), '%') "
            + "     OR LOWER(cr.reason) LIKE CONCAT('%', LOWER(CAST(:search AS varchar)), '%')) "
            + "ORDER BY cr.requested_at DESC",
            countQuery = "SELECT count(*) FROM pos_correction_requests cr WHERE "
            + "(CAST(:branchId AS bigint) IS NULL OR cr.branch_id = CAST(:branchId AS bigint)) AND "
            + "(CAST(:status AS varchar) IS NULL OR cr.status = CAST(:status AS varchar)) AND "
            + "(CAST(:targetType AS varchar) IS NULL OR cr.target_type = CAST(:targetType AS varchar)) AND "
            + "(CAST(:correctionType AS varchar) IS NULL OR cr.correction_type = CAST(:correctionType AS varchar)) AND "
            + "(CAST(:targetId AS bigint) IS NULL OR cr.target_id = CAST(:targetId AS bigint)) AND "
            + "(CAST(:requestedBy AS varchar) IS NULL OR LOWER(cr.requested_by) = LOWER(CAST(:requestedBy AS varchar))) AND "
            + "(CAST(:approvedBy AS varchar) IS NULL OR LOWER(cr.approved_by) = LOWER(CAST(:approvedBy AS varchar))) AND "
            + "(CAST(:fromDate AS timestamp) IS NULL OR cr.requested_at >= CAST(:fromDate AS timestamp)) AND "
            + "(CAST(:toDate AS timestamp) IS NULL OR cr.requested_at <= CAST(:toDate AS timestamp)) AND "
            + "(CAST(:search AS varchar) IS NULL OR LOWER(cr.request_number) LIKE CONCAT('%', LOWER(CAST(:search AS varchar)), '%') "
            + "     OR LOWER(cr.reason) LIKE CONCAT('%', LOWER(CAST(:search AS varchar)), '%'))",
            nativeQuery = true)
    Page<CorrectionRequest> searchHistory(@Param("branchId") Long branchId,
                                           @Param("status") String status,
                                           @Param("targetType") String targetType,
                                           @Param("correctionType") String correctionType,
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
