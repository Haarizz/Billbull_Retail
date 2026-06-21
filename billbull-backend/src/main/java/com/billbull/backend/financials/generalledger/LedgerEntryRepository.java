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

    List<LedgerEntry> findByTransactionDateBetweenOrderByTransactionDateAsc(java.time.LocalDate start,
            java.time.LocalDate end);

    List<LedgerEntry> findByBranchIdAndTransactionDateBetweenOrderByTransactionDateAsc(Long branchId,
            java.time.LocalDate start, java.time.LocalDate end);

    List<LedgerEntry> findByTransactionDateBefore(java.time.LocalDate date);

    boolean existsByAccountCode(String accountCode);

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

    /** Same as {@link #aggregateByAccountCode} but additionally filtered to a single cost center
     *  (used by the P&L cost-center drill-down). */
    @Query("""
            SELECT le.accountCode                  AS accountCode,
                   MAX(le.accountName)             AS accountName,
                   COALESCE(SUM(le.debitAmount), 0)  AS sumDebit,
                   COALESCE(SUM(le.creditAmount), 0) AS sumCredit
            FROM LedgerEntry le
            WHERE le.accountCode IS NOT NULL
              AND le.transactionDate BETWEEN :start AND :end
              AND (:branchId IS NULL OR le.branch.id = :branchId)
              AND le.costCenter = :costCenter
            GROUP BY le.accountCode
            """)
    List<AccountAggregate> aggregateByAccountCodeAndCostCenter(
            @org.springframework.data.repository.query.Param("branchId") Long branchId,
            @org.springframework.data.repository.query.Param("start") java.time.LocalDate start,
            @org.springframework.data.repository.query.Param("end") java.time.LocalDate end,
            @org.springframework.data.repository.query.Param("costCenter") String costCenter);

    /** Spring Data projection: a per-account debit/credit aggregate row. */
    interface AccountAggregate {
        String getAccountCode();
        String getAccountName();
        BigDecimal getSumDebit();
        BigDecimal getSumCredit();
    }
}
