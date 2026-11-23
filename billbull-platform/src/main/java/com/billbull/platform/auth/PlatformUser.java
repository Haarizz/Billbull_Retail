package com.billbull.platform.auth;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A BillBull staff member who can sign in to the control plane. Completely separate from every
 * tenant's {@code users} table: a tenant ADMIN is not a platform user and vice versa.
 *
 * <p>Entities in this module use public fields (field access) and are never serialised
 * directly — controllers return DTOs, so secrets such as {@link #passwordHash} never leave.
 */
@Entity
@Table(name = "platform_users")
public class PlatformUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false, unique = true, length = 200)
    public String email;

    @Column(name = "full_name", nullable = false, length = 150)
    public String fullName;

    @Column(name = "password_hash", nullable = false, length = 100)
    public String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    public PlatformRole role;

    @Column(nullable = false)
    public boolean active = true;

    @Column(name = "mfa_enabled", nullable = false)
    public boolean mfaEnabled;

    @Column(name = "mfa_secret_enc", length = 500)
    public String mfaSecretEnc;

    @Column(name = "mfa_pending_secret_enc", length = 500)
    public String mfaPendingSecretEnc;

    @Column(name = "failed_attempts", nullable = false)
    public int failedAttempts;

    @Column(name = "locked_until")
    public Instant lockedUntil;

    @Column(name = "last_login_at")
    public Instant lastLoginAt;

    @Column(name = "last_login_ip", length = 64)
    public String lastLoginIp;

    @Column(name = "password_changed_at")
    public Instant passwordChangedAt;

    @Column(name = "must_change_password", nullable = false)
    public boolean mustChangePassword;

    /** Bumped to invalidate every session this user holds (sign out everywhere, role change). */
    @Column(name = "token_version", nullable = false)
    public int tokenVersion;

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
}
