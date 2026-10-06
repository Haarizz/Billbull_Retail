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
     * The most recent LPOs raised on one vendor, newest first, backing the global search
     * details panel.
     *
     * <p>Filtered and ordered in SQL and bounded by the caller's {@link Pageable} — the
     * paged list query above searches by vendor name/code as free text, which is not the
     * same thing as "this vendor's LPOs", and nothing here loads the full list to filter
     * it in memory. Ties on {@code lpoDate} are broken by id so the order is stable.
     *
     * <p>Branch-scoped on the same contract as {@link #searchPage}: an LPO is a
     * branch-attributed document, so a caller who cannot reach a branch must not read its
     * purchase orders through the details panel either. {@code allBranches = true} applies
     * no predicate; otherwise rows must be in {@code branchIds} or carry no branch
     * (legacy rows stay visible, as elsewhere).
     */
    @Query("SELECT l FROM Lpo l WHERE l.vendorId = :vendorId "
            + "AND (:allBranches = true OR l.branchId IS NULL OR l.branchId IN :branchIds) "
            + "ORDER BY l.lpoDate DESC, l.id DESC")
    List<Lpo> findRecentByVendorId(@Param("vendorId") Long vendorId,
            @Param("allBranches") boolean allBranches,
            @Param("branchIds") java.util.Collection<Long> branchIds,
            Pageable pageable);

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

    /**
     * Vendor ids, most ordered-from first — the ranking behind the global search modal's
     * empty-query preview.
     *
     * <p>Counts LPOs inside the activity window and breaks ties on the most recent of
     * them. Returns ids only; the caller re-reads the vendors through its own
     * branch-scoped query, so this decides order and nothing about visibility.
     */
    @Query("SELECT l.vendorId FROM Lpo l "
            + "WHERE l.vendorId IS NOT NULL AND l.createdAt >= :since "
            + "GROUP BY l.vendorId "
            + "ORDER BY COUNT(l.id) DESC, MAX(l.createdAt) DESC")
    List<Long> findMostActiveVendorIds(@org.springframework.data.repository.query.Param("since") java.time.LocalDateTime since,
            Pageable pageable);

}
