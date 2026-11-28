package com.billbull.platform.health;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One poll of a tenant's {@code GET /api/platform/health}. {@code status} is the control plane's
 * verdict: {@code UP}, {@code DEGRADED} and {@code DOWN} come from the tenant; {@code UNREACHABLE}
 * (no answer), {@code AUTH_FAILED} (signature refused — wrong secret or clock), {@code AGENT_OFF}
 * (agent disabled, 404) and {@code ERROR} are decided here.
 */
@Entity
@Table(name = "health_snapshots")
public class HealthSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "tenant_id", nullable = false)
    public Long tenantId;

    @Column(name = "checked_at", nullable = false)
    public Instant checkedAt;

    @Column(nullable = false, length = 20)
    public String status;

    @Column(name = "http_status")
    public Integer httpStatus;

    @Column(name = "latency_ms")
    public Long latencyMs;

    @Column(name = "app_version", length = 60)
    public String appVersion;

    @Column(name = "artifact_sha256", length = 64)
    public String artifactSha256;

    @Column(name = "artifact_time", length = 40)
    public String artifactTime;

    @Column(name = "flyway_version", length = 30)
    public String flywayVersion;

    @Column(name = "flyway_pending")
    public Integer flywayPending;

    @Column(name = "flyway_failed")
    public Integer flywayFailed;

    @Column(name = "db_size_bytes")
    public Long dbSizeBytes;

    @Column(name = "active_users")
    public Long activeUsers;

    public Long branches;

    public Long terminals;

    @Column(name = "open_sessions")
    public Long openSessions;

    /** Devices / people active in the last 3 minutes when the snapshot was taken (V4). */
    @Column(name = "online_devices")
    public Long onlineDevices;

    @Column(name = "online_users")
    public Long onlineUsers;

    @Column(name = "invoices_30d")
    public Long invoices30d;

    @Column(name = "last_invoice_at", length = 40)
    public String lastInvoiceAt;

    @Column(name = "heap_used_bytes")
    public Long heapUsedBytes;

    @Column(name = "heap_max_bytes")
    public Long heapMaxBytes;

    @Column(name = "disk_free_bytes")
    public Long diskFreeBytes;

    @Column(name = "disk_total_bytes")
    public Long diskTotalBytes;

    @Column(name = "uptime_seconds")
    public Long uptimeSeconds;

    @Column(name = "reported_status", length = 20)
    public String reportedStatus;

    @Column(name = "reported_config_version")
    public Long reportedConfigVersion;

    @Column(length = 1000)
    public String error;
}
