package com.billbull.platform.support;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A support sign-in the control plane requested. The token itself is never stored. */
@Entity
@Table(name = "support_sessions")
public class SupportSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "tenant_id", nullable = false)
    public Long tenantId;

    @Column(name = "platform_user_id")
    public Long platformUserId;

    @Column(name = "platform_user_email", length = 200)
    public String platformUserEmail;

    @Column(nullable = false, length = 1000)
    public String reason;

    @Column(name = "ticket_ref", length = 100)
    public String ticketRef;

    @Column(nullable = false)
    public int minutes;

    /** The id of the matching row in the tenant's {@code platform_support_sessions}. */
    @Column(name = "tenant_session_id")
    public Long tenantSessionId;

    @Column(name = "expires_at", nullable = false)
    public Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @Column(name = "revoked_at")
    public Instant revokedAt;

    @Column(name = "revoked_by", length = 200)
    public String revokedBy;
}
