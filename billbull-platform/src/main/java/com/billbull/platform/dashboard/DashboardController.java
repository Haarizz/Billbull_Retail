package com.billbull.platform.dashboard;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.platform.audit.AuditController;
import com.billbull.platform.audit.AuditEventRepository;
import com.billbull.platform.backup.BackupController;
import com.billbull.platform.health.HealthSnapshot;
import com.billbull.platform.health.HealthSnapshotRepository;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.tenant.TenantStatus;

/**
 * Fleet overview for the home screen: tenants by status, health, which builds and migration
 * versions are deployed, and a list of things that need someone's attention.
 */
@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("hasRole('VIEWER')")
public class DashboardController {

    private final TenantRepository tenants;
    private final HealthSnapshotRepository snapshots;
    private final BackupController backups;
    private final AuditEventRepository audit;

    public DashboardController(TenantRepository tenants, HealthSnapshotRepository snapshots,
                               BackupController backups, AuditEventRepository audit) {
        this.tenants = tenants;
        this.snapshots = snapshots;
        this.backups = backups;
        this.audit = audit;
    }

    @GetMapping
    public Map<String, Object> summary() {
        List<Tenant> all = tenants.findAllByOrderByNameAsc().stream().filter(t -> t.status != TenantStatus.ARCHIVED).toList();
        Map<Long, HealthSnapshot> latest = snapshots.latestPerTenant().stream()
                .collect(Collectors.toMap(s -> s.tenantId, Function.identity(), (a, b) -> a));

        Map<String, Long> byStatus = new TreeMap<>(all.stream().collect(Collectors.groupingBy(t -> t.status.name(), Collectors.counting())));
        Map<String, Long> byHealth = new TreeMap<>(all.stream().collect(Collectors.groupingBy(
                t -> t.lastHealthStatus == null ? "UNKNOWN" : t.lastHealthStatus, Collectors.counting())));

        // From the last full report, so a tenant that is down right now still shows what it runs.
        Map<Long, HealthSnapshot> reporting = snapshots.latestReportingPerTenant().stream()
                .collect(Collectors.toMap(s -> s.tenantId, Function.identity(), (a, b) -> a));
        Map<String, List<String>> builds = new TreeMap<>();
        Map<String, List<String>> migrations = new TreeMap<>();
        for (Tenant t : all) {
            HealthSnapshot s = reporting.get(t.id);
            if (s == null) continue;
            if (s.artifactSha256 != null) {
                String b = s.artifactSha256.substring(0, Math.min(12, s.artifactSha256.length()))
                        + (s.artifactTime != null ? " · " + s.artifactTime : "");
                builds.computeIfAbsent(b, k -> new ArrayList<>()).add(t.code);
            }
            if (s.flywayVersion != null) migrations.computeIfAbsent(s.flywayVersion, k -> new ArrayList<>()).add(t.code);
        }

        List<Map<String, Object>> attention = new ArrayList<>();
        for (Tenant t : all) {
            HealthSnapshot s = latest.get(t.id);
            if (t.lastHealthStatus != null && !"UP".equals(t.lastHealthStatus)) {
                attention.add(issue(t, "HEALTH", "Health is " + t.lastHealthStatus
                        + (s != null && s.error != null ? ": " + s.error : "")));
            }
            if (t.lastHealthStatus == null) attention.add(issue(t, "HEALTH", "Never checked — set up the agent"));
            if (t.syncPending() && t.lastSyncError != null) attention.add(issue(t, "SYNC", t.lastSyncError));
            if (s != null && s.flywayFailed != null && s.flywayFailed > 0) attention.add(issue(t, "MIGRATION", s.flywayFailed + " failed Flyway migration(s)"));
            if (s != null && s.flywayPending != null && s.flywayPending > 0) attention.add(issue(t, "MIGRATION", s.flywayPending + " pending Flyway migration(s)"));
            if (s != null && s.heapMaxBytes != null && s.heapUsedBytes != null && s.heapMaxBytes > 0
                    && s.heapUsedBytes > 0.9 * s.heapMaxBytes) {
                attention.add(issue(t, "MEMORY", "Heap above 90% of its maximum"));
            }
            if (s != null && s.diskTotalBytes != null && s.diskFreeBytes != null && s.diskTotalBytes > 0
                    && s.diskFreeBytes < 0.1 * s.diskTotalBytes) {
                attention.add(issue(t, "DISK", "Less than 10% disk free on the server"));
            }
        }
        for (Map<String, Object> b : backups.perTenant()) {
            String state = (String) b.get("state");
            if (!"OK".equals(state)) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("tenantId", b.get("tenantId"));
                m.put("tenantCode", b.get("tenantCode"));
                m.put("kind", "BACKUP");
                m.put("message", switch (state) {
                    case "FAILED" -> "Last backup failed: " + b.get("lastRunMessage");
                    case "STALE" -> "Last successful backup at " + b.get("lastSuccessAt");
                    default -> "No backup has ever been reported";
                });
                attention.add(m);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tenantCount", all.size());
        out.put("byStatus", byStatus);
        out.put("byHealth", byHealth);
        out.put("builds", builds);
        out.put("migrationVersions", migrations);
        out.put("attention", attention);
        out.put("recentActivity", AuditController.views(audit.findAll(PageRequest.of(0, 15, Sort.by(Sort.Direction.DESC, "id"))).getContent()));
        return out;
    }

    private static Map<String, Object> issue(Tenant t, String kind, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tenantId", t.id);
        m.put("tenantCode", t.code);
        m.put("kind", kind);
        m.put("message", message);
        return m;
    }
}
