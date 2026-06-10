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
}
