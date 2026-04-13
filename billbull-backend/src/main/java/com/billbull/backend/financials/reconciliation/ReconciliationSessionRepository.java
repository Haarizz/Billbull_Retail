package com.billbull.backend.financials.reconciliation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ReconciliationSessionRepository extends JpaRepository<ReconciliationSession, Long> {
}
