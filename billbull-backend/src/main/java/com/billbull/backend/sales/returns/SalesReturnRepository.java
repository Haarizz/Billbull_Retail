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

    /**
     * Returns booked on a single business day, cancelled ones excluded — one row of
     * {returnCount, refundedTotal}. Drives the POS card's "Returns" badge.
     *
     * <p>Matches on {@code tradingDate} when the return came from a POS session (it can differ
     * from {@code returnDate} at a day boundary) and falls back to {@code returnDate} otherwise.
     *
     * <p>APPROVED only. This used to exclude just CANCELLED, so a DRAFT return — nothing
     * restocked, nothing posted, nothing settled — was badged on the POS card as a return the
     * day had taken, and the badge disagreed with every other report of the same day.
     */
    @Query("SELECT COUNT(r), CAST(COALESCE(SUM(r.totalAmount), 0) AS double) FROM SalesReturn r " +
           "WHERE COALESCE(r.tradingDate, r.returnDate) = :date " +
           "AND r.status = com.billbull.backend.sales.returns.SalesReturnStatus.APPROVED " +
           "AND (:branchId IS NULL OR r.branch.id = :branchId)")
    List<Object[]> findDayReturnSnapshot(@Param("date") LocalDate date, @Param("branchId") Long branchId);

    /**
     * Returns value for a date range — APPROVED only.
     *
     * <p>Had no status predicate at all, so the Dashboard and Sales Analytics counted DRAFT and
     * CANCELLED returns as value returned while every report of the same period counted only
     * approved ones. A cancelled return permanently inflated the dashboard's Returns KPI.
     */
    @Query("SELECT CAST(SUM(r.totalAmount) AS double) FROM SalesReturn r " +
           "WHERE r.returnDate BETWEEN :startDate AND :endDate " +
           "AND r.status = com.billbull.backend.sales.returns.SalesReturnStatus.APPROVED " +
           "AND (:branchId IS NULL OR r.branch.id = :branchId)")
    Double getTotalReturnsBetweenDates(@Param("startDate") LocalDate startDate,
                                       @Param("endDate") LocalDate endDate,
                                       @Param("branchId") Long branchId);

    /** Count of APPROVED returns in a date range, branch-scoped — the companion to the value above. */
    @Query("SELECT COUNT(r) FROM SalesReturn r " +
           "WHERE r.returnDate BETWEEN :startDate AND :endDate " +
           "AND r.status = com.billbull.backend.sales.returns.SalesReturnStatus.APPROVED " +
           "AND (:branchId IS NULL OR r.branch.id = :branchId)")
    long countApprovedBetweenDates(@Param("startDate") LocalDate startDate,
                                   @Param("endDate") LocalDate endDate,
                                   @Param("branchId") Long branchId);

    /** Daily returns trend — APPROVED only, for the same reason as the range total above. */
    @Query("SELECT r.returnDate, COALESCE(SUM(r.totalAmount), 0) FROM SalesReturn r " +
           "WHERE r.returnDate BETWEEN :from AND :to " +
           "AND r.status = com.billbull.backend.sales.returns.SalesReturnStatus.APPROVED " +
           "AND (:branchId IS NULL OR r.branch.id = :branchId) " +
           "GROUP BY r.returnDate ORDER BY r.returnDate")
    List<Object[]> findDailyReturnsTrend(@Param("from") LocalDate from,
                                         @Param("to") LocalDate to,
                                         @Param("branchId") Long branchId);

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

    // ── Customer AR sub-ledger ────────────────────────────────────────────────
    // An approved return always posts Cr Accounts Receivable, so it belongs on the customer's
    // Statement of Account exactly like an invoice or a receipt does. These three queries are
    // what the SoA and the Customer List read; items are deliberately NOT fetched, because the
    // ledger only needs the header amounts.

    /** Approved returns for one customer inside the statement period. */
    @Query("SELECT r FROM SalesReturn r WHERE r.customerCode = :customerCode "
            + "AND r.status = com.billbull.backend.sales.returns.SalesReturnStatus.APPROVED "
            + "AND r.returnDate >= :startDate AND r.returnDate <= :endDate "
            + "ORDER BY r.returnDate, r.returnNumber")
    List<SalesReturn> findApprovedForStatement(@Param("customerCode") String customerCode,
                                               @Param("startDate") LocalDate startDate,
                                               @Param("endDate") LocalDate endDate);

    // The three sumLedgerCredit* queries that used to live here are gone (Phase 2 §17).
    //
    // They derived a customer's return credit by classifying sales_returns rows — refund_method
    // = CUSTOMER_CREDIT, with a returnAction LIKE '%CREDIT%' fallback for legacy rows — and
    // subtracting the full total_amount of each match from the customer's outstanding. That was
    // a second, independent definition of effective outstanding: only the Customer List, the
    // customer summary card and the statement opening balance applied it, so the credit-limit
    // check, AR aging, the AR reports and SubLedgerReconciliationService.reconcileAR all
    // disagreed with those three by every ledger-credit return ever booked.
    //
    // A return's unpaid portion is now an immutable row in sales_return_credit_applications,
    // folded into sales_invoices.balance by InvoiceBalanceService.recomputeInvoiceBalance. Every
    // AR surface reads that balance, so all of them became correct at once and four of the eight
    // needed no code change at all. The statement's brought-forward term reads the allocation
    // ledger directly (SalesReturnCreditApplicationRepository.sumAppliedBeforeDate).
    //
    // Do not reintroduce a derivation over refund_method. It cannot say which invoice a credit
    // reduced, which is the fact every AR surface actually needs.

    default List<SalesReturn> findForReports(LocalDate dateFrom, LocalDate dateTo) {
        if (dateFrom != null && dateTo != null) return findForReportsBounded(dateFrom, dateTo);
        if (dateFrom != null) return findForReportsFromDate(dateFrom);
        if (dateTo != null) return findForReportsToDate(dateTo);
        return findForReportsAll();
    }
}
