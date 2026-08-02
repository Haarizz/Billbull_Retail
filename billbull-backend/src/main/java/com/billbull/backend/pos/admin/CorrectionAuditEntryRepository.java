package com.billbull.backend.pos.admin;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CorrectionAuditEntryRepository extends JpaRepository<CorrectionAuditEntry, Long> {
    List<CorrectionAuditEntry> findByCorrectionRequestIdOrderByTimestampAsc(Long correctionRequestId);
}
