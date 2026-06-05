package com.billbull.backend.financials.generalledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GlAccountBalanceRepository extends JpaRepository<GlAccountBalance, Long> {

    Optional<GlAccountBalance> findByAccountCodeAndFiscalPeriodIdAndBranchId(
            String accountCode, Long fiscalPeriodId, Long branchId);

    List<GlAccountBalance> findByAccountCode(String accountCode);

    List<GlAccountBalance> findByFiscalPeriodId(Long fiscalPeriodId);

    /** All balances for a branch, ordered by account code for report consumption. */
    List<GlAccountBalance> findByBranchIdOrderByAccountCode(Long branchId);

    /** Used by nightly drift-check: accounts where sum of journal_lines doesn't match pre-aggregated balance. */
    @Query(value = """
        SELECT gab.account_code
        FROM gl_account_balances gab
        JOIN (
            SELECT jl.account_code,
                   COALESCE(SUM(jl.debit), 0)  AS sum_dr,
                   COALESCE(SUM(jl.credit), 0) AS sum_cr
            FROM journal_lines jl
            GROUP BY jl.account_code
        ) live ON live.account_code = gab.account_code
        WHERE ABS(gab.debit_total  - live.sum_dr) > 1.00
           OR ABS(gab.credit_total - live.sum_cr) > 1.00
        """, nativeQuery = true)
    List<String> findDriftedAccountCodes();
}
