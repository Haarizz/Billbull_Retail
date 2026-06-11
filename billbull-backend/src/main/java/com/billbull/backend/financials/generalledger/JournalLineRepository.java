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
     * (account 1102) with a matching amount and date within a given range.
     */
    @Query("""
        SELECT jl FROM JournalLine jl
        JOIN jl.journalEntry je
        WHERE (jl.accountCode = '1102' OR jl.accountCode = '1101')
          AND (jl.debit = :amount OR jl.credit = :amount)
          AND je.date BETWEEN :fromDate AND :toDate
          AND (jl.reconciled IS NULL OR jl.reconciled = false)
        ORDER BY je.date ASC
    """)
    List<JournalLine> findUnreconciledBankLines(
            @Param("amount") BigDecimal amount,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);
}
