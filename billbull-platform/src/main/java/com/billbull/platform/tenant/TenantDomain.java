package com.billbull.platform.tenant;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** A hostname a tenant is served on (unique across the platform). */
@Entity
@Table(name = "tenant_domains")
public class TenantDomain {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "tenant_id", nullable = false)
    public Long tenantId;

    @Column(nullable = false, unique = true, length = 253)
    public String host;

    /** {@code APP} (Retail + /pos/), or {@code OTHER} for aliases. */
    @Column(nullable = false, length = 20)
    public String kind = "APP";

    @Column(name = "primary_domain", nullable = false)
    public boolean primaryDomain;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @PrePersist
    void prePersist() {
        createdAt = Instant.now();
    }
}
