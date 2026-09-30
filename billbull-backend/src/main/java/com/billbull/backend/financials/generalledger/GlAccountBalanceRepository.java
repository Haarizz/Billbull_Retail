package com.billbull.backend.financials.generalledger;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GlAccountBalanceRepository extends JpaRepository<GlAccountBalance, Long> {

    Optional<GlAccountBalance> findByAccountCodeAndFiscalPeriodIdAndBranchId(
            String accountCode, Long fiscalPeriodId, Long branchId);

    /**
     * Pessimistically-locked finder used by the posting engine when applying a balance delta.
     * Serializes concurrent postings to the same (account, period, branch) triple so the
     * read-modify-write in PostingEngineService.upsertGlBalances() cannot lose an increment
     * (ARCHFIX P0 §1.3). Mirrors the locking convention already used by VoucherSequenceRepository,
     * InventoryBalanceRepository, BatchMasterRepository and StockMovementRepository.
     *
     * NULL-safe: fiscal_period_id / branch_id may be null for rolling-window balances, so the
     * query uses IS NULL comparisons rather than equality (which never matches NULL in SQL).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT b FROM GlAccountBalance b
         WHERE b.accountCode = :accountCode
           AND ((:fiscalPeriodId IS NULL AND b.fiscalPeriodId IS NULL) OR b.fiscalPeriodId = :fiscalPeriodId)
           AND ((:branchId IS NULL AND b.branchId IS NULL) OR b.branchId = :branchId)
        """)
    Optional<GlAccountBalance> findForUpdate(
            @Param("accountCode") String accountCode,
            @Param("fiscalPeriodId") Long fiscalPeriodId,
            @Param("branchId") Long branchId);

    List<GlAccountBalance> findByAccountCode(String accountCode);

    /**
     * Balance rows for one account, narrowed to the branches the caller can reach.
     *
     * <p>Branch-scoped for the same reason {@code LedgerEntryRepository.findRecentByAccountCodeScoped}
     * is: a GL balance is branch-attributed financial data, so a user who cannot reach a branch
     * must not read its debit/credit/closing figures in the global-search details panel either.
     * {@code allBranches = true} applies no branch predicate at all (ADMIN / SUPER_ADMIN).
     *
     * <p>Rows with no branch stay visible, as everywhere else in this codebase's branch scoping —
     * they are the posting engine's rolling-window/unattributed rows, and dropping them would
     * leave the panel's branch breakdown failing to add up to its own account total.
     */
    @Query("""
        SELECT b FROM GlAccountBalance b
         WHERE b.accountCode = :accountCode
           AND (:allBranches = true OR b.branchId IS NULL OR b.branchId IN :branchIds)
        """)
    List<GlAccountBalance> findByAccountCodeScoped(
            @Param("accountCode") String accountCode,
            @Param("allBranches") boolean allBranches,
            @Param("branchIds") java.util.Collection<Long> branchIds);

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
