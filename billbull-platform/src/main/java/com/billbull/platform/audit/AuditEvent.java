package com.billbull.platform.audit;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One row of the append-only control-plane audit trail (DB triggers refuse UPDATE/DELETE). */
@Entity
@Table(name = "platform_audit_events")
public class AuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    @Column(name = "actor_id")
    public Long actorId;

    @Column(name = "actor_email", length = 200)
    public String actorEmail;

    @Column(nullable = false, length = 60)
    public String action;

    @Column(name = "target_type", length = 40)
    public String targetType;

    @Column(name = "target_id", length = 100)
    public String targetId;

    @Column(name = "tenant_id")
    public Long tenantId;

    @Column(columnDefinition = "text")
    public String detail;

    @Column(length = 64)
    public String ip;

    @Column(name = "prev_hash", length = 64)
    public String prevHash;

    @Column(nullable = false, length = 64)
    public String hash;
}
