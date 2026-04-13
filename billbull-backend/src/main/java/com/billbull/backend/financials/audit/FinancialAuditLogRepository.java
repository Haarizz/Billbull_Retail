package com.billbull.backend.financials.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface FinancialAuditLogRepository extends JpaRepository<FinancialAuditLog, Long> {

    List<FinancialAuditLog> findByEntityTypeAndEntityIdOrderByTimestampDesc(String entityType, String entityId);

    List<FinancialAuditLog> findByEntityTypeOrderByTimestampDesc(String entityType);

    List<FinancialAuditLog> findByTimestampBetweenOrderByTimestampDesc(LocalDateTime start, LocalDateTime end);

    List<FinancialAuditLog> findAllByOrderByTimestampDesc();
}
