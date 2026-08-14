package com.billbull.backend.sales.returns;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface SalesReturnRepository extends JpaRepository<SalesReturn, Long> {

    Optional<SalesReturn> findByReturnNumber(String returnNumber);

    @Query("SELECT DISTINCT r FROM SalesReturn r LEFT JOIN FETCH r.items WHERE r.linkedInvoice = :invoiceNumber")
    List<SalesReturn> findByLinkedInvoiceWithItems(@Param("invoiceNumber") String invoiceNumber);

    Optional<SalesReturn> findTopByOrderByReturnNumberDesc();

    List<SalesReturn> findByReturnDateBetween(LocalDate from, LocalDate to);

    /** Z-Report Returns/Refund Summary: a single business day's returns for a branch,
     *  with line items fetched so quantities can be summed without N+1 lazy loads. */
    @Query("SELECT DISTINCT r FROM SalesReturn r LEFT JOIN FETCH r.items " +
           "WHERE r.returnDate = :date AND (:branchId IS NULL OR r.branch.id = :branchId)")
    List<SalesReturn> findByReturnDateAndBranchWithItems(@Param("date") LocalDate date,
                                                          @Param("branchId") Long branchId);

    // ARCHFIX §1.6: items is now LAZY — these JOIN FETCH it for the read paths that serialize the
    // full return (list + by-id). The nested SalesReturnItem.batches load via @BatchSize. DISTINCT
    // collapses the row duplication from the one-to-many join.
    @Query("SELECT DISTINCT r FROM SalesReturn r LEFT JOIN FETCH r.items")
    List<SalesReturn> findAllWithItems();

    @Query("SELECT r FROM SalesReturn r LEFT JOIN FETCH r.items WHERE r.id = :id")
    Optional<SalesReturn> findByIdWithItems(@Param("id") Long id);

    /**
     * Pessimistic-write lock on a single return row, taken at the start of the approval
     * transaction.
     *
     * <p>This is what makes confirmation idempotent under concurrency. Without it, a
     * double-clicked or retried confirmation could have two transactions both read status
     * DRAFT, both pass the "already approved" guard, and both post stock movements, GL
     * journals and — worst of all — two drawer cash payouts for one refund. Whichever
     * transaction takes the lock second sees APPROVED and is rejected.
     *
     * <p>Items are deliberately not JOIN FETCHed: some databases refuse {@code FOR UPDATE}
     * alongside an outer join. The caller re-reads the full graph through
     * {@code findByIdWithItems} inside the same transaction, which returns the same locked,
     * managed instance from the persistence context.
     */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM SalesReturn r WHERE r.id = :id")
    Optional<SalesReturn> findByIdForUpdate(@Param("id") Long id);

    boolean existsByReturnNumber(String returnNumber);

    @Query("SELECT r.returnNumber FROM SalesReturn r WHERE r.returnNumber LIKE CONCAT(:prefix, '%')")
    List<String> findReturnNumbersByPrefix(@Param("prefix") String prefix);

    @Query("SELECT CAST(SUM(r.totalAmount) AS double) FROM SalesReturn r WHERE r.returnDate = :date")
    Double getTotalReturnsForDate(@Param("date") LocalDate date);

    @Query("SELECT CAST(SUM(r.totalAmount) AS double) FROM SalesReturn r " +
           "WHERE r.returnDate BETWEEN :startDate AND :endDate " +
           "AND (:branchId IS NULL OR r.branch.id = :branchId)")
    Double getTotalReturnsBetweenDates(@Param("startDate") LocalDate startDate,
                                       @Param("endDate") LocalDate endDate,
                                       @Param("branchId") Long branchId);

    default Double getTotalReturnsBetweenDates(LocalDate startDate, LocalDate endDate) {
        return getTotalReturnsBetweenDates(startDate, endDate, null);
    }

    @Query("SELECT r.returnDate, COALESCE(SUM(r.totalAmount), 0) FROM SalesReturn r " +
           "WHERE r.returnDate BETWEEN :from AND :to " +
           "AND (:branchId IS NULL OR r.branch.id = :branchId) " +
           "GROUP BY r.returnDate ORDER BY r.returnDate")
    List<Object[]> findDailyReturnsTrend(@Param("from") LocalDate from,
                                         @Param("to") LocalDate to,
                                         @Param("branchId") Long branchId);

    default List<Object[]> findDailyReturnsTrend(LocalDate from, LocalDate to) {
        return findDailyReturnsTrend(from, to, null);
    }

    @Query("SELECT CAST(SUM(r.totalAmount) AS double) FROM SalesReturn r WHERE r.status = 'APPROVED'")
    Double getTotalApprovedReturns();

    /** Sales-report loader: date-bounded returns with line items fetched in one query. */
    @Query("SELECT DISTINCT r FROM SalesReturn r LEFT JOIN FETCH r.items WHERE r.returnDate >= :dateFrom AND r.returnDate <= :dateTo")
    List<SalesReturn> findForReportsBounded(@Param("dateFrom") LocalDate dateFrom, @Param("dateTo") LocalDate dateTo);

    @Query("SELECT DISTINCT r FROM SalesReturn r LEFT JOIN FETCH r.items WHERE r.returnDate >= :dateFrom")
    List<SalesReturn> findForReportsFromDate(@Param("dateFrom") LocalDate dateFrom);

    @Query("SELECT DISTINCT r FROM SalesReturn r LEFT JOIN FETCH r.items WHERE r.returnDate <= :dateTo")
    List<SalesReturn> findForReportsToDate(@Param("dateTo") LocalDate dateTo);

    @Query("SELECT DISTINCT r FROM SalesReturn r LEFT JOIN FETCH r.items")
    List<SalesReturn> findForReportsAll();

    default List<SalesReturn> findForReports(LocalDate dateFrom, LocalDate dateTo) {
        if (dateFrom != null && dateTo != null) return findForReportsBounded(dateFrom, dateTo);
        if (dateFrom != null) return findForReportsFromDate(dateFrom);
        if (dateTo != null) return findForReportsToDate(dateTo);
        return findForReportsAll();
    }
}
