package com.billbull.backend.pos.reports;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface PosReportSequenceRepository extends JpaRepository<PosReportSequence, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM PosReportSequence s WHERE s.reportType = :reportType "
            + "AND s.branchId = :branchId AND s.businessDate = :businessDate")
    Optional<PosReportSequence> findForUpdate(@Param("reportType") String reportType,
                                               @Param("branchId") Long branchId,
                                               @Param("businessDate") LocalDate businessDate);
}
