package com.billbull.backend.financials.generalledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, String> {

    // Returns transactions sorted by newest first for the history table
    List<LedgerEntry> findAllByOrderByTransactionDateDesc();

    List<LedgerEntry> findByAccountCodeOrderByTransactionDateAsc(String accountCode);

    List<LedgerEntry> findByTransactionDateBetweenOrderByTransactionDateAsc(java.time.LocalDate start,
            java.time.LocalDate end);

    List<LedgerEntry> findByTransactionDateBefore(java.time.LocalDate date);

    boolean existsByAccountCode(String accountCode);

    @Query("select distinct le.accountCode from LedgerEntry le where le.accountCode is not null")
    List<String> findDistinctAccountCodes();
}
