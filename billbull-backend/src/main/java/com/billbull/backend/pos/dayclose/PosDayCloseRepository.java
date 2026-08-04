package com.billbull.backend.pos.dayclose;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface PosDayCloseRepository extends JpaRepository<PosDayClose, Long> {

    Optional<PosDayClose> findByBranchIdAndCloseDate(Long branchId, LocalDate closeDate);

    boolean existsByBranchIdAndCloseDate(Long branchId, LocalDate closeDate);

    /** Latest date this branch has a {@link PosDayClose} row for — real close or a
     *  historical skip marker alike, since both mean "this date has been dealt with"
     *  for the purpose of resolving what's next. Anchor for
     *  {@code PosPendingDayCloseResolver}: the next pending Day Close is the earliest
     *  POS session strictly after this date. */
    @Query("select max(d.closeDate) from PosDayClose d where d.branchId = :branchId")
    Optional<LocalDate> findMaxCloseDateByBranchId(@Param("branchId") Long branchId);

    /**
     * Back-office POS Reports browser (Z-Reports tab) — every filter optional.
     *
     * Native query so each optional param can be CAST at every occurrence — an untyped
     * null bind in PostgreSQL resolves to bytea and breaks LOWER()/LIKE, and JPQL's CAST(...
     * AS string) only shields the occurrence it wraps, leaving the plain "IS NULL" check on
     * the same named parameter unresolved (see PosLayawayRepository.search for the same
     * native-query pattern).
     */
    @Query(value = "SELECT * FROM pos_day_closes d "
            + "WHERE (CAST(:branchId AS bigint) IS NULL OR d.branch_id = CAST(:branchId AS bigint)) "
            + "AND (CAST(:dateFrom AS date) IS NULL OR d.close_date >= CAST(:dateFrom AS date)) "
            + "AND (CAST(:dateTo AS date) IS NULL OR d.close_date <= CAST(:dateTo AS date)) "
            + "AND (CAST(:reportNumber AS varchar) IS NULL OR LOWER(d.report_number) LIKE CONCAT('%', LOWER(CAST(:reportNumber AS varchar)), '%')) "
            + "AND (CAST(:generatedBy AS varchar) IS NULL OR LOWER(d.closed_by) LIKE CONCAT('%', LOWER(CAST(:generatedBy AS varchar)), '%')) "
            + "ORDER BY d.closed_at DESC",
            countQuery = "SELECT count(*) FROM pos_day_closes d "
            + "WHERE (CAST(:branchId AS bigint) IS NULL OR d.branch_id = CAST(:branchId AS bigint)) "
            + "AND (CAST(:dateFrom AS date) IS NULL OR d.close_date >= CAST(:dateFrom AS date)) "
            + "AND (CAST(:dateTo AS date) IS NULL OR d.close_date <= CAST(:dateTo AS date)) "
            + "AND (CAST(:reportNumber AS varchar) IS NULL OR LOWER(d.report_number) LIKE CONCAT('%', LOWER(CAST(:reportNumber AS varchar)), '%')) "
            + "AND (CAST(:generatedBy AS varchar) IS NULL OR LOWER(d.closed_by) LIKE CONCAT('%', LOWER(CAST(:generatedBy AS varchar)), '%'))",
            nativeQuery = true)
    Page<PosDayClose> search(@Param("branchId") Long branchId,
                              @Param("dateFrom") LocalDate dateFrom,
                              @Param("dateTo") LocalDate dateTo,
                              @Param("reportNumber") String reportNumber,
                              @Param("generatedBy") String generatedBy,
                              Pageable pageable);
}
