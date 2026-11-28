package com.billbull.backend.platform.db;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * What the control plane's database tools may do on this client. Everything here sits behind the
 * platform agent ({@code BILLBULL_PLATFORM_AGENT_ENABLED=true} + HMAC), and the parts that reveal or
 * change business data need the client's server to opt in, the same way support access does:
 *
 * <pre>
 *   BILLBULL_PLATFORM_DB_CONSOLE_ENABLED=true        run read-only SQL, EXPLAIN, see session query text
 *   BILLBULL_PLATFORM_DB_CONSOLE_ALLOW_WRITES=true   also INSERT/UPDATE/DELETE/DDL (platform OWNER + authenticator code)
 *   BILLBULL_PLATFORM_BACKUPS_ENABLED=true           pg_dump on demand, downloadable by a platform OWNER
 * </pre>
 * Without them the platform still sees sizes, table statistics, optimisation insights and can run
 * VACUUM/ANALYZE/REINDEX — catalogue data only, no rows.
 */
@Component
public class PlatformDbProperties {

    private final boolean consoleEnabled;
    private final boolean writesEnabled;
    private final String readRole;
    private final int maxRows;
    private final int maxTimeoutSeconds;
    private final int maintenanceMaxMinutes;
    private final boolean backupsEnabled;
    private final String backupDir;
    private final String pgDump;
    private final String pgRestore;
    private final int backupKeep;
    private final int backupMaxMinutes;

    public PlatformDbProperties(
            @Value("${billbull.platform.db-console.enabled:false}") boolean consoleEnabled,
            @Value("${billbull.platform.db-console.allow-writes:false}") boolean writesEnabled,
            @Value("${billbull.platform.db-console.read-role:}") String readRole,
            @Value("${billbull.platform.db-console.max-rows:5000}") int maxRows,
            @Value("${billbull.platform.db-console.max-timeout-seconds:120}") int maxTimeoutSeconds,
            @Value("${billbull.platform.db-console.maintenance-max-minutes:60}") int maintenanceMaxMinutes,
            @Value("${billbull.platform.backups.enabled:false}") boolean backupsEnabled,
            @Value("${billbull.platform.backups.dir:backups/platform}") String backupDir,
            @Value("${billbull.platform.backups.pg-dump:pg_dump}") String pgDump,
            @Value("${billbull.platform.backups.pg-restore:pg_restore}") String pgRestore,
            @Value("${billbull.platform.backups.keep:7}") int backupKeep,
            @Value("${billbull.platform.backups.max-minutes:120}") int backupMaxMinutes) {
        this.consoleEnabled = consoleEnabled;
        this.writesEnabled = consoleEnabled && writesEnabled;
        String role = readRole == null ? "" : readRole.trim();
        if (!role.isEmpty() && !role.matches("[a-z_][a-z0-9_]{0,62}")) {
            throw new IllegalStateException("billbull.platform.db-console.read-role must be a plain lower-case role name");
        }
        this.readRole = role;
        this.maxRows = Math.max(10, Math.min(50_000, maxRows));
        this.maxTimeoutSeconds = Math.max(5, Math.min(600, maxTimeoutSeconds));
        this.maintenanceMaxMinutes = Math.max(1, Math.min(24 * 60, maintenanceMaxMinutes));
        this.backupsEnabled = backupsEnabled;
        this.backupDir = backupDir == null || backupDir.isBlank() ? "backups/platform" : backupDir.trim();
        this.pgDump = pgDump == null || pgDump.isBlank() ? "pg_dump" : pgDump.trim();
        this.pgRestore = pgRestore == null || pgRestore.isBlank() ? "pg_restore" : pgRestore.trim();
        this.backupKeep = Math.max(1, Math.min(100, backupKeep));
        this.backupMaxMinutes = Math.max(5, Math.min(24 * 60, backupMaxMinutes));
    }

    public boolean consoleEnabled() { return consoleEnabled; }
    public boolean writesEnabled() { return writesEnabled; }
    public String readRole() { return readRole; }
    public int maxRows() { return maxRows; }
    public int maxTimeoutSeconds() { return maxTimeoutSeconds; }
    public int maintenanceMaxMinutes() { return maintenanceMaxMinutes; }
    public boolean backupsEnabled() { return backupsEnabled; }
    public String backupDir() { return backupDir; }
    public String pgDump() { return pgDump; }
    public String pgRestore() { return pgRestore; }
    public int backupKeep() { return backupKeep; }
    public int backupMaxMinutes() { return backupMaxMinutes; }

    /** What the platform UI shows as switched on or off for this client. */
    public Map<String, Object> capabilities() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("console", consoleEnabled);
        m.put("writes", writesEnabled);
        m.put("backups", backupsEnabled);
        m.put("readRole", readRole.isEmpty() ? null : readRole);
        m.put("maxRows", maxRows);
        m.put("maxTimeoutSeconds", maxTimeoutSeconds);
        m.put("backupKeep", backupKeep);
        return m;
    }
}
