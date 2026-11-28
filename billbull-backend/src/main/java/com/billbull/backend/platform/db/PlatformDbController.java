package com.billbull.backend.platform.db;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.platform.PlatformAgentAuthFilter;
import com.billbull.backend.platform.TenantIdentity;
import com.billbull.backend.security.AuditLogService;

/**
 * Database tools for the control plane, on the HMAC-signed platform agent path (so only
 * admin.billbull.app can call them — see {@code PlatformAgentAuthFilter}).
 *
 * <pre>
 *   GET  /api/platform/db/overview                 size, version, connections, cache, settings, capabilities
 *   GET  /api/platform/db/tables                   every table/view with sizes and statistics
 *   POST /api/platform/db/table                    {schema, name}: columns, indexes, constraints, triggers
 *   GET  /api/platform/db/insights                 optimisation findings
 *   GET  /api/platform/db/activity                 sessions and locks on this database
 *   POST /api/platform/db/activity/{pid}/cancel    {terminate}: cancel a query or end a session
 *   POST /api/platform/db/query                    run one statement (console switch; writes need their own)
 *   POST /api/platform/db/explain                  EXPLAIN [ANALYZE] in a read-only transaction
 *   GET  /api/platform/db/jobs                     maintenance jobs
 *   POST /api/platform/db/maintenance              {action, schema?, table?}: ANALYZE / VACUUM / REINDEX
 *   GET  /api/platform/db/backups                  on-demand backups
 *   POST /api/platform/db/backups                  {note}: start pg_dump
 *   GET  /api/platform/db/backups/{name}/download  the dump file
 *   POST /api/platform/db/backups/{name}/delete
 * </pre>
 * Everything that reads data, changes something or hands out a dump is written to this client's
 * own audit log (Settings → Audit), naming the BillBull staff member.
 */
@RestController
@RequestMapping("/api/platform/db")
@PreAuthorize("hasRole('PLATFORM_AGENT')")
public class PlatformDbController {

    private static final String ENTITY = "PlatformDatabase";

    private final PlatformDbConsoleService console;
    private final PlatformBackupService backups;
    private final AuditLogService audit;
    private final TenantIdentity tenant;

    public PlatformDbController(PlatformDbConsoleService console, PlatformBackupService backups, AuditLogService audit,
                                TenantIdentity tenant) {
        this.console = console;
        this.backups = backups;
        this.audit = audit;
        this.tenant = tenant;
    }

    @GetMapping("/overview")
    public Map<String, Object> overview() {
        return console.overview();
    }

    @GetMapping("/tables")
    public List<Map<String, Object>> tables() {
        return console.tables();
    }

    public record TableRef(String schema, String name) {}

    @PostMapping("/table")
    public Map<String, Object> table(@RequestBody TableRef ref) {
        return console.table(ref.schema() == null ? "public" : ref.schema(), ref.name());
    }

    @GetMapping("/insights")
    public Map<String, Object> insights() {
        return console.insights();
    }

    @GetMapping("/activity")
    public Map<String, Object> activity() {
        return console.activity();
    }

    public record CancelRequest(Boolean terminate, String reason) {}

    @PostMapping("/activity/{pid}/cancel")
    public Map<String, Object> cancel(@PathVariable int pid, @RequestBody(required = false) CancelRequest body,
                                      HttpServletRequest request) {
        boolean terminate = body != null && Boolean.TRUE.equals(body.terminate());
        Map<String, Object> out = console.cancel(pid, terminate);
        log(terminate ? "SESSION_TERMINATED" : "QUERY_CANCELLED", request,
                "pid " + pid + (body != null && body.reason() != null ? " — " + clip(body.reason(), 500) : ""));
        return out;
    }

