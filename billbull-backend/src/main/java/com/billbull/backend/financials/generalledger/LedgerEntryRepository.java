package com.billbull.backend.financials.generalledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.math.BigDecimal;
import java.util.List;

@Repository
public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, String> {

    // Returns transactions sorted by newest first for the history table
    List<LedgerEntry> findAllByOrderByTransactionDateDesc();

    List<LedgerEntry> findByAccountCodeOrderByTransactionDateAsc(String accountCode);

    /**
     * Newest-first page of one account's entries, backing
     * {@code GET /api/ledger/accounts/{code}/transactions}.
     *
     * <p>Deliberately separate from {@link #findAllByOrderByTransactionDateDesc()}, which the
     * GL transactions screen uses and which loads the whole ledger. The {@code Pageable} caps
     * the row count in SQL, and the (account_code, transaction_date) index the entity already
     * declares (idx_ledger_acct_date, also in V3__missing_indexes.sql) serves both the filter
     * and the sort.
     *
     * <p>{@code id} is the tie-breaker so entries sharing a date come back in a stable order —
     * without it the page contents are non-deterministic for same-day postings.
     *
     * <p>Branch-scoped, for the same reason {@code getTransactionHistory} is: a voucher line is
     * branch-attributed transactional data, so a user who cannot reach a branch must not read
     * its postings here either. Entries with no branch stay visible, as everywhere else.
     */
    @org.springframework.data.jpa.repository.Query("""
            SELECT le FROM LedgerEntry le
            WHERE le.accountCode = :accountCode
              AND (:allBranches = true OR le.branch IS NULL OR le.branch.id IN :branchIds)
            ORDER BY le.transactionDate DESC, le.id DESC
            """)
    List<LedgerEntry> findRecentByAccountCodeScoped(
            @org.springframework.data.repository.query.Param("accountCode") String accountCode,
            @org.springframework.data.repository.query.Param("allBranches") boolean allBranches,
            @org.springframework.data.repository.query.Param("branchIds") java.util.Collection<Long> branchIds,
            org.springframework.data.domain.Pageable pageable);

    List<LedgerEntry> findByTransactionDateBetweenOrderByTransactionDateAsc(java.time.LocalDate start,
            java.time.LocalDate end);

    List<LedgerEntry> findByBranchIdAndTransactionDateBetweenOrderByTransactionDateAsc(Long branchId,
            java.time.LocalDate start, java.time.LocalDate end);

    List<LedgerEntry> findByTransactionDateBefore(java.time.LocalDate date);

    boolean existsByAccountCode(String accountCode);

    /** Replay lookup for a client-supplied idempotency key — see LedgerEntry.clientRequestId. */
    java.util.Optional<LedgerEntry> findByClientRequestId(String clientRequestId);

    @Query("select distinct le.accountCode from LedgerEntry le where le.accountCode is not null")
    List<String> findDistinctAccountCodes();

    /** Net GL balance for a specific account code: SUM(debit) - SUM(credit). */
    @Query("SELECT COALESCE(SUM(le.debitAmount), 0) - COALESCE(SUM(le.creditAmount), 0) FROM LedgerEntry le WHERE le.accountCode = :accountCode")
    BigDecimal netBalanceByAccountCode(@org.springframework.data.repository.query.Param("accountCode") String accountCode);

    /** Net GL balance for an account code up to (but not including) a given date — used for opening balance derivation. */
    @Query("SELECT COALESCE(SUM(le.debitAmount), 0) - COALESCE(SUM(le.creditAmount), 0) FROM LedgerEntry le WHERE le.accountCode = :accountCode AND le.transactionDate < :beforeDate")
    BigDecimal netBalanceByAccountCodeBefore(
            @org.springframework.data.repository.query.Param("accountCode") String accountCode,
            @org.springframework.data.repository.query.Param("beforeDate") java.time.LocalDate beforeDate);

    // ==================== SQL-side aggregation for reports (ARCHFIX §4.1) ====================
    // The report service used to load every LedgerEntry in a date range and SUM/GROUP BY
    // account_code in Java (memory + time scaling with total ledger volume, not result size).
    // These projections push the GROUP BY into PostgreSQL so the DB returns one row per account.
    // account_name is consistent per account_code in practice, so MAX(accountName) reproduces the
    // previous "first-seen name" exactly while keeping a single grouped row per code.

    /** One row per account: summed debits/credits over [start, end]. Optional branch filter when
     *  {@code branchId} is null (matches the no-branch report path). */
    @Query("""
            SELECT le.accountCode                  AS accountCode,
                   MAX(le.accountName)             AS accountName,
                   COALESCE(SUM(le.debitAmount), 0)  AS sumDebit,
                   COALESCE(SUM(le.creditAmount), 0) AS sumCredit
            FROM LedgerEntry le
            WHERE le.accountCode IS NOT NULL
              AND le.transactionDate BETWEEN :start AND :end
              AND (:branchId IS NULL OR le.branch.id = :branchId)
            GROUP BY le.accountCode
            """)
    List<AccountAggregate> aggregateByAccountCode(
            @org.springframework.data.repository.query.Param("branchId") Long branchId,
            @org.springframework.data.repository.query.Param("start") java.time.LocalDate start,
            @org.springframework.data.repository.query.Param("end") java.time.LocalDate end);

    /**
      * Same as {@link #aggregateByAccountCode} but additionally filtered to a single cost center
      * (used by the P&L cost-center drill-down).
      *
      * <p>Matches the code <em>or</em> the name, case- and whitespace-insensitively: nothing
      * constrains what callers write into {@code LedgerEntry.costCenter}, so postings in the
      * wild carry a mix of "CC-001" and "General / Head Office" for the same cost center. An
      * equality test on the code alone silently returned an empty P&L for the other half.
      */
    @Query("""
            SELECT le.accountCode                  AS accountCode,
                   MAX(le.accountName)             AS accountName,
                   COALESCE(SUM(le.debitAmount), 0)  AS sumDebit,
                   COALESCE(SUM(le.creditAmount), 0) AS sumCredit
            FROM LedgerEntry le
            WHERE le.accountCode IS NOT NULL
              AND le.transactionDate BETWEEN :start AND :end
              AND (:branchId IS NULL OR le.branch.id = :branchId)
              AND (LOWER(TRIM(le.costCenter)) = LOWER(TRIM(:costCenter))
                   OR (:costCenterName IS NOT NULL
                       AND LOWER(TRIM(le.costCenter)) = LOWER(TRIM(:costCenterName))))
            GROUP BY le.accountCode
            """)
    List<AccountAggregate> aggregateByAccountCodeAndCostCenter(
            @org.springframework.data.repository.query.Param("branchId") Long branchId,
            @org.springframework.data.repository.query.Param("start") java.time.LocalDate start,
            @org.springframework.data.repository.query.Param("end") java.time.LocalDate end,
            @org.springframework.data.repository.query.Param("costCenter") String costCenter,
            @org.springframework.data.repository.query.Param("costCenterName") String costCenterName);

    /**
     * The distinct cost-center labels that actually appear on ledger entries in a period.
     *
     * <p>Drives the report filter's "has data" marker: the cost-center master and what the
     * posting engine stamps on a line are not the same list, and offering a cost center that
     * cannot match anything is what makes the filter look broken.
     */
    @Query("""
            SELECT DISTINCT TRIM(le.costCenter)
            FROM LedgerEntry le
            WHERE le.costCenter IS NOT NULL
              AND TRIM(le.costCenter) <> ''
              AND le.transactionDate BETWEEN :start AND :end
              AND (:branchId IS NULL OR le.branch.id = :branchId)
            """)
    List<String> findUsedCostCenters(
            @org.springframework.data.repository.query.Param("branchId") Long branchId,
            @org.springframework.data.repository.query.Param("start") java.time.LocalDate start,
            @org.springframework.data.repository.query.Param("end") java.time.LocalDate end);

    /** One row per account: summed debits/credits for all entries STRICTLY BEFORE {@code before}
     *  (used by the balance sheet as-of-date cumulative balance). Optional branch filter. */
    @Query("""
            SELECT le.accountCode                  AS accountCode,
                   MAX(le.accountName)             AS accountName,
                   COALESCE(SUM(le.debitAmount), 0)  AS sumDebit,
                   COALESCE(SUM(le.creditAmount), 0) AS sumCredit
            FROM LedgerEntry le
            WHERE le.accountCode IS NOT NULL
              AND le.transactionDate < :before
              AND (:branchId IS NULL OR le.branch.id = :branchId)
            GROUP BY le.accountCode
            """)
    List<AccountAggregate> aggregateByAccountCodeBefore(
            @org.springframework.data.repository.query.Param("branchId") Long branchId,
            @org.springframework.data.repository.query.Param("before") java.time.LocalDate before);

    /** Spring Data projection: a per-account debit/credit aggregate row. */
    interface AccountAggregate {
        String getAccountCode();
        String getAccountName();
        BigDecimal getSumDebit();
        BigDecimal getSumCredit();
    }
}
