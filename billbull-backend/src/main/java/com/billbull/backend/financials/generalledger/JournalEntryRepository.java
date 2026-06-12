package com.billbull.backend.financials.generalledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {
    Optional<JournalEntry> findByEntryNumber(String entryNumber);

    boolean existsByEntryNumber(String entryNumber);

    boolean existsByReference(String reference);

    Optional<JournalEntry> findByReference(String reference);

    java.util.List<JournalEntry> findByStatus(String status);
}