    @PostMapping("/query")
    public Map<String, Object> query(@RequestBody PlatformDbConsoleService.QueryRequest body, HttpServletRequest request) {
        Map<String, Object> out = console.query(body);
        boolean write = "WRITE".equals(out.get("mode"));
        String action = !write ? "SQL_READ" : (Boolean.TRUE.equals(out.get("dryRun")) ? "SQL_WRITE_PREVIEW" : "SQL_WRITE");
        StringBuilder d = new StringBuilder();
        if (body.reason() != null && !body.reason().isBlank()) d.append("Reason: ").append(clip(body.reason(), 500)).append(" | ");
        d.append(Boolean.TRUE.equals(out.get("ok")) ? resultSummary(out) : "failed: " + errorText(out));
        d.append(" | ").append(clip(body.sql(), 3000));
        log(action, request, d.toString());
        return out;
    }

    @PostMapping("/explain")
    public Map<String, Object> explain(@RequestBody PlatformDbConsoleService.ExplainRequest body, HttpServletRequest request) {
        Map<String, Object> out = console.explain(body);
        if (Boolean.TRUE.equals(body.analyze())) log("SQL_EXPLAIN_ANALYZE", request, clip(body.sql(), 3000));
        return out;
    }

    @GetMapping("/jobs")
    public List<Map<String, Object>> jobs() {
        return console.jobs();
    }

    @PostMapping("/maintenance")
    public Map<String, Object> maintenance(@RequestBody PlatformDbConsoleService.MaintenanceRequest body,
                                           HttpServletRequest request) {
        Map<String, Object> job = console.startMaintenance(body, actor(request));
        log("MAINTENANCE_STARTED", request, String.valueOf(job.get("sql")));
        return job;
    }

    @GetMapping("/backups")
    public Map<String, Object> backups() {
        return backups.list();
    }

    public record BackupRequest(String note) {}

    @PostMapping("/backups")
    public Map<String, Object> startBackup(@RequestBody(required = false) BackupRequest body, HttpServletRequest request) {
        Map<String, Object> job = backups.start(actor(request), body == null ? null : body.note());
        log("BACKUP_STARTED", request, String.valueOf(job.get("name")));
        return job;
    }

    @GetMapping("/backups/{name}/download")
    public ResponseEntity<Resource> download(@PathVariable String name, HttpServletRequest request) throws Exception {
        Path file = backups.open(name);
        log("BACKUP_DOWNLOADED", request, name);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(Files.size(file))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name).build().toString())
                .body(new FileSystemResource(file));
    }

    @PostMapping("/backups/{name}/delete")
    public Map<String, Object> deleteBackup(@PathVariable String name, HttpServletRequest request) {
        Map<String, Object> out = backups.delete(name);
        log("BACKUP_DELETED", request, name);
        return out;
    }

    @ExceptionHandler(PlatformDbException.class)
    public ResponseEntity<Map<String, Object>> refused(PlatformDbException e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", e.code());
        m.put("message", e.getMessage());
        return ResponseEntity.status(e.status()).body(m);
    }

    private void log(String action, HttpServletRequest request, String detail) {
        try {
            audit.logDomainEvent(ENTITY, tenant.code(), action, "By " + actor(request) + " (admin.billbull.app): " + detail);
        } catch (RuntimeException ignored) {
            // auditing must never turn a finished operation into an error
        }
    }

    private static String resultSummary(Map<String, Object> out) {
        if (out.containsKey("updateCount")) return out.get("updateCount") + " row(s) affected" + (Boolean.TRUE.equals(out.get("dryRun")) ? ", rolled back" : "");
        return out.get("rowCount") + " row(s) returned" + (Boolean.TRUE.equals(out.get("truncated")) ? " (more not shown)" : "");
    }

    private static String errorText(Map<String, Object> out) {
        Object e = out.get("error");
        return e instanceof Map<?, ?> m ? String.valueOf(m.get("message")) : String.valueOf(e);
    }

    private static String actor(HttpServletRequest request) {
        Object a = request.getAttribute(PlatformAgentAuthFilter.ACTOR_ATTRIBUTE);
        return a != null ? a.toString() : "platform";
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
