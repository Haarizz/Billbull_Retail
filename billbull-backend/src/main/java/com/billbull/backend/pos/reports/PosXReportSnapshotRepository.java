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

    /** Back-office POS Reports browser — every filter optional (null = don't filter on it). */
    @Query("SELECT r FROM PosXReportSnapshot r WHERE "
            + "(:branchId IS NULL OR r.branchId = :branchId) AND "
            + "(:dateFrom IS NULL OR r.businessDate >= :dateFrom) AND "
            + "(:dateTo IS NULL OR r.businessDate <= :dateTo) AND "
            + "(:reportNumber IS NULL OR LOWER(r.reportNumber) LIKE LOWER(CONCAT('%', :reportNumber, '%'))) AND "
            + "(:generatedBy IS NULL OR LOWER(r.generatedBy) LIKE LOWER(CONCAT('%', :generatedBy, '%'))) AND "
            + "(:terminalId IS NULL OR r.terminalId = :terminalId) AND "
            + "(:counterId IS NULL OR r.counterId = :counterId) AND "
            + "(:cashier IS NULL OR LOWER(r.cashierName) LIKE LOWER(CONCAT('%', :cashier, '%'))) AND "
            + "(:sessionId IS NULL OR r.sessionId = :sessionId) "
            + "ORDER BY r.generatedAt DESC")
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
