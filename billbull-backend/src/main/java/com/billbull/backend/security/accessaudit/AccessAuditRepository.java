package com.billbull.backend.security.accessaudit;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Read + insert only. Extends the bare {@link Repository} marker rather than JpaRepository so no
 * delete/deleteAll/saveAll-on-existing method exists to call by mistake; the V144 triggers back
 * this up at the database level.
 */
public interface AccessAuditRepository
        extends Repository<AccessAuditEvent, Long>, JpaSpecificationExecutor<AccessAuditEvent> {

    AccessAuditEvent save(AccessAuditEvent event);

    Optional<AccessAuditEvent> findById(Long id);

    /** Tail of the hash chain — read under the chain lock, see AccessAuditService. */
    Optional<AccessAuditEvent> findTopByOrderByIdDesc();

    /** Chain walk for verification, in insertion order. */
    @Query("SELECT e FROM AccessAuditEvent e WHERE e.id > :afterId ORDER BY e.id ASC")
    List<AccessAuditEvent> findChainPage(@Param("afterId") long afterId, Pageable pageable);

    List<AccessAuditEvent> findByChangeSetIdOrderByIdAsc(String changeSetId);

    @Query("SELECT DISTINCT e.actorUsername FROM AccessAuditEvent e ORDER BY e.actorUsername")
    List<String> findDistinctActors();

    @Query("SELECT DISTINCT e.roleName FROM AccessAuditEvent e WHERE e.roleName IS NOT NULL ORDER BY e.roleName")
    List<String> findDistinctRoleNames();

    long count();
}
