package com.billbull.backend.financials.generalledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface JournalLineRepository extends JpaRepository<JournalLine, Long> {

    /**
     * Used by bank reconciliation auto-match: find unreconciled bank account lines
     * (account 1010 Bank Main, 1011 Bank Collection) with a matching amount and date within a given range.
     */
    @Query("""
        SELECT jl FROM JournalLine jl
        JOIN jl.journalEntry je
        WHERE (jl.accountCode = '1010' OR jl.accountCode = '1011')
          AND (jl.debit = :amount OR jl.credit = :amount)
          AND je.date BETWEEN :fromDate AND :toDate
          AND (jl.reconciled IS NULL OR jl.reconciled = false)
        ORDER BY je.date ASC
    """)
    List<JournalLine> findUnreconciledBankLines(
            @Param("amount") BigDecimal amount,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);

    /**
     * Posted debit and credit totals grouped exactly the way {@code gl_account_balances} is keyed:
     * account code, the fiscal period covering the ENTRY's date, and the ENTRY's branch. Used by
     * {@code GlAccountBalanceService.rebuild} to recompute the pre-aggregated table from the
     * lines, which are the source of truth.
     *
     * <p>The period subquery mirrors {@code AccountingPeriodService.findCoveringPeriod} — newest
     * start date first — so a rebuild lands rows in the same buckets the incremental upsert does.
     * Were it to disagree, a rebuild would "fix" drift by inventing a different one.
     *
     * <p>Returns {@code [account_code, fiscal_period_id, branch_id, sum_debit, sum_credit]}.
     */
    @Query(value = """
        SELECT account_code, fiscal_period_id, branch_id,
               COALESCE(SUM(debit), 0)  AS sum_dr,
               COALESCE(SUM(credit), 0) AS sum_cr
        FROM (
            SELECT jl.account_code, je.branch_id, jl.debit, jl.credit,
                   (SELECT ap.id FROM accounting_periods ap
                     WHERE je.date BETWEEN ap.start_date AND ap.end_date
                     ORDER BY ap.start_date DESC LIMIT 1) AS fiscal_period_id
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE je.status = 'Posted'
              AND jl.account_code IS NOT NULL
              AND jl.account_code <> ''
        ) posted
        GROUP BY account_code, fiscal_period_id, branch_id
        """, nativeQuery = true)
    List<Object[]> sumPostedByAccountPeriodBranch();

    /** {@link #sumPostedByAccountPeriodBranch} narrowed to one account, for a targeted repair. */
    @Query(value = """
        SELECT account_code, fiscal_period_id, branch_id,
               COALESCE(SUM(debit), 0)  AS sum_dr,
               COALESCE(SUM(credit), 0) AS sum_cr
        FROM (
            SELECT jl.account_code, je.branch_id, jl.debit, jl.credit,
                   (SELECT ap.id FROM accounting_periods ap
                     WHERE je.date BETWEEN ap.start_date AND ap.end_date
                     ORDER BY ap.start_date DESC LIMIT 1) AS fiscal_period_id
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE je.status = 'Posted'
              AND jl.account_code = :accountCode
        ) posted
        GROUP BY account_code, fiscal_period_id, branch_id
        """, nativeQuery = true)
    List<Object[]> sumPostedByAccountPeriodBranchForAccount(@Param("accountCode") String accountCode);
}
