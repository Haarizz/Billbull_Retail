package com.billbull.backend.common;

import java.time.LocalDateTime;

import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;


import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import com.billbull.backend.common.ownership.OwnershipAuditListener;

/**
 * Base for every persisted entity: id, audit stamps, soft-delete flag, and the ownership owner id.
 *
 * <p>The {@code ownerFilter} Hibernate filter is DEFINED here but never auto-enabled — defining a
 * filter is inert. {@code common.ownership.OwnershipFilterAspect} enables it on the session per
 * request only when the ownership feature toggle is on AND the principal is ownership-restricted
 * (lacks {@code VIEW_ALL_RECORDS}). It is a defence-in-depth net over derived/JPQL list queries;
 * it does NOT cover native SQL or {@code EntityManager.find(id)}, so single-record and report paths
 * are guarded explicitly via {@code OwnershipAccessService}. See
 * docs/future-enhancements/02-user-based-data-visibility.md §3 (Approach A).
 */
@MappedSuperclass
@EntityListeners({AuditingEntityListener.class, OwnershipAuditListener.class})
@FilterDef(name = "ownerFilter", parameters = @ParamDef(name = "ownerId", type = Long.class))
@Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public abstract class BaseEntity implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @CreatedBy
    @Column(name = "created_by", updatable = false)
    private String createdBy;

    /**
     * Stable owner id for user-based data visibility (ownership filtering) — see
     * docs/future-enhancements/02-user-based-data-visibility.md. Populated on persist by
     * {@code common.ownership.OwnershipAuditListener} from the authenticated principal, alongside
     * the {@link #createdBy} username. Nullable forever: system/seeder/unauthenticated writes leave
     * it null (treated as "unowned"). Filtering keys on this id rather than the brittle username so
     * a user rename never orphans or re-owns historical rows. Never updated after insert.
     */
    @Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @LastModifiedBy
    @Column(name = "updated_by")
    private String updatedBy;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    public Long getId() {
        return id;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public boolean isActive() {
        return isActive;
    }

    public void setActive(boolean active) {
        this.isActive = active;
    }

	public void setId(Long id) {
		this.id = id;
	}

	public void setCreatedAt(LocalDateTime createdAt) {
		this.createdAt = createdAt;
	}

	public void setCreatedBy(String createdBy) {
		this.createdBy = createdBy;
	}

	public void setUpdatedAt(LocalDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}

	public void setUpdatedBy(String updatedBy) {
		this.updatedBy = updatedBy;
	}
}
