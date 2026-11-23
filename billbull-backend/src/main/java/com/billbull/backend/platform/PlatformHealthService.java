package com.billbull.backend.platform;

import java.io.File;
import java.io.InputStream;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationInfoService;
import org.flywaydb.core.api.MigrationState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.billbull.backend.BillbullBackendApplication;

/**
 * Read-only health and usage snapshot for the control plane ({@code GET /api/platform/health}).
 *
 * <p>Every metric is gathered on its own and a failure is reported as {@code null} plus an entry in
 * {@code errors}, so a tenant whose schema has drifted still answers. Nothing here returns
 * business records — only counts and timestamps.
 */
@Service
public class PlatformHealthService {

    private static final Logger log = LoggerFactory.getLogger(PlatformHealthService.class);
    private static final Instant STARTED_AT = Instant.now();

    private final JdbcTemplate jdbc;
    private final ObjectProvider<Flyway> flyway;
    private final TenantIdentity tenant;
    private final PlatformStateService stateService;

    private volatile Map<String, Object> buildCache;

    public PlatformHealthService(JdbcTemplate jdbc, ObjectProvider<Flyway> flyway, TenantIdentity tenant,
                                 PlatformStateService stateService) {
        this.jdbc = jdbc;
        this.flyway = flyway;
        this.tenant = tenant;
        this.stateService = stateService;
    }

