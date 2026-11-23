package com.billbull.platform.tenant;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * One BillBull client in the registry: who they are, where their backend runs, their plan and
 * overrides, and the control plane's view of their sync and health.
 *
 * <p>{@code configVersion} is bumped by every change the tenant must enforce (status, plan,
 * modules, limits); {@code appliedConfigVersion} is the version the tenant last acknowledged. The
 * sync job pushes whenever the two differ.
 */
@Entity
@Table(name = "tenants")
public class Tenant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false, unique = true, length = 40)
    public String code;

    @Column(nullable = false, length = 200)
    public String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    public TenantStatus status = TenantStatus.ONBOARDING;

    /** Internal note on why the status was set; never shown to the client. */
    @Column(name = "status_reason", length = 500)
    public String statusReason;

    /** Message the client's users see while READ_ONLY or SUSPENDED (blank = standard wording). */
    @Column(name = "status_message", length = 500)
    public String statusMessage;

    @Column(name = "status_changed_at")
    public Instant statusChangedAt;

    @Column(name = "plan_id")
    public Long planId;

    /** Public address users open, e.g. {@code https://demo.billbull.app}. */
    @Column(name = "app_url", length = 300)
    public String appUrl;

    /** Base URL the control plane uses for the agent; usually the same as {@link #appUrl}. */
    @Column(name = "agent_url", length = 300)
    public String agentUrl;

    @Column(name = "agent_secret_enc", length = 500)
    public String agentSecretEnc;

    @Column(name = "agent_secret_set_at")
    public Instant agentSecretSetAt;

    @Column(name = "server_label", length = 120)
    public String serverLabel;

    @Column(name = "spring_profile", length = 60)
    public String springProfile;

    @Column(name = "backend_port")
    public Integer backendPort;

    @Column(name = "database_name", length = 100)
    public String databaseName;

    @Column(name = "contact_name", length = 150)
    public String contactName;

    @Column(name = "contact_email", length = 200)
    public String contactEmail;

    @Column(name = "contact_phone", length = 50)
    public String contactPhone;

    @Column(columnDefinition = "text")
    public String notes;

    /** Limit overrides on top of the plan (null = follow the plan, 0 = unlimited). */
    @Column(name = "max_users")
    public Integer maxUsers;

    @Column(name = "max_branches")
    public Integer maxBranches;

    @Column(name = "max_terminals_per_branch")
    public Integer maxTerminalsPerBranch;

    /** Module overrides on top of the plan: absent = follow the plan. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "tenant_module_overrides", joinColumns = @JoinColumn(name = "tenant_id"))
    @MapKeyColumn(name = "module", length = 40)
    @Column(name = "enabled", nullable = false)
    public Map<String, Boolean> moduleOverrides = new LinkedHashMap<>();

    @Column(name = "config_version", nullable = false)
    public long configVersion = 1;

    @Column(name = "applied_config_version", nullable = false)
    public long appliedConfigVersion;

    @Column(name = "last_sync_at")
    public Instant lastSyncAt;

    @Column(name = "last_sync_error", length = 1000)
    public String lastSyncError;

    @Column(name = "last_health_status", length = 20)
    public String lastHealthStatus;

    @Column(name = "last_health_at")
    public Instant lastHealthAt;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @Column(name = "created_by", length = 200)
    public String createdBy;

    @PrePersist
    void prePersist() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    /** Marks a change the tenant must enforce; the sync job will push it. */
    public void bumpConfig() {
        configVersion++;
    }

    public boolean syncPending() {
        return appliedConfigVersion != configVersion;
    }
}
