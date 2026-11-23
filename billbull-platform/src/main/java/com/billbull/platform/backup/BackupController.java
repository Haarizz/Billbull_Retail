package com.billbull.platform.backup;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.tenant.TenantStatus;
import com.billbull.platform.web.ClientIp;

/**
 * Backup monitoring. Each server's backup script (docs/superadmin/billbull-backup.sh) posts one
 * report per dump to {@code POST /api/backups/report} with {@code X-Backup-Token}; the dashboard
 * flags a tenant whose last successful database backup is older than
 * {@code platform.backup.stale-after-hours} or whose last run failed.
 */
@RestController
@RequestMapping("/api/backups")
public class BackupController {

    private final BackupReportRepository reports;
    private final TenantRepository tenants;
    private final String token;
    private final int staleAfterHours;

    public BackupController(BackupReportRepository reports, TenantRepository tenants,
                            @Value("${PLATFORM_BACKUP_TOKEN:}") String token,
                            @Value("${platform.backup.stale-after-hours:26}") int staleAfterHours) {
        this.reports = reports;
        this.tenants = tenants;
        this.token = token == null ? "" : token.trim();
        this.staleAfterHours = Math.max(1, staleAfterHours);
    }

    public record ReportInput(String tenantCode, String databaseName, String kind, String status, Instant startedAt,
                              Instant finishedAt, Long sizeBytes, String location, String checksumSha256,
                              String message) {}

    @PostMapping("/report")
    public Map<String, Object> report(@RequestHeader(value = "X-Backup-Token", required = false) String provided,
                                      @RequestBody ReportInput in, HttpServletRequest request) {
        if (token.length() < 32 || provided == null
                || !MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8), provided.trim().getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Bad or missing X-Backup-Token");
        }
        String status = in.status() == null ? "" : in.status().trim().toUpperCase();
        String kind = in.kind() == null || in.kind().isBlank() ? "DATABASE" : in.kind().trim().toUpperCase();
        if (!status.equals("SUCCESS") && !status.equals("FAILED")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be SUCCESS or FAILED");
        }
        if (!kind.equals("DATABASE") && !kind.equals("UPLOADS")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "kind must be DATABASE or UPLOADS");
        }
        Tenant t = null;
        if (in.tenantCode() != null && !in.tenantCode().isBlank()) {
            t = tenants.findByCode(in.tenantCode().trim().toLowerCase()).orElse(null);
        }
        if (t == null && in.databaseName() != null) t = tenants.findByDatabaseName(in.databaseName().trim()).orElse(null);
        BackupReport r = new BackupReport();
        r.tenantId = t != null ? t.id : null;
        r.tenantCode = clip(in.tenantCode(), 40);
        r.databaseName = clip(in.databaseName(), 100);
        r.kind = kind;
        r.status = status;
        r.startedAt = in.startedAt();
        r.finishedAt = in.finishedAt();
        r.sizeBytes = in.sizeBytes();
        r.location = clip(in.location(), 500);
        r.checksumSha256 = clip(in.checksumSha256(), 64);
        r.message = clip(in.message(), 1000);
        r.reportedAt = Instant.now();
        r.reporterIp = ClientIp.of(request);
        reports.save(r);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", r.id);
        out.put("matchedTenant", t != null ? t.code : null);
        return out;
    }

    @GetMapping
    @PreAuthorize("hasRole('VIEWER')")
    public Map<String, Object> overview(@RequestParam(defaultValue = "100") int limit) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("staleAfterHours", staleAfterHours);
        out.put("tenants", perTenant());
        out.put("recent", reports.findAllByOrderByReportedAtDesc(PageRequest.of(0, Math.max(1, Math.min(500, limit))))
                .stream().map(BackupController::view).toList());
        return out;
    }

    @GetMapping("/tenant/{tenantId}")
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, Object>> forTenant(@PathVariable long tenantId, @RequestParam(defaultValue = "50") int limit) {
        return reports.findByTenantIdOrderByReportedAtDesc(tenantId, PageRequest.of(0, Math.max(1, Math.min(500, limit))))
                .stream().map(BackupController::view).toList();
    }

    /** One row per non-archived tenant: last success, last run, and whether it needs attention. */
    public List<Map<String, Object>> perTenant() {
        Map<Long, BackupReport> success = reports.latestSuccessPerTenant().stream()
                .collect(Collectors.toMap(r -> r.tenantId, Function.identity(), (a, b) -> a));
        Map<Long, BackupReport> latest = reports.latestPerTenant().stream()
                .collect(Collectors.toMap(r -> r.tenantId, Function.identity(), (a, b) -> a));
        Instant staleBefore = Instant.now().minus(Duration.ofHours(staleAfterHours));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Tenant t : tenants.findAllByOrderByNameAsc()) {
            if (t.status == TenantStatus.ARCHIVED) continue;
            BackupReport ok = success.get(t.id);
            BackupReport last = latest.get(t.id);
            Instant okAt = ok == null ? null : (ok.finishedAt != null ? ok.finishedAt : ok.reportedAt);
            String state;
            if (last != null && "FAILED".equals(last.status)) state = "FAILED";
            else if (okAt == null) state = "NEVER";
            else if (okAt.isBefore(staleBefore)) state = "STALE";
            else state = "OK";
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tenantId", t.id);
            m.put("tenantCode", t.code);
            m.put("tenantName", t.name);
            m.put("state", state);
            m.put("lastSuccessAt", okAt);
            m.put("lastSuccessSizeBytes", ok != null ? ok.sizeBytes : null);
            m.put("lastRunAt", last != null ? last.reportedAt : null);
            m.put("lastRunStatus", last != null ? last.status : null);
            m.put("lastRunMessage", last != null ? last.message : null);
            rows.add(m);
        }
        return rows;
    }

    static Map<String, Object> view(BackupReport r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.id);
        m.put("tenantId", r.tenantId);
        m.put("tenantCode", r.tenantCode);
        m.put("databaseName", r.databaseName);
        m.put("kind", r.kind);
        m.put("status", r.status);
        m.put("startedAt", r.startedAt);
        m.put("finishedAt", r.finishedAt);
        m.put("sizeBytes", r.sizeBytes);
        m.put("location", r.location);
        m.put("checksumSha256", r.checksumSha256);
        m.put("message", r.message);
        m.put("reportedAt", r.reportedAt);
        return m;
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
