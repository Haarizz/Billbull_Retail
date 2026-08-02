package com.billbull.backend.pos.reports;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface PosXReportSnapshotRepository extends JpaRepository<PosXReportSnapshot, Long> {

    Optional<PosXReportSnapshot> findBySessionId(Long sessionId);

    boolean existsBySessionId(Long sessionId);

    /**
     * Back-office POS Reports browser — every filter optional (null = don't filter on it).
     *
     * Native query so each optional param can be CAST at every occurrence — an untyped
     * null bind in PostgreSQL resolves to bytea and breaks LOWER()/LIKE, and JPQL's CAST(...
     * AS string) only shields the occurrence it wraps, leaving the plain "IS NULL" check on
     * the same named parameter unresolved (see PosLayawayRepository.search for the same
     * native-query pattern).
     */
    @Query(value = "SELECT * FROM pos_x_report_snapshots pxs "
            + "WHERE (CAST(:branchId AS bigint) IS NULL OR pxs.branch_id = CAST(:branchId AS bigint)) "
            + "AND (CAST(:dateFrom AS date) IS NULL OR pxs.business_date >= CAST(:dateFrom AS date)) "
            + "AND (CAST(:dateTo AS date) IS NULL OR pxs.business_date <= CAST(:dateTo AS date)) "
            + "AND (CAST(:reportNumber AS varchar) IS NULL OR LOWER(pxs.report_number) LIKE CONCAT('%', LOWER(CAST(:reportNumber AS varchar)), '%')) "
            + "AND (CAST(:generatedBy AS varchar) IS NULL OR LOWER(pxs.generated_by) LIKE CONCAT('%', LOWER(CAST(:generatedBy AS varchar)), '%')) "
            + "AND (CAST(:terminalId AS varchar) IS NULL OR pxs.terminal_id = CAST(:terminalId AS varchar)) "
            + "AND (CAST(:counterId AS bigint) IS NULL OR pxs.counter_id = CAST(:counterId AS bigint)) "
            + "AND (CAST(:cashier AS varchar) IS NULL OR LOWER(pxs.cashier_name) LIKE CONCAT('%', LOWER(CAST(:cashier AS varchar)), '%')) "
            + "AND (CAST(:sessionId AS bigint) IS NULL OR pxs.session_id = CAST(:sessionId AS bigint)) "
            + "ORDER BY pxs.generated_at DESC",
            countQuery = "SELECT count(*) FROM pos_x_report_snapshots pxs "
            + "WHERE (CAST(:branchId AS bigint) IS NULL OR pxs.branch_id = CAST(:branchId AS bigint)) "
            + "AND (CAST(:dateFrom AS date) IS NULL OR pxs.business_date >= CAST(:dateFrom AS date)) "
            + "AND (CAST(:dateTo AS date) IS NULL OR pxs.business_date <= CAST(:dateTo AS date)) "
            + "AND (CAST(:reportNumber AS varchar) IS NULL OR LOWER(pxs.report_number) LIKE CONCAT('%', LOWER(CAST(:reportNumber AS varchar)), '%')) "
            + "AND (CAST(:generatedBy AS varchar) IS NULL OR LOWER(pxs.generated_by) LIKE CONCAT('%', LOWER(CAST(:generatedBy AS varchar)), '%')) "
            + "AND (CAST(:terminalId AS varchar) IS NULL OR pxs.terminal_id = CAST(:terminalId AS varchar)) "
            + "AND (CAST(:counterId AS bigint) IS NULL OR pxs.counter_id = CAST(:counterId AS bigint)) "
            + "AND (CAST(:cashier AS varchar) IS NULL OR LOWER(pxs.cashier_name) LIKE CONCAT('%', LOWER(CAST(:cashier AS varchar)), '%')) "
            + "AND (CAST(:sessionId AS bigint) IS NULL OR pxs.session_id = CAST(:sessionId AS bigint))",
            nativeQuery = true)
    Page<PosXReportSnapshot> search(@Param("branchId") Long branchId,
                                     @Param("dateFrom") LocalDate dateFrom,
                                     @Param("dateTo") LocalDate dateTo,
                                     @Param("reportNumber") String reportNumber,
                                     @Param("generatedBy") String generatedBy,
                                     @Param("terminalId") String terminalId,
                                     @Param("counterId") Long counterId,
                                     @Param("cashier") String cashier,
                                     @Param("sessionId") Long sessionId,
                                     Pageable pageable);
}
