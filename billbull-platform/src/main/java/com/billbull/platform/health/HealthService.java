package com.billbull.platform.health;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.agent.TenantAgentClient;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.tenant.TenantStatus;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Polls every non-archived tenant's agent for health, stores a {@link HealthSnapshot}, and keeps
 * the tenant row's last status current.
 *
 * <p>Drift repair: when a tenant reports a {@code configVersion} other than the registry's — its
 * database was restored from a backup, or someone edited the state row by hand — the tenant is
 * marked out of sync so {@code StateSyncService} pushes the registry's state again.
 */
@Service
public class HealthService {

    private static final Logger log = LoggerFactory.getLogger(HealthService.class);

    private final TenantRepository tenants;
    private final HealthSnapshotRepository snapshots;
    private final TenantAgentClient agent;
    private final TransactionTemplate tx;
    private final int retentionDays;
    private final ExecutorService pool = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "health-poll");
        t.setDaemon(true);
        return t;
    });

    public HealthService(TenantRepository tenants, HealthSnapshotRepository snapshots, TenantAgentClient agent,
                         TransactionTemplate tx, @Value("${platform.health.retention-days:30}") int retentionDays) {
        this.tenants = tenants;
        this.snapshots = snapshots;
        this.agent = agent;
        this.tx = tx;
        this.retentionDays = Math.max(1, retentionDays);
    }

    public HealthSnapshot check(long tenantId) {
        Tenant t = tenants.findById(tenantId).orElseThrow();
        HealthSnapshot s = new HealthSnapshot();
        s.tenantId = t.id;
        s.checkedAt = Instant.now();
        if (!agent.configured(t)) {
            s.status = "NOT_CONFIGURED";
            s.error = "Agent URL or secret not set";
        } else {
            AgentResponse r = agent.get(t, "/api/platform/health", "platform-health");
            fill(s, r);
        }
        return tx.execute(status -> {
            HealthSnapshot saved = snapshots.save(s);
            tenants.findById(tenantId).ifPresent(fresh -> {
                fresh.lastHealthStatus = s.status;
                fresh.lastHealthAt = s.checkedAt;
                if (s.reportedConfigVersion != null && s.reportedConfigVersion != fresh.configVersion
                        && !fresh.syncPending()) {
                    fresh.appliedConfigVersion = s.reportedConfigVersion;
                    fresh.lastSyncError = "Tenant reported config version " + s.reportedConfigVersion
                            + " (expected " + fresh.configVersion + "); re-pushing.";
                }
                tenants.save(fresh);
            });
            return saved;
        });
    }

    static void fill(HealthSnapshot s, AgentResponse r) {
        s.latencyMs = r.latencyMs();
        if (r.unreachable()) {
            s.status = "UNREACHABLE";
            s.error = clip(r.error());
            return;
        }
        s.httpStatus = r.status();
        if (r.status() == 401 || r.status() == 503) {
            s.status = "AUTH_FAILED";
            s.error = clip(r.describe());
            return;
        }
        if (r.status() == 404) {
            s.status = "AGENT_OFF";
            s.error = "The tenant's platform agent is disabled (404)";
            return;
        }
        if (!r.ok() || r.body() == null) {
            s.status = "ERROR";
            s.error = clip(r.describe());
            return;
        }
        JsonNode b = r.body();
        String reported = text(b, "status");
        s.status = reported != null ? reported : "UP";
        s.uptimeSeconds = num(b, "uptimeSeconds");
        JsonNode build = b.path("build");
        s.appVersion = text(build, "version");
        s.artifactSha256 = text(build, "artifactSha256");
        s.artifactTime = text(build, "artifactTime");
        JsonNode fw = b.path("flyway");
        s.flywayVersion = text(fw, "currentVersion");
        s.flywayPending = intOrNull(num(fw, "pendingCount"));
        s.flywayFailed = intOrNull(num(fw, "failedCount"));
        s.dbSizeBytes = num(b.path("database"), "sizeBytes");
        JsonNode u = b.path("usage");
        s.activeUsers = num(u, "activeUsers");
        s.branches = num(u, "branches");
        s.terminals = num(u, "terminals");
        s.openSessions = num(u, "openPosSessions");
        s.onlineDevices = num(u, "onlineDevices");
        s.onlineUsers = num(u, "onlineUsers");
        s.invoices30d = num(u, "salesInvoices30d");
        s.lastInvoiceAt = text(u, "lastSalesInvoiceAt");
        JsonNode jvm = b.path("jvm");
        s.heapUsedBytes = num(jvm, "heapUsedBytes");
        s.heapMaxBytes = num(jvm, "heapMaxBytes");
        s.diskFreeBytes = num(jvm, "diskFreeBytes");
        s.diskTotalBytes = num(jvm, "diskTotalBytes");
        JsonNode st = b.path("state");
        s.reportedStatus = text(st, "status");
        s.reportedConfigVersion = num(st, "configVersion");
        JsonNode errors = b.path("errors");
        if (errors.isObject() && errors.size() > 0) s.error = clip(errors.toString());
    }

    @Scheduled(fixedDelayString = "${platform.health.poll-interval-ms:300000}", initialDelay = 15_000)
    public void pollAll() {
        List<Tenant> list = tenants.findByStatusNot(TenantStatus.ARCHIVED);
        List<Future<?>> futures = list.stream().map(t -> pool.submit(() -> {
            try {
                check(t.id);
            } catch (RuntimeException e) {
                log.warn("Health check for {} failed: {}", t.code, e.getMessage());
            }
        })).<Future<?>>map(f -> f).toList();
        for (Future<?> f : futures) {
            try {
                f.get(60, TimeUnit.SECONDS);
            } catch (Exception e) {
                f.cancel(true);
            }
        }
    }

    @Scheduled(cron = "0 15 3 * * *")
    public void prune() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(retentionDays));
        Integer n = tx.execute(s -> snapshots.deleteOlderThan(cutoff));
        if (n != null && n > 0) log.info("Pruned {} health snapshots older than {} days", n, retentionDays);
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n == null ? null : n.get(f);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static Long num(JsonNode n, String f) {
        JsonNode v = n == null ? null : n.get(f);
        return v == null || !v.isNumber() ? null : v.asLong();
    }

    private static Integer intOrNull(Long v) {
        return v == null ? null : v.intValue();
    }

    private static String clip(String s) {
        if (s == null) return null;
        return s.length() > 1000 ? s.substring(0, 1000) : s;
    }
}
