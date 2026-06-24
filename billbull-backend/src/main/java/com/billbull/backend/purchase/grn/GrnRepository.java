package com.billbull.backend.purchase.grn;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GrnRepository extends JpaRepository<GrnEntity, Long> {

        Optional<GrnEntity> findByGrnNo(String grnNo);

        boolean existsByGrnNo(String grnNo);

        @Query("SELECT g.grnNo FROM GrnEntity g WHERE g.grnNo LIKE CONCAT(:prefix, '%')")
        List<String> findGrnNumbersByPrefix(@Param("prefix") String prefix);

        // 🔢 For generating next number safely
        Optional<GrnEntity> findTopByGrnNoStartingWithOrderByGrnNoDesc(String prefix);

        /*
         * =========================================================
         * 🔒 AUTHORITATIVE GRN EXISTENCE CHECKS
         * =========================================================
         */

        // 🔑 Core check: GRN exists for a reference (LPO / DP)
        boolean existsByReferenceIdAndSourceTypeIn(
                        Long referenceId,
                        List<GrnSourceType> sourceTypes);

        // 🔍 Find GRNs by reference (for partial receiving calculation)
        List<GrnEntity> findByReferenceIdAndSourceTypeIn(
                        Long referenceId,
                        List<GrnSourceType> sourceTypes);

        @Query("SELECT DISTINCT g FROM GrnEntity g LEFT JOIN FETCH g.items WHERE g.grnDate >= :dateFrom AND g.grnDate <= :dateTo ORDER BY g.grnDate DESC")
        List<GrnEntity> findForReportsBounded(@Param("dateFrom") java.time.LocalDate dateFrom, @Param("dateTo") java.time.LocalDate dateTo);

        @Query("SELECT DISTINCT g FROM GrnEntity g LEFT JOIN FETCH g.items WHERE g.grnDate >= :dateFrom ORDER BY g.grnDate DESC")
        List<GrnEntity> findForReportsFromDate(@Param("dateFrom") java.time.LocalDate dateFrom);

        @Query("SELECT DISTINCT g FROM GrnEntity g LEFT JOIN FETCH g.items WHERE g.grnDate <= :dateTo ORDER BY g.grnDate DESC")
        List<GrnEntity> findForReportsToDate(@Param("dateTo") java.time.LocalDate dateTo);

        @Query("SELECT DISTINCT g FROM GrnEntity g LEFT JOIN FETCH g.items ORDER BY g.grnDate DESC")
        List<GrnEntity> findForReportsAll();

        default List<GrnEntity> findForReports(java.time.LocalDate dateFrom, java.time.LocalDate dateTo) {
                if (dateFrom != null && dateTo != null) return findForReportsBounded(dateFrom, dateTo);
                if (dateFrom != null) return findForReportsFromDate(dateFrom);
                if (dateTo != null) return findForReportsToDate(dateTo);
                return findForReportsAll();
        }

        /* ================= CONVENIENCE METHODS ================= */

        // LPO → SYSTEM_AUTO GRN
        default boolean existsForLpo(Long lpoId) {
                return existsByReferenceIdAndSourceTypeIn(
                                lpoId,
                                List.of(GrnSourceType.SYSTEM_AUTO));
        }

        // Direct Purchase → DIRECT_PURCHASE GRN
        default boolean existsForDirectPurchase(Long dpId) {
                return existsByReferenceIdAndSourceTypeIn(
                                dpId,
                                List.of(GrnSourceType.DIRECT_PURCHASE));
        }

        @Query("SELECT COALESCE(SUM(g.grandTotal), 0) FROM GrnEntity g " +
               "WHERE g.grnDate BETWEEN :from AND :to " +
               "AND (:branchId IS NULL OR g.branchId = :branchId)")
        java.math.BigDecimal sumGrandTotalBetween(@Param("from") java.time.LocalDate from,
                                                  @Param("to") java.time.LocalDate to,
                                                  @Param("branchId") Long branchId);

        default java.math.BigDecimal sumGrandTotalBetween(java.time.LocalDate from, java.time.LocalDate to) {
            return sumGrandTotalBetween(from, to, null);
        }

        @Query("SELECT COUNT(g) FROM GrnEntity g " +
               "WHERE g.grnDate BETWEEN :from AND :to " +
               "AND (:branchId IS NULL OR g.branchId = :branchId)")
        long countBetween(@Param("from") java.time.LocalDate from,
                          @Param("to") java.time.LocalDate to,
                          @Param("branchId") Long branchId);

        default long countBetween(java.time.LocalDate from, java.time.LocalDate to) {
            return countBetween(from, to, null);
        }
}
