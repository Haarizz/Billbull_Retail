package com.billbull.backend.pos.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PosAuditLogRepository extends JpaRepository<PosAuditLog, Long> {

    List<PosAuditLog> findBySessionIdOrderByCreatedAtDesc(Long sessionId);

    List<PosAuditLog> findByBranchIdAndActionOrderByCreatedAtDesc(Long branchId, PosAuditAction action);

    long countBySessionIdAndAction(Long sessionId, PosAuditAction action);
}