    public Map<String, Object> snapshot() {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, String> errors = new LinkedHashMap<>();
        out.put("tenantCode", tenant.code());
        out.put("checkedAt", Instant.now().toString());
        out.put("startedAt", STARTED_AT.toString());
        out.put("uptimeSeconds", Instant.now().getEpochSecond() - STARTED_AT.getEpochSecond());
        out.put("build", build());
        out.put("jvm", jvm());

        Map<String, Object> db = new LinkedHashMap<>();
        long t0 = System.nanoTime();
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            db.put("ok", true);
            db.put("latencyMs", (System.nanoTime() - t0) / 1_000_000);
            db.put("name", jdbc.queryForObject("SELECT current_database()", String.class));
            db.put("sizeBytes", jdbc.queryForObject("SELECT pg_database_size(current_database())", Long.class));
            db.put("serverVersion", jdbc.queryForObject("SHOW server_version", String.class));
        } catch (RuntimeException e) {
            db.put("ok", false);
            errors.put("database", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        out.put("database", db);
        out.put("flyway", flywayInfo(errors));

        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("activeUsers", count("SELECT count(*) FROM users WHERE is_active = true", "activeUsers", errors));
        usage.put("branches", count("SELECT count(*) FROM branches", "branches", errors));
        usage.put("terminals", count("SELECT count(*) FROM pos_terminals WHERE status NOT IN ('DECOMMISSIONED')", "terminals", errors));
        usage.put("openPosSessions", count("SELECT count(*) FROM pos_sessions WHERE status = 'OPEN'", "openPosSessions", errors));
        usage.put("salesInvoices30d", count("SELECT count(*) FROM sales_invoices WHERE created_at >= now() - interval '30 days'",
                "salesInvoices30d", errors));
        usage.put("lastSalesInvoiceAt", scalar("SELECT max(created_at)::text FROM sales_invoices", "lastSalesInvoiceAt", errors));
        usage.put("lastAuditAt", scalar("SELECT max(created_at)::text FROM audit_logs", "lastAuditAt", errors));
        out.put("usage", usage);

        PlatformState state = stateService.current();
        Map<String, Object> st = new LinkedHashMap<>();
        st.put("managed", state.managed());
        st.put("status", state.status().name());
        st.put("planCode", state.planCode());
        st.put("configVersion", state.configVersion());
        out.put("state", st);

        boolean dbOk = Boolean.TRUE.equals(db.get("ok"));
        Object failed = ((Map<?, ?>) out.get("flyway")).get("failedCount");
        boolean flywayOk = !(failed instanceof Number n) || n.intValue() == 0;
        out.put("status", !dbOk ? "DOWN" : (flywayOk && errors.isEmpty() ? "UP" : "DEGRADED"));
        out.put("errors", errors);
        return out;
    }

    private Map<String, Object> flywayInfo(Map<String, String> errors) {
        Map<String, Object> f = new LinkedHashMap<>();
        Flyway fw = flyway.getIfAvailable();
        if (fw == null) {
            f.put("enabled", false);
            return f;
        }
        f.put("enabled", true);
        try {
            MigrationInfoService info = fw.info();
            MigrationInfo current = info.current();
            f.put("currentVersion", current != null && current.getVersion() != null ? current.getVersion().getVersion() : null);
            f.put("pendingCount", info.pending().length);
            int failed = 0;
            for (MigrationInfo m : info.all()) {
                if (m.getState() == MigrationState.FAILED) failed++;
            }
            f.put("failedCount", failed);
        } catch (RuntimeException e) {
            errors.put("flyway", e.getMessage());
        }
        return f;
    }

    private Long count(String sql, String key, Map<String, String> errors) {
        try {
            return jdbc.queryForObject(sql, Long.class);
        } catch (RuntimeException e) {
            errors.put(key, e.getClass().getSimpleName());
            return null;
        }
    }

    private String scalar(String sql, String key, Map<String, String> errors) {
        try {
            return jdbc.queryForObject(sql, String.class);
        } catch (RuntimeException e) {
            errors.put(key, e.getClass().getSimpleName());
            return null;
        }
    }

    private Map<String, Object> jvm() {
        Map<String, Object> j = new LinkedHashMap<>();
        MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        j.put("javaVersion", System.getProperty("java.version"));
        j.put("heapUsedBytes", heap.getUsed());
        j.put("heapMaxBytes", heap.getMax());
        j.put("availableProcessors", Runtime.getRuntime().availableProcessors());
        try {
            File uploads = new File("uploads");
            File root = uploads.exists() ? uploads : new File(".");
            j.put("diskFreeBytes", root.getUsableSpace());
            j.put("diskTotalBytes", root.getTotalSpace());
        } catch (SecurityException ignored) {
            // leave disk figures out
        }
        return j;
    }

    /** Which build this JVM runs: version, jar time and a SHA-256 of the jar, computed once. */
    private Map<String, Object> build() {
        Map<String, Object> cached = buildCache;
        if (cached != null) return cached;
        Map<String, Object> b = new LinkedHashMap<>();
        String version = BillbullBackendApplication.class.getPackage().getImplementationVersion();
        b.put("version", version != null ? version : "dev");
        try {
            var source = BillbullBackendApplication.class.getProtectionDomain().getCodeSource();
            String location = source != null ? source.getLocation().toString() : null;
            File jar = jarFile(location);
            if (jar != null && jar.isFile()) {
                b.put("artifactTime", Instant.ofEpochMilli(jar.lastModified()).toString());
                b.put("artifactSha256", sha256(jar));
            }
        } catch (Exception e) {
            log.debug("Build fingerprint unavailable: {}", e.getMessage());
        }
        buildCache = b;
        return b;
    }

    /** Spring Boot reports {@code jar:nested:/path/app.jar/!BOOT-INF/classes/!/}; take the outer jar. */
    static File jarFile(String location) {
        if (location == null) return null;
        String s = location;
        for (String prefix : new String[] {"jar:", "nested:", "file:"}) {
            if (s.startsWith(prefix)) s = s.substring(prefix.length());
        }
        int bang = s.indexOf(".jar");
        if (bang < 0) return null;
        s = s.substring(0, bang + 4);
        if (s.matches("^/[A-Za-z]:/.*")) s = s.substring(1);
        return new File(java.net.URLDecoder.decode(s, java.nio.charset.StandardCharsets.UTF_8));
    }

    private static String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(file.toPath())) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        return HexFormat.of().formatHex(md.digest());
    }
}
