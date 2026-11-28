package com.billbull.platform.announcement;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A message shown to clients' users. {@code version} goes up on every change the clients must
 * see (text, audience, window, targets, status), so a client's acknowledged version says whether
 * it has the current text.
 */
@Entity
@Table(name = "announcements")
public class Announcement {

    public static final String LIVE = "LIVE";
    public static final String ARCHIVED = "ARCHIVED";
    public static final String DELETED = "DELETED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false, length = 150)
    public String title;

    @Column(nullable = false, columnDefinition = "text")
    public String message;

    @Column(nullable = false, length = 20)
    public String kind = "INFO";

    @Column(nullable = false, length = 20)
    public String audience = "EVERYONE";

    @Column(name = "target_all", nullable = false)
    public boolean targetAll = true;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "announcement_targets", joinColumns = @JoinColumn(name = "announcement_id"))
    @Column(name = "tenant_id", nullable = false)
    public Set<Long> tenantIds = new LinkedHashSet<>();

    @Column(nullable = false, length = 20)
    public String status = LIVE;

    @Column(nullable = false)
    public int version = 1;

    @Column(name = "starts_at")
    public Instant startsAt;

    @Column(name = "ends_at")
    public Instant endsAt;

    @Column(name = "created_by", length = 200)
    public String createdBy;

    @Column(name = "updated_by", length = 200)
    public String updatedBy;

    @Column(name = "published_at")
    public Instant publishedAt;

    @Column(name = "archived_at")
    public Instant archivedAt;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    /** Whether clients should be showing it now or later (live and not past its end). */
    public boolean deliverable(Instant now) {
        return LIVE.equals(status) && (endsAt == null || endsAt.isAfter(now));
    }

    public boolean targets(long tenantId) {
        return targetAll || tenantIds.contains(tenantId);
    }
}
