package com.billbull.backend.purchase.lpo;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LpoRepository extends JpaRepository<Lpo, Long> {

    Optional<Lpo> findByLpoNumber(String lpoNumber);

    boolean existsByLpoNumber(String lpoNumber);

    @Query("SELECT l.lpoNumber FROM Lpo l WHERE l.lpoNumber LIKE CONCAT(:prefix, '%')")
    List<String> findLpoNumbersByPrefix(@Param("prefix") String prefix);

    List<Lpo> findByStatus(LpoStatus status);

    long countByStatus(LpoStatus status);

    boolean existsByIdAndStockPostedTrue(Long id);

    boolean existsByVendorCode(String vendorCode);

    /**
     * Branch-scoped, filtered, sorted page of LPOs — all pushed into SQL so only
     * one page of rows is materialised. See {@code BranchAccessService.ListScope}
     * for the {@code allBranches}/{@code branchIds} contract. {@code search} must
     * be lower-cased by the caller; pass {@code ""} for no search.
     */
    @Query("SELECT l FROM Lpo l WHERE "
            + "(:allBranches = true OR l.branchId IS NULL OR l.branchId IN :branchIds) "
            + "AND (:status IS NULL OR l.status = :status) "
            + "AND (:search = '' OR LOWER(l.lpoNumber) LIKE CONCAT('%', :search, '%') "
            + "OR LOWER(l.vendorName) LIKE CONCAT('%', :search, '%')) "
            + "AND (CAST(:dateFrom AS date) IS NULL OR l.lpoDate >= :dateFrom) "
            + "AND (CAST(:dateTo AS date) IS NULL OR l.lpoDate <= :dateTo) "
            + "AND (:vendor = '' OR l.vendorName = :vendor OR l.vendorCode = :vendor) "
            + "ORDER BY l.id DESC")
    Page<Lpo> searchPage(@Param("allBranches") boolean allBranches,
            @Param("branchIds") Collection<Long> branchIds,
            @Param("status") LpoStatus status,
            @Param("search") String search,
            @Param("dateFrom") java.time.LocalDate dateFrom,
            @Param("dateTo") java.time.LocalDate dateTo,
            @Param("vendor") String vendor,
            Pageable pageable);

    @Query("SELECT l.status, COUNT(l) FROM Lpo l WHERE "
            + "(:allBranches = true OR l.branchId IS NULL OR l.branchId IN :branchIds) "
            + "GROUP BY l.status")
    List<Object[]> countByStatusScoped(@Param("allBranches") boolean allBranches,
            @Param("branchIds") Collection<Long> branchIds);

    /**
     * Dashboard "Open LPOs": every LPO still in the purchase pipeline — anything not
     * yet COMPLETED or CANCELLED, DRAFT included, so a freshly created order shows up
     * immediately. Branch-scoped like the other dashboard aggregates ({@code branchId}
     * null = all branches); LPOs with no branch are always included.
     */
    @Query("SELECT COUNT(l) FROM Lpo l WHERE l.status NOT IN :closedStatuses "
            + "AND (:branchId IS NULL OR l.branchId IS NULL OR l.branchId = :branchId)")
    long countOpen(@Param("closedStatuses") Collection<LpoStatus> closedStatuses,
            @Param("branchId") Long branchId);

    /**
     * Committed value of open LPOs in the period — the ordered-but-not-yet-received
     * side of purchase value. Receipts are counted separately from GRNs, so statuses
     * that already have goods against them (PARTIALLY_RECEIVED/COMPLETED) are excluded
     * by the caller to avoid double counting.
     */
    @Query("SELECT COALESCE(SUM(l.grandTotal), 0) FROM Lpo l WHERE l.status IN :statuses "
            + "AND l.lpoDate BETWEEN :from AND :to "
            + "AND (:branchId IS NULL OR l.branchId IS NULL OR l.branchId = :branchId)")
    java.math.BigDecimal sumGrandTotalByStatusBetween(@Param("statuses") Collection<LpoStatus> statuses,
            @Param("from") java.time.LocalDate from,
            @Param("to") java.time.LocalDate to,
            @Param("branchId") Long branchId);

    @Query("SELECT DISTINCT l FROM Lpo l LEFT JOIN FETCH l.items WHERE l.lpoDate >= :dateFrom AND l.lpoDate <= :dateTo ORDER BY l.lpoDate DESC")
    List<Lpo> findForReportsBounded(@Param("dateFrom") java.time.LocalDate dateFrom, @Param("dateTo") java.time.LocalDate dateTo);

    @Query("SELECT DISTINCT l FROM Lpo l LEFT JOIN FETCH l.items WHERE l.lpoDate >= :dateFrom ORDER BY l.lpoDate DESC")
    List<Lpo> findForReportsFromDate(@Param("dateFrom") java.time.LocalDate dateFrom);

    @Query("SELECT DISTINCT l FROM Lpo l LEFT JOIN FETCH l.items WHERE l.lpoDate <= :dateTo ORDER BY l.lpoDate DESC")
    List<Lpo> findForReportsToDate(@Param("dateTo") java.time.LocalDate dateTo);

    @Query("SELECT DISTINCT l FROM Lpo l LEFT JOIN FETCH l.items ORDER BY l.lpoDate DESC")
    List<Lpo> findForReportsAll();

    default List<Lpo> findForReports(java.time.LocalDate dateFrom, java.time.LocalDate dateTo) {
        if (dateFrom != null && dateTo != null) return findForReportsBounded(dateFrom, dateTo);
        if (dateFrom != null) return findForReportsFromDate(dateFrom);
        if (dateTo != null) return findForReportsToDate(dateTo);
        return findForReportsAll();
    }
}
