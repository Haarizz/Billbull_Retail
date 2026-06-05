package com.billbull.backend.security;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long>, JpaSpecificationExecutor<AuditLog> {

    List<AuditLog> findByUserId(Long userId);

    List<AuditLog> findByUsername(String username);

    List<AuditLog> findByAction(String action);

    List<AuditLog> findByAccessTimeBetween(LocalDateTime start, LocalDateTime end);

    List<AuditLog> findByEndpointContaining(String endpoint);

    List<AuditLog> findByRequestIdOrderByAccessTimeDesc(String requestId);

    List<AuditLog> findByEntityTypeAndEntityIdOrderByAccessTimeDesc(String entityType, String entityId);

    List<AuditLog> findByEventTypeOrderByAccessTimeDesc(String eventType);
}
