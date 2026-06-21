package com.billbull.backend.security;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long>, JpaSpecificationExecutor<AuditLog> {

    /** Bulk-delete audit rows older than the cutoff (ARCHFIX §1.12 retention). Set-based delete,
     *  not entity-by-entity, so it scales. Returns the number of rows removed. */
    @Modifying
    @Query("DELETE FROM AuditLog a WHERE a.accessTime < :cutoff")
    int deleteByAccessTimeBefore(@Param("cutoff") LocalDateTime cutoff);

    List<AuditLog> findByUserId(Long userId);

    List<AuditLog> findByUsername(String username);

    List<AuditLog> findByAction(String action);

    List<AuditLog> findByAccessTimeBetween(LocalDateTime start, LocalDateTime end);

    List<AuditLog> findByEndpointContaining(String endpoint);

    List<AuditLog> findByRequestIdOrderByAccessTimeDesc(String requestId, Pageable pageable);

    List<AuditLog> findByEntityTypeAndEntityIdOrderByAccessTimeDesc(String entityType, String entityId, Pageable pageable);

    List<AuditLog> findByEventTypeOrderByAccessTimeDesc(String eventType);
}
