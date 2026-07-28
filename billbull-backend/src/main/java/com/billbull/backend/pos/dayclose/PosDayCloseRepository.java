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

    /** Back-office POS Reports browser (Z-Reports tab) — every filter optional. */
    @Query("SELECT d FROM PosDayClose d WHERE "
            + "(:branchId IS NULL OR d.branchId = :branchId) AND "
            + "(:dateFrom IS NULL OR d.closeDate >= :dateFrom) AND "
            + "(:dateTo IS NULL OR d.closeDate <= :dateTo) AND "
            + "(:reportNumber IS NULL OR LOWER(d.reportNumber) LIKE LOWER(CONCAT('%', :reportNumber, '%'))) AND "
            + "(:generatedBy IS NULL OR LOWER(d.closedBy) LIKE LOWER(CONCAT('%', :generatedBy, '%'))) "
            + "ORDER BY d.closedAt DESC")
    Page<PosDayClose> search(@Param("branchId") Long branchId,
                              @Param("dateFrom") LocalDate dateFrom,
                              @Param("dateTo") LocalDate dateTo,
                              @Param("reportNumber") String reportNumber,
                              @Param("generatedBy") String generatedBy,
                              Pageable pageable);
}
