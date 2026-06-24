package com.billbull.backend.financials.generalledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {
    Optional<JournalEntry> findByEntryNumber(String entryNumber);

    boolean existsByEntryNumber(String entryNumber);

    boolean existsByReference(String reference);

    Optional<JournalEntry> findByReference(String reference);

    java.util.List<JournalEntry> findByStatus(String status);

    // ARCHFIX §1.6: lines + branch are now LAZY. These JOIN FETCH them for the read paths that
    // serialize the entry (list + by-id). DISTINCT collapses the lines join's row duplication;
    // branch is a @ManyToOne so it does not multiply rows. Polymorphism (JournalVoucher subtype)
    // is preserved — the query targets the JournalEntry root.
    @Query("SELECT DISTINCT e FROM JournalEntry e LEFT JOIN FETCH e.lines LEFT JOIN FETCH e.branch")
    java.util.List<JournalEntry> findAllWithLinesAndBranch();

    @Query("SELECT e FROM JournalEntry e LEFT JOIN FETCH e.lines LEFT JOIN FETCH e.branch WHERE e.id = :id")
    Optional<JournalEntry> findByIdWithLinesAndBranch(@Param("id") Long id);
}
