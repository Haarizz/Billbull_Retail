package com.billbull.platform.audit;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuditEventRepository extends JpaRepository<AuditEvent, Long>, JpaSpecificationExecutor<AuditEvent> {

    Optional<AuditEvent> findTopByOrderByIdDesc();

    @Query("SELECT e FROM AuditEvent e WHERE e.id > :afterId ORDER BY e.id ASC")
    List<AuditEvent> chunkAfter(@Param("afterId") long afterId, Pageable pageable);

    static Specification<AuditEvent> filter(Long tenantId, String action, String actor) {
        return (root, q, cb) -> {
            var p = cb.conjunction();
            if (tenantId != null) p = cb.and(p, cb.equal(root.get("tenantId"), tenantId));
            if (action != null && !action.isBlank()) p = cb.and(p, cb.equal(root.get("action"), action.trim()));
            if (actor != null && !actor.isBlank()) {
                p = cb.and(p, cb.like(cb.lower(root.get("actorEmail")), "%" + actor.trim().toLowerCase() + "%"));
            }
            return p;
        };
    }
}
