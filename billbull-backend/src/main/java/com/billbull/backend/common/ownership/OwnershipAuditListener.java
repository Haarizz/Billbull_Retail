package com.billbull.backend.common.ownership;

import jakarta.persistence.PrePersist;

/**
 * JPA entity listener that stamps {@link OwnedEntity#getCreatedByUserId()} from the current
 * authenticated principal at persist time — the stable-id half of ownership auditing (the
 * {@code created_by} username half, where present, stays with Spring Data's
 * {@code AuditingEntityListener}).
 *
 * <p>Registered on {@code common.BaseEntity} AND on each standalone {@link OwnedEntity} aggregate
 * root via {@code @EntityListeners}, so it fires for EVERY persisted owned entity regardless of
 * which service or code path inserts it — this is why the roadmap prefers an entity listener over a
 * second {@code AuditorAware<Long>} (which only covers Spring Data auditing, and only BaseEntity).
 *
 * <p>Null-safe by design: system/seeder/scheduler/unauthenticated writes run with no ownership
 * context (or a null user id) and leave {@code createdByUserId} null — treated downstream as
 * "unowned" (visible to override-holders only when filtering is enabled). Never throws.
 *
 * <p>Idempotent-friendly: only stamps when the field is still null, so an explicitly pre-set owner
 * (e.g. a data-migration back-fill) is preserved. Only runs on {@code @PrePersist} (insert), never
 * on update — ownership is immutable.
 */
public class OwnershipAuditListener {

    @PrePersist
    public void stampOwner(Object entity) {
        if (!(entity instanceof OwnedEntity owned)) {
            return;
        }
        if (owned.getCreatedByUserId() != null) {
            return; // already set (e.g. explicit backfill) — never overwrite.
        }
        Long userId = OwnershipContextHolder.currentUserId();
        if (userId != null) {
            owned.setCreatedByUserId(userId);
        }
    }
}
