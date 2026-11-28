package com.billbull.backend.platform.db;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The database tools behind {@code /api/platform/db/**}: catalogue views (overview, tables, one
 * table), optimisation insights, live sessions, maintenance jobs and the SQL console itself.
 *
 * <p>Catalogue reads use the application's pool (they're quick and return no rows of business
 * data). Console statements and maintenance run on their own short-lived connection
 * ({@link PlatformDbConnections}).
 */
@Service
public class PlatformDbConsoleService {

    private static final Logger log = LoggerFactory.getLogger(PlatformDbConsoleService.class);

    static final int MAX_CELL_CHARS = 4000;
    private static final Set<String> EXPLAINABLE = Set.of("select", "with", "values", "table", "insert", "update", "delete", "merge");
    private static final String USER_SCHEMAS = "n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'";

    private final JdbcTemplate jdbc;
    private final PlatformDbConnections connections;
    private final PlatformDbProperties props;
    private final ExecutorService maintenanceRunner = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "platform-db-maintenance");
        t.setDaemon(true);
        return t;
    });
    private final AtomicLong jobIds = new AtomicLong();
    private final LinkedHashMap<Long, Map<String, Object>> jobs = new LinkedHashMap<>();

    public PlatformDbConsoleService(JdbcTemplate jdbc, PlatformDbConnections connections, PlatformDbProperties props) {
        this.jdbc = jdbc;
        this.connections = connections;
        this.props = props;
    }

    @PreDestroy
    void stop() {
        maintenanceRunner.shutdownNow();
    }

    // ------------------------------------------------------------------------------------------
    // Overview, tables, one table
    // ------------------------------------------------------------------------------------------

    public Map<String, Object> overview() {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, String> errors = new LinkedHashMap<>();
        out.put("capabilities", props.capabilities());
        out.put("database", one("SELECT current_database() AS name, pg_database_size(current_database()) AS size_bytes,"
                + " current_setting('server_version') AS server_version, current_setting('server_version_num')::int AS server_version_num,"
                + " pg_postmaster_start_time() AS started_at, now() AS now, current_user AS login_role,"
                + " (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS login_is_superuser,"
                + " (SELECT age(datfrozenxid) FROM pg_database WHERE datname = current_database()) AS xid_age,"
                + " current_setting('TimeZone') AS timezone", "database", errors));
        out.put("connections", one("SELECT count(*) FILTER (WHERE datname = current_database()) AS this_database,"
                + " count(*) FILTER (WHERE datname = current_database() AND state = 'active') AS active,"
                + " count(*) FILTER (WHERE datname = current_database() AND state LIKE 'idle in transaction%') AS idle_in_transaction,"
                + " count(*) FILTER (WHERE backend_type = 'client backend') AS server_total,"
                + " current_setting('max_connections')::int AS max_connections FROM pg_stat_activity", "connections", errors));
        out.put("stats", one("SELECT xact_commit, xact_rollback, blks_read, blks_hit,"
                + " CASE WHEN blks_hit + blks_read = 0 THEN NULL ELSE round(blks_hit * 100.0 / (blks_hit + blks_read), 2) END AS cache_hit_pct,"
                + " tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted, conflicts, temp_files, temp_bytes, deadlocks, stats_reset"
                + " FROM pg_stat_database WHERE datname = current_database()", "stats", errors));
        out.put("objects", one("SELECT"
                + " count(*) FILTER (WHERE c.relkind IN ('r','p')) AS tables,"
                + " count(*) FILTER (WHERE c.relkind = 'v') AS views,"
                + " count(*) FILTER (WHERE c.relkind = 'm') AS materialized_views,"
                + " count(*) FILTER (WHERE c.relkind = 'i') AS indexes,"
                + " count(*) FILTER (WHERE c.relkind = 'S') AS sequences,"
                + " coalesce(sum(pg_relation_size(c.oid)) FILTER (WHERE c.relkind IN ('r','p','m')), 0) AS table_bytes,"
                + " coalesce(sum(pg_relation_size(c.oid)) FILTER (WHERE c.relkind = 'i'), 0) AS index_bytes"
                + " FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE " + USER_SCHEMAS, "objects", errors));
        out.put("largestTables", rows("SELECT n.nspname AS schema, c.relname AS name, pg_total_relation_size(c.oid) AS total_bytes,"
                + " c.reltuples::bigint AS est_rows FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace"
                + " WHERE c.relkind IN ('r','p','m') AND " + USER_SCHEMAS + " ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 8",
                "largestTables", errors));
        out.put("extensions", rows("SELECT extname AS name, extversion AS version FROM pg_extension ORDER BY extname", "extensions", errors));
        out.put("settings", rows("SELECT name, setting, unit, short_desc FROM pg_settings WHERE name IN ("
                + "'shared_buffers','work_mem','maintenance_work_mem','effective_cache_size','max_connections',"
                + "'random_page_cost','autovacuum','autovacuum_vacuum_scale_factor','autovacuum_analyze_scale_factor',"
                + "'checkpoint_timeout','max_wal_size','statement_timeout','idle_in_transaction_session_timeout',"
                + "'log_min_duration_statement','shared_preload_libraries','track_io_timing') ORDER BY name", "settings", errors));
        // version is text ("99" > "153"), so take the latest successful row by installed_rank
        out.put("flyway", one("SELECT (SELECT version FROM flyway_schema_history WHERE success AND version IS NOT NULL"
                + " ORDER BY installed_rank DESC LIMIT 1) AS version,"
                + " (SELECT count(*) FROM flyway_schema_history WHERE NOT success) AS failed,"
                + " (SELECT max(installed_on) FROM flyway_schema_history) AS last_installed_on", "flyway", errors));
        out.put("errors", errors);
        return out;
    }

    public List<Map<String, Object>> tables() {
        return mapRows(jdbc.queryForList("SELECT n.nspname AS schema, c.relname AS name,"
                + " CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' WHEN 'f' THEN 'foreign' END AS kind,"
                + " greatest(c.reltuples, 0)::bigint AS est_rows,"
                + " pg_total_relation_size(c.oid) AS total_bytes, pg_relation_size(c.oid) AS table_bytes,"
                + " CASE WHEN c.relkind IN ('r','p','m') THEN pg_indexes_size(c.oid) END AS index_bytes,"
                + " s.n_live_tup AS live_rows, s.n_dead_tup AS dead_rows, s.seq_scan, s.idx_scan,"
                + " s.n_tup_ins AS inserts, s.n_tup_upd AS updates, s.n_tup_del AS deletes,"
                + " greatest(s.last_vacuum, s.last_autovacuum) AS last_vacuum,"
                + " greatest(s.last_analyze, s.last_autoanalyze) AS last_analyze,"
                + " obj_description(c.oid, 'pg_class') AS comment"
                + " FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace"
                + " LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid"
                + " WHERE c.relkind IN ('r','p','v','m','f') AND " + USER_SCHEMAS
                + " ORDER BY pg_total_relation_size(c.oid) DESC, n.nspname, c.relname"));
    }

    public Map<String, Object> table(String schema, String name) {
        Long oid = relationOid(schema, name, "'r','p','v','m','f'");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("schema", schema);
        out.put("name", name);
        out.put("columns", mapRows(jdbc.queryForList("SELECT a.attnum AS position, a.attname AS name,"
                + " format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,"
                + " pg_get_expr(d.adbin, d.adrelid) AS default_value,"
                + " EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS primary_key,"
                + " col_description(a.attrelid, a.attnum) AS comment"
                + " FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum"
                + " WHERE a.attrelid = ? AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum", oid)));
        out.put("indexes", mapRows(jdbc.queryForList("SELECT ic.relname AS name, pg_get_indexdef(i.indexrelid) AS definition,"
                + " i.indisunique AS is_unique, i.indisprimary AS is_primary, i.indisvalid AS is_valid,"
                + " pg_relation_size(i.indexrelid) AS size_bytes, s.idx_scan AS scans"
                + " FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid"
                + " LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.indexrelid"
                + " WHERE i.indrelid = ? ORDER BY i.indisprimary DESC, ic.relname", oid)));
        out.put("constraints", mapRows(jdbc.queryForList("SELECT conname AS name,"
                + " CASE contype WHEN 'p' THEN 'primary key' WHEN 'f' THEN 'foreign key' WHEN 'u' THEN 'unique' WHEN 'c' THEN 'check' WHEN 'x' THEN 'exclusion' ELSE contype::text END AS type,"
                + " pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = ? ORDER BY contype, conname", oid)));
        out.put("triggers", mapRows(jdbc.queryForList("SELECT tgname AS name, pg_get_triggerdef(oid) AS definition, tgenabled <> 'D' AS enabled"
                + " FROM pg_trigger WHERE tgrelid = ? AND NOT tgisinternal ORDER BY tgname", oid)));
        out.put("referencedBy", mapRows(jdbc.queryForList("SELECT conrelid::regclass::text AS table_name, conname AS name"
                + " FROM pg_constraint WHERE confrelid = ? AND contype = 'f' ORDER BY 1, 2", oid)));
        return out;
    }

    // ------------------------------------------------------------------------------------------
    // Optimisation insights
    // ------------------------------------------------------------------------------------------

    public Map<String, Object> insights() {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, String> errors = new LinkedHashMap<>();
        out.put("statsReset", scalar("SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()", errors));
        out.put("cache", one("SELECT"
                + " (SELECT round(sum(heap_blks_hit) * 100.0 / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) FROM pg_statio_user_tables) AS table_hit_pct,"
                + " (SELECT round(sum(idx_blks_hit) * 100.0 / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) FROM pg_statio_user_indexes) AS index_hit_pct,"
                + " (SELECT age(datfrozenxid) FROM pg_database WHERE datname = current_database()) AS xid_age",
                "cache", errors));
        out.put("missingForeignKeyIndexes", rows("SELECT n.nspname AS schema, t.relname AS table_name, c.conname AS constraint_name,"
                + " (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, n)"
                + "   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS columns,"
                + " pg_relation_size(c.conrelid) AS table_bytes, greatest(t.reltuples, 0)::bigint AS est_rows"
                + " FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace"
                + " WHERE c.contype = 'f' AND " + USER_SCHEMAS
                + " AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid"
                + "   AND (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] @> c.conkey"
                + "   AND (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] <@ c.conkey)"
                + " ORDER BY pg_relation_size(c.conrelid) DESC LIMIT 60", "missingForeignKeyIndexes", errors));
        out.put("unusedIndexes", rows("SELECT s.schemaname AS schema, s.relname AS table_name, s.indexrelname AS index_name,"
                + " pg_relation_size(s.indexrelid) AS size_bytes, s.idx_scan AS scans"
                + " FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid"
                + " WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary"
                + " AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = s.indexrelid)"
                + " ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 60", "unusedIndexes", errors));
        out.put("duplicateIndexes", rows("SELECT n.nspname AS schema, t.relname AS table_name,"
                + " string_agg(ic.relname, ', ' ORDER BY ic.relname) AS index_names, sum(pg_relation_size(i.indexrelid)) AS size_bytes,"
                + " min(pg_get_indexdef(i.indexrelid)) AS definition"
                + " FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid"
                + " JOIN pg_namespace n ON n.oid = t.relnamespace WHERE " + USER_SCHEMAS
                + " GROUP BY n.nspname, t.relname, i.indrelid, i.indkey::text, i.indclass::text,"
                + " coalesce(pg_get_expr(i.indexprs, i.indrelid), ''), coalesce(pg_get_expr(i.indpred, i.indrelid), '')"
                + " HAVING count(*) > 1 ORDER BY sum(pg_relation_size(i.indexrelid)) DESC LIMIT 40", "duplicateIndexes", errors));
        out.put("invalidIndexes", rows("SELECT n.nspname AS schema, t.relname AS table_name, ic.relname AS index_name"
                + " FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid"
                + " JOIN pg_namespace n ON n.oid = t.relnamespace WHERE NOT i.indisvalid AND " + USER_SCHEMAS, "invalidIndexes", errors));
        out.put("vacuumNeeded", rows("SELECT schemaname AS schema, relname AS table_name, n_live_tup AS live_rows, n_dead_tup AS dead_rows,"
                + " round(n_dead_tup * 100.0 / nullif(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,"
                + " greatest(last_vacuum, last_autovacuum) AS last_vacuum, greatest(last_analyze, last_autoanalyze) AS last_analyze"
                + " FROM pg_stat_user_tables WHERE n_dead_tup > 1000 AND n_dead_tup > 0.1 * greatest(n_live_tup, 1)"
                + " ORDER BY n_dead_tup DESC LIMIT 40", "vacuumNeeded", errors));
        out.put("neverAnalyzed", rows("SELECT schemaname AS schema, relname AS table_name, n_live_tup AS live_rows, n_mod_since_analyze AS changed_since_analyze"
                + " FROM pg_stat_user_tables WHERE n_live_tup > 1000"
                + " AND (greatest(last_analyze, last_autoanalyze) IS NULL OR n_mod_since_analyze > 0.2 * n_live_tup)"
                + " ORDER BY n_mod_since_analyze DESC LIMIT 40", "neverAnalyzed", errors));
        out.put("sequentialScans", rows("SELECT schemaname AS schema, relname AS table_name, seq_scan, seq_tup_read, idx_scan, n_live_tup AS live_rows,"
                + " seq_tup_read / greatest(seq_scan, 1) AS rows_per_scan"
                + " FROM pg_stat_user_tables WHERE seq_scan > 50 AND n_live_tup > 5000"
                + " AND seq_tup_read / greatest(seq_scan, 1) > 2000 AND seq_scan > coalesce(idx_scan, 0)"
                + " ORDER BY seq_tup_read DESC LIMIT 30", "sequentialScans", errors));
        out.put("sequences", rows("SELECT schemaname AS schema, sequencename AS name, data_type::text AS data_type, last_value, max_value,"
                + " round(last_value * 100.0 / max_value, 2) AS used_pct FROM pg_sequences"
                + " WHERE last_value IS NOT NULL AND last_value * 1.0 / max_value > 0.5 ORDER BY 6 DESC LIMIT 20", "sequences", errors));
        out.put("slowQueries", slowQueries(errors));
        out.put("errors", errors);
        return out;
    }

    private Object slowQueries(Map<String, String> errors) {
        Integer installed = jdbc.queryForObject("SELECT count(*)::int FROM pg_extension WHERE extname = 'pg_stat_statements'", Integer.class);
        if (installed == null || installed == 0) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("available", false);
            m.put("hint", "Install pg_stat_statements (shared_preload_libraries + CREATE EXTENSION pg_stat_statements) to see the slowest queries.");
            return m;
        }
        String where = " WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())";
        List<Map<String, Object>> list = rows("SELECT left(query, 2000) AS query, calls, round(total_exec_time::numeric, 1) AS total_ms,"
                + " round(mean_exec_time::numeric, 2) AS mean_ms, rows FROM pg_stat_statements" + where
                + " ORDER BY total_exec_time DESC LIMIT 25", "slowQueries", errors);
        if (list.isEmpty() && errors.containsKey("slowQueries")) { // PostgreSQL 12 and older
            errors.remove("slowQueries");
            list = rows("SELECT left(query, 2000) AS query, calls, round(total_time::numeric, 1) AS total_ms,"
                    + " round(mean_time::numeric, 2) AS mean_ms, rows FROM pg_stat_statements" + where
                    + " ORDER BY total_time DESC LIMIT 25", "slowQueries", errors);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("available", true);
        m.put("queries", list);
        return m;
    }

    // ------------------------------------------------------------------------------------------
    // Sessions
    // ------------------------------------------------------------------------------------------

    public Map<String, Object> activity() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("queryTextVisible", props.consoleEnabled());
        out.put("sessions", mapRows(jdbc.queryForList("SELECT pid, usename AS user_name, application_name, client_addr::text AS client_addr,"
                + " backend_type, state, wait_event_type, wait_event, backend_start, xact_start, query_start, state_change,"
                + " round(extract(epoch FROM now() - query_start)::numeric, 1) AS query_seconds,"
                + " round(extract(epoch FROM now() - xact_start)::numeric, 1) AS xact_seconds,"
                + " array_to_string(pg_blocking_pids(pid), ',') AS blocked_by,"
                + (props.consoleEnabled() ? " left(query, 4000)" : " NULL::text") + " AS query"
                + " FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()"
                + " ORDER BY (state = 'active') DESC, query_start NULLS LAST")));
        out.put("locks", mapRows(jdbc.queryForList("SELECT l.pid, l.locktype, l.mode, l.granted, c.relname AS relation"
                + " FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation"
                + " WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())"
                + " AND l.pid <> pg_backend_pid() AND (NOT l.granted OR l.mode LIKE '%Exclusive%')"
                + " ORDER BY l.granted, l.pid LIMIT 200")));
        return out;
    }

    public Map<String, Object> cancel(int pid, boolean terminate) {
        Integer found = jdbc.queryForObject("SELECT count(*)::int FROM pg_stat_activity WHERE pid = ? AND datname = current_database()"
                + " AND pid <> pg_backend_pid()", Integer.class, pid);
        if (found == null || found == 0) {
            throw new PlatformDbException(404, "SESSION_NOT_FOUND", "No session " + pid + " on this client's database");
        }
        Boolean done = jdbc.queryForObject(terminate ? "SELECT pg_terminate_backend(?)" : "SELECT pg_cancel_backend(?)", Boolean.class, pid);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pid", pid);
        out.put("action", terminate ? "TERMINATE" : "CANCEL");
        out.put("signalled", Boolean.TRUE.equals(done));
        return out;
    }

    // ------------------------------------------------------------------------------------------
    // SQL console
    // ------------------------------------------------------------------------------------------

    public record QueryRequest(String sql, String mode, Integer maxRows, Integer timeoutSeconds, Boolean dryRun,
                               Boolean confirmDestructive, String reason) {}

    public record ExplainRequest(String sql, Boolean analyze, Integer timeoutSeconds) {}

    public Map<String, Object> query(QueryRequest req) {
        boolean write = "WRITE".equalsIgnoreCase(req.mode());
        if (!props.consoleEnabled()) throw PlatformDbException.disabled("DB_CONSOLE_DISABLED", "BILLBULL_PLATFORM_DB_CONSOLE_ENABLED");
        if (write && !props.writesEnabled()) {
            throw PlatformDbException.disabled("DB_WRITES_DISABLED", "BILLBULL_PLATFORM_DB_CONSOLE_ALLOW_WRITES");
        }
        SqlGuard.Verdict v = guard(req.sql(), write ? SqlGuard.Mode.WRITE : SqlGuard.Mode.READ);
        boolean dryRun = write && !Boolean.FALSE.equals(req.dryRun());
        if (write && v.destructive() && !Boolean.TRUE.equals(req.confirmDestructive())) {
            throw new PlatformDbException(409, "SQL_DESTRUCTIVE_UNCONFIRMED",
                    "This drops, truncates or changes every row of a table. Confirm it explicitly to run it.");
        }
        if (dryRun && v.needsAutocommit()) {
            throw new PlatformDbException(400, "SQL_NO_DRY_RUN",
                    v.firstKeyword().toUpperCase(Locale.ROOT) + " … can't run inside a transaction, so it can't be previewed. Turn preview off to run it.");
        }
        int maxRows = clamp(req.maxRows(), 1, props.maxRows(), 500);
        int timeout = clamp(req.timeoutSeconds(), 1, props.maxTimeoutSeconds(), 30);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", write ? "WRITE" : "READ");
        out.put("statement", v.firstKeyword().toUpperCase(Locale.ROOT));
        out.put("dryRun", dryRun);
        long t0 = System.nanoTime();
        try (Connection c = connections.open(PlatformDbConnections.APPLICATION_NAME)) {
            prepareSession(c, timeout);
            if (!v.needsAutocommit()) {
                c.setAutoCommit(false);
                if (!write) {
                    exec(c, "SET TRANSACTION READ ONLY");
                    if (!props.readRole().isEmpty()) exec(c, "SET LOCAL ROLE " + props.readRole());
                }
            }
            try (Statement st = c.createStatement()) {
                st.setMaxRows(maxRows + 1);
                st.setFetchSize(Math.min(maxRows + 1, 1000));
                boolean hasRows = st.execute(v.sql());
                if (hasRows) {
                    try (ResultSet rs = st.getResultSet()) {
                        readResult(rs, maxRows, out);
                    }
                } else {
                    out.put("updateCount", st.getUpdateCount());
                }
            }
            if (!v.needsAutocommit()) {
                if (!write || dryRun) c.rollback();
                else c.commit();
            }
            out.put("committed", write && !dryRun);
            out.put("ok", true);
        } catch (SQLException e) {
            out.put("ok", false);
            out.put("committed", false);
            out.put("error", sqlError(e));
        }
        out.put("durationMs", (System.nanoTime() - t0) / 1_000_000);
        return out;
    }

    public Map<String, Object> explain(ExplainRequest req) {
        if (!props.consoleEnabled()) throw PlatformDbException.disabled("DB_CONSOLE_DISABLED", "BILLBULL_PLATFORM_DB_CONSOLE_ENABLED");
        SqlGuard.Verdict v = guard(req.sql(), SqlGuard.Mode.WRITE);
        if (!EXPLAINABLE.contains(v.firstKeyword())) {
            throw new PlatformDbException(400, "SQL_NOT_EXPLAINABLE",
                    "EXPLAIN works on SELECT, WITH, VALUES, TABLE, INSERT, UPDATE, DELETE and MERGE");
        }
        boolean analyze = Boolean.TRUE.equals(req.analyze());
        int timeout = clamp(req.timeoutSeconds(), 1, props.maxTimeoutSeconds(), 30);
        String sql = (analyze ? "EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) " : "EXPLAIN (VERBOSE, FORMAT TEXT) ") + v.sql();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("analyze", analyze);
        long t0 = System.nanoTime();
        try (Connection c = connections.open(PlatformDbConnections.APPLICATION_NAME)) {
            prepareSession(c, timeout);
            c.setAutoCommit(false);
            // ANALYZE executes the statement: a read-only transaction makes PostgreSQL refuse any write.
            exec(c, "SET TRANSACTION READ ONLY");
            if (!props.readRole().isEmpty()) exec(c, "SET LOCAL ROLE " + props.readRole());
            StringBuilder plan = new StringBuilder();
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
                while (rs.next()) plan.append(rs.getString(1)).append('\n');
            }
            c.rollback();
            out.put("ok", true);
            out.put("plan", plan.toString());
        } catch (SQLException e) {
            out.put("ok", false);
            out.put("error", sqlError(e));
        }
        out.put("durationMs", (System.nanoTime() - t0) / 1_000_000);
        return out;
    }

    private static SqlGuard.Verdict guard(String sql, SqlGuard.Mode mode) {
        try {
            return SqlGuard.check(sql, mode);
        } catch (SqlGuard.Rejected e) {
            throw new PlatformDbException(400, e.code(), e.getMessage());
        }
    }

    private static void prepareSession(Connection c, int timeoutSeconds) throws SQLException {
        exec(c, "SET statement_timeout = '" + timeoutSeconds + "s'");
        exec(c, "SET lock_timeout = '5s'");
        exec(c, "SET idle_in_transaction_session_timeout = '60s'");
    }

    private static void exec(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }

    static void readResult(ResultSet rs, int maxRows, Map<String, Object> out) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int n = md.getColumnCount();
        List<Map<String, Object>> columns = new ArrayList<>(n);
        for (int i = 1; i <= n; i++) {
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("name", md.getColumnLabel(i));
            col.put("type", md.getColumnTypeName(i));
            columns.add(col);
        }
        List<List<Object>> rows = new ArrayList<>();
        boolean truncated = false;
        boolean cellsClipped = false;
        while (rs.next()) {
            if (rows.size() >= maxRows) {
                truncated = true;
                break;
            }
            List<Object> row = new ArrayList<>(n);
            for (int i = 1; i <= n; i++) {
                Object v = cell(rs, i, md.getColumnType(i));
                if (v instanceof String s && s.length() > MAX_CELL_CHARS) {
                    v = s.substring(0, MAX_CELL_CHARS) + "…";
                    cellsClipped = true;
                }
                row.add(v);
            }
            rows.add(row);
        }
        out.put("columns", columns);
        out.put("rows", rows);
        out.put("rowCount", rows.size());
        out.put("truncated", truncated);
        out.put("cellsClipped", cellsClipped);
    }

    private static final long JS_SAFE = 9_007_199_254_740_991L;

    static Object cell(ResultSet rs, int i, int sqlType) throws SQLException {
        switch (sqlType) {
            case Types.BOOLEAN, Types.BIT -> {
                boolean b = rs.getBoolean(i);
                return rs.wasNull() ? null : b;
            }
            case Types.SMALLINT, Types.INTEGER, Types.TINYINT -> {
                int v = rs.getInt(i);
                return rs.wasNull() ? null : v;
            }
            case Types.BIGINT -> {
                long v = rs.getLong(i);
                if (rs.wasNull()) return null;
                return Math.abs(v) <= JS_SAFE ? (Object) v : Long.toString(v);
            }
            case Types.REAL, Types.FLOAT, Types.DOUBLE -> {
                double v = rs.getDouble(i);
                if (rs.wasNull()) return null;
                return Double.isFinite(v) ? (Object) v : Double.toString(v);
            }
            case Types.NUMERIC, Types.DECIMAL -> {
                BigDecimal v = rs.getBigDecimal(i);
                return v == null ? null : v.toPlainString(); // exact: JS numbers would round money
            }
            case Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY -> {
                byte[] b = rs.getBytes(i);
                if (b == null) return null;
                byte[] head = b.length > 512 ? java.util.Arrays.copyOf(b, 512) : b;
                return "\\x" + HexFormat.of().formatHex(head) + (b.length > 512 ? "… (" + b.length + " bytes)" : "");
            }
            default -> {
                return rs.getString(i);
            }
        }
    }

    private static final java.util.regex.Pattern PG_PART =
            java.util.regex.Pattern.compile("\\n\\s+(Detail|Hint|Position|Where): ([^\\n]*)");

    /**
     * The PostgreSQL driver (runtime scope only) formats server errors as
     * {@code "ERROR: msg\n  Detail: …\n  Hint: …\n  Position: 12"}; split that back into parts.
     */
    static Map<String, Object> sqlError(SQLException e) {
        Map<String, Object> m = new LinkedHashMap<>();
        String raw = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        int nl = raw.indexOf('\n');
        String head = nl >= 0 ? raw.substring(0, nl) : raw;
        m.put("message", head.startsWith("ERROR: ") ? head.substring(7) : head);
        m.put("sqlState", e.getSQLState());
        java.util.regex.Matcher pm = PG_PART.matcher(raw);
        while (pm.find()) {
            String key = pm.group(1).toLowerCase(Locale.ROOT);
            String val = pm.group(2).trim();
            if (key.equals("position")) {
                try {
                    m.put("position", Integer.parseInt(val));
                } catch (NumberFormatException ignored) {
                    // leave it out
                }
            } else {
                m.put(key, val);
            }
        }
        return m;
    }

    // ------------------------------------------------------------------------------------------
    // Maintenance jobs
    // ------------------------------------------------------------------------------------------

    public enum MaintenanceAction { ANALYZE, VACUUM, VACUUM_ANALYZE, REINDEX }

    public record MaintenanceRequest(String action, String schema, String table) {}

    public Map<String, Object> startMaintenance(MaintenanceRequest req, String actor) {
        MaintenanceAction action;
        try {
            action = MaintenanceAction.valueOf(req.action() == null ? "" : req.action().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new PlatformDbException(400, "MAINTENANCE_UNKNOWN", "Action must be ANALYZE, VACUUM, VACUUM_ANALYZE or REINDEX");
        }
        String target = null;
        if (req.table() != null && !req.table().isBlank()) {
            String schema = req.schema() == null || req.schema().isBlank() ? "public" : req.schema().trim();
            relationOid(schema, req.table().trim(), "'r','p','m'");
            target = jdbc.queryForObject("SELECT format('%I.%I', ?::text, ?::text)", String.class, schema, req.table().trim());
        } else if (action == MaintenanceAction.REINDEX) {
            throw new PlatformDbException(400, "MAINTENANCE_TABLE_REQUIRED", "Pick a table to reindex");
        }
        Integer versionNum = jdbc.queryForObject("SELECT current_setting('server_version_num')::int", Integer.class);
        String sql = switch (action) {
            case ANALYZE -> "ANALYZE" + (target != null ? " " + target : "");
            case VACUUM -> "VACUUM" + (target != null ? " " + target : "");
            case VACUUM_ANALYZE -> "VACUUM (ANALYZE)" + (target != null ? " " + target : "");
            case REINDEX -> "REINDEX TABLE " + (versionNum != null && versionNum >= 120000 ? "CONCURRENTLY " : "") + target;
        };

        Map<String, Object> job = new LinkedHashMap<>();
        long id;
        synchronized (jobs) {
            boolean busy = jobs.values().stream().anyMatch(j -> "RUNNING".equals(j.get("status")) || "QUEUED".equals(j.get("status")));
            if (busy) throw new PlatformDbException(409, "MAINTENANCE_BUSY", "Another maintenance job is still running. Wait for it to finish.");
            id = jobIds.incrementAndGet();
            job.put("id", id);
            job.put("action", action.name());
            job.put("target", target != null ? target : "(whole database)");
            job.put("sql", sql);
            job.put("status", "QUEUED");
            job.put("requestedBy", actor);
            job.put("requestedAt", Instant.now().toString());
            jobs.put(id, job);
            while (jobs.size() > 30) jobs.remove(jobs.keySet().iterator().next());
        }
        int maxSeconds = props.maintenanceMaxMinutes() * 60;
        maintenanceRunner.submit(() -> runMaintenance(job, sql, maxSeconds));
        return copy(job);
    }

    private void runMaintenance(Map<String, Object> job, String sql, int maxSeconds) {
        long t0 = System.nanoTime();
        synchronized (jobs) {
            job.put("status", "RUNNING");
            job.put("startedAt", Instant.now().toString());
        }
        String status;
        String message;
        try (Connection c = connections.open("billbull-platform-maintenance")) {
            exec(c, "SET statement_timeout = '" + maxSeconds + "s'");
            c.setAutoCommit(true); // VACUUM and REINDEX CONCURRENTLY refuse to run in a transaction
            exec(c, sql);
            status = "SUCCESS";
            message = "Done";
        } catch (SQLException e) {
            status = "FAILED";
            message = String.valueOf(sqlError(e).get("message"));
            log.warn("Platform maintenance '{}' failed: {}", sql, message);
        } catch (RuntimeException e) {
            status = "FAILED";
            message = e.getClass().getSimpleName() + ": " + e.getMessage();
        }
        synchronized (jobs) {
            job.put("status", status);
            job.put("message", message);
            job.put("finishedAt", Instant.now().toString());
            job.put("durationMs", (System.nanoTime() - t0) / 1_000_000);
        }
    }

    public List<Map<String, Object>> jobs() {
        synchronized (jobs) {
            List<Map<String, Object>> list = new ArrayList<>();
            jobs.values().forEach(j -> list.add(copy(j)));
            java.util.Collections.reverse(list);
            return list;
        }
    }

    // ------------------------------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------------------------------

    private Long relationOid(String schema, String name, String kinds) {
        if (schema == null || name == null || schema.isBlank() || name.isBlank()) {
            throw new PlatformDbException(400, "TABLE_REQUIRED", "Give a schema and a table name");
        }
        List<Long> oids = jdbc.queryForList("SELECT c.oid::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace"
                + " WHERE n.nspname = ? AND c.relname = ? AND c.relkind IN (" + kinds + ")", Long.class, schema, name);
        if (oids.isEmpty()) throw new PlatformDbException(404, "TABLE_NOT_FOUND", "No table " + schema + "." + name);
        return oids.get(0);
    }

    private Map<String, Object> one(String sql, String key, Map<String, String> errors) {
        List<Map<String, Object>> list = rows(sql, key, errors);
        return list.isEmpty() ? null : list.get(0);
    }

    private List<Map<String, Object>> rows(String sql, String key, Map<String, String> errors) {
        try {
            return mapRows(jdbc.queryForList(sql));
        } catch (DataAccessException e) {
            errors.put(key, rootMessage(e));
            return List.of();
        }
    }

    private Object scalar(String sql, Map<String, String> errors) {
        try {
            List<Map<String, Object>> list = mapRows(jdbc.queryForList(sql));
            return list.isEmpty() ? null : list.get(0).values().iterator().next();
        } catch (DataAccessException e) {
            errors.put("scalar", rootMessage(e));
            return null;
        }
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) t = t.getCause();
        String m = t.getMessage();
        return m == null ? t.getClass().getSimpleName() : (m.length() > 300 ? m.substring(0, 300) : m);
    }

    /** JSON-safe values: timestamps as ISO strings, arrays and PG objects as text. */
    static List<Map<String, Object>> mapRows(List<Map<String, Object>> raw) {
        List<Map<String, Object>> out = new ArrayList<>(raw.size());
        for (Map<String, Object> r : raw) {
            Map<String, Object> m = new LinkedHashMap<>();
            r.forEach((k, v) -> m.put(k, jsonValue(v)));
            out.add(m);
        }
        return out;
    }

    static Object jsonValue(Object v) {
        if (v == null || v instanceof String || v instanceof Boolean || v instanceof Integer || v instanceof Short) return v;
        if (v instanceof Long l) return Math.abs(l) <= JS_SAFE ? l : l.toString();
        if (v instanceof BigDecimal b) return b.abs().compareTo(BigDecimal.valueOf(JS_SAFE)) <= 0 ? b : b.toPlainString();
        if (v instanceof Number) return v;
        if (v instanceof Timestamp t) return t.toInstant().toString();
        if (v instanceof java.time.OffsetDateTime o) return o.toInstant().toString();
        if (v instanceof Array a) {
            try {
                return String.valueOf(a.getArray() instanceof Object[] arr ? java.util.Arrays.toString(arr) : a.toString());
            } catch (SQLException e) {
                return a.toString();
            }
        }
        return v.toString();
    }

    private static Map<String, Object> copy(Map<String, Object> m) {
        return new LinkedHashMap<>(m);
    }

    private static int clamp(Integer v, int min, int max, int dflt) {
        int x = v == null ? dflt : v;
        return Math.max(min, Math.min(max, x));
    }
}
