package com.billbull.platform.db;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.agent.TenantAgentClient;
import com.billbull.platform.audit.AuditService;
import com.billbull.platform.auth.AuthService;
import com.billbull.platform.auth.CurrentUser;
import com.billbull.platform.auth.PlatformPrincipal;
import com.billbull.platform.auth.PlatformRole;
import com.billbull.platform.backup.BackupReport;
import com.billbull.platform.backup.BackupReportRepository;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantService;
import com.billbull.platform.tenant.TenantStatus;
import com.billbull.platform.web.ClientIp;
import com.fasterxml.jackson.databind.JsonNode;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * Database console for one client. The control plane still never connects to a tenant database:
 * every call goes to that client's HMAC-signed agent ({@code /api/platform/db/**}), which runs it
 * against its own database and writes its own audit entry. This side adds role checks, a TOTP
 * step-up for writes and dump downloads, and the platform's hash-chained audit.
 *
 * <pre>
 *   GET  /api/tenants/{id}/db/overview                 VIEWER
 *   GET  /api/tenants/{id}/db/tables                   VIEWER
 *   POST /api/tenants/{id}/db/table                    VIEWER   {schema, name}
 *   GET  /api/tenants/{id}/db/insights                 VIEWER
 *   GET  /api/tenants/{id}/db/jobs                     VIEWER
 *   GET  /api/tenants/{id}/db/backups                  VIEWER   (also files finished dumps under Backups)
 *   GET  /api/tenants/{id}/db/activity                 OPERATOR (session query text)
 *   POST /api/tenants/{id}/db/activity/{pid}/cancel    OPERATOR {terminate, reason}
 *   POST /api/tenants/{id}/db/query                    OPERATOR read; OWNER + authenticator code + reason to write
 *   POST /api/tenants/{id}/db/explain                  OPERATOR
 *   POST /api/tenants/{id}/db/maintenance              OPERATOR {action, schema?, table?}
 *   POST /api/tenants/{id}/db/backups                  OPERATOR {note}
 *   POST /api/tenants/{id}/db/backups/{name}/download  OWNER + authenticator code → single-use link
 *   POST /api/tenants/{id}/db/backups/{name}/delete    OWNER
 *   GET  /api/db-downloads/{ticket}                    the ticket itself (2 minutes, once)
 * </pre>
 */
@RestController
@RequestMapping("/api")
public class DatabaseController {

    private static final String AGENT = "/api/platform/db";
    private static final Pattern BACKUP_NAME = Pattern.compile("^[a-z0-9][a-z0-9_-]{0,39}-\\d{8}T\\d{6}Z\\.dump$");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final TenantService tenants;
    private final TenantAgentClient agent;
    private final AuditService audit;
    private final AuthService auth;
    private final BackupReportRepository backupReports;

    record Ticket(long tenantId, String name, PlatformPrincipal who, String ip) {}

    private final Cache<String, Ticket> tickets = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(2)).maximumSize(1_000).build();

    public DatabaseController(TenantService tenants, TenantAgentClient agent, AuditService audit, AuthService auth,
                              BackupReportRepository backupReports) {
        this.tenants = tenants;
        this.agent = agent;
        this.audit = audit;
        this.auth = auth;
        this.backupReports = backupReports;
    }

    // ---------------------------------------------------------------- catalogue (VIEWER)

    @GetMapping("/tenants/{id}/db/overview")
    @PreAuthorize("hasRole('VIEWER')")
    public JsonNode overview(@PathVariable long id) {
        return relay(agent.get(open(id), AGENT + "/overview", email()));
    }

    @GetMapping("/tenants/{id}/db/tables")
    @PreAuthorize("hasRole('VIEWER')")
    public JsonNode tables(@PathVariable long id) {
        return relay(agent.call(open(id), "GET", AGENT + "/tables", null, email(), Duration.ofSeconds(30)));
    }

    public record TableRef(String schema, String name) {}

    @PostMapping("/tenants/{id}/db/table")
    @PreAuthorize("hasRole('VIEWER')")
    public JsonNode table(@PathVariable long id, @RequestBody TableRef ref) {
        return relay(agent.post(open(id), AGENT + "/table", ref, email()));
    }

    @GetMapping("/tenants/{id}/db/insights")
    @PreAuthorize("hasRole('VIEWER')")
    public JsonNode insights(@PathVariable long id) {
        return relay(agent.call(open(id), "GET", AGENT + "/insights", null, email(), Duration.ofSeconds(60)));
    }

    @GetMapping("/tenants/{id}/db/jobs")
    @PreAuthorize("hasRole('VIEWER')")
    public JsonNode jobs(@PathVariable long id) {
        return relay(agent.get(open(id), AGENT + "/jobs", email()));
    }

    // ---------------------------------------------------------------- sessions (OPERATOR)

    @GetMapping("/tenants/{id}/db/activity")
    @PreAuthorize("hasRole('OPERATOR')")
    public JsonNode activity(@PathVariable long id) {
        return relay(agent.get(open(id), AGENT + "/activity", email()));
    }

    public record CancelInput(Boolean terminate, String reason) {}

    @PostMapping("/tenants/{id}/db/activity/{pid}/cancel")
    @PreAuthorize("hasRole('OPERATOR')")
    public JsonNode cancel(@PathVariable long id, @PathVariable int pid, @RequestBody(required = false) CancelInput in,
                           HttpServletRequest request) {
        Tenant t = open(id);
        boolean terminate = in != null && Boolean.TRUE.equals(in.terminate());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("terminate", terminate);
        body.put("reason", in == null ? null : in.reason());
        AgentResponse r = agent.post(t, AGENT + "/activity/" + pid + "/cancel", body, email());
        audit.record(CurrentUser.get(), terminate ? "DB_SESSION_TERMINATED" : "DB_QUERY_CANCELLED", "Tenant", String.valueOf(id), id,
                "pid " + pid + " — " + r.describe() + (in != null && in.reason() != null ? " — " + clip(in.reason(), 500) : ""),
                ClientIp.of(request));
        return relay(r);
    }

    // ---------------------------------------------------------------- console

    public record QueryInput(String sql, String mode, Integer maxRows, Integer timeoutSeconds, Boolean dryRun,
                             Boolean confirmDestructive, String reason, String code) {}

    @PostMapping("/tenants/{id}/db/query")
    @PreAuthorize("hasRole('OPERATOR')")
    public JsonNode query(@PathVariable long id, @RequestBody QueryInput in, HttpServletRequest request) {
        PlatformPrincipal who = CurrentUser.get();
        Tenant t = open(id);
        String ip = ClientIp.of(request);
        boolean write = "WRITE".equalsIgnoreCase(in.mode());
        boolean dryRun = write && !Boolean.FALSE.equals(in.dryRun());
        String reason = in.reason() == null ? "" : in.reason().trim();
        if (write) {
            if (who.role() != PlatformRole.OWNER) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an OWNER can change a client's database.");
            }
            if (reason.length() < 10) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "REASON_REQUIRED: Say why (10+ characters) before changing data.");
            }
            if (!dryRun) auth.requireStepUp(who, in.code(), "change " + t.code + "'s database", ip);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sql", in.sql());
        body.put("mode", write ? "WRITE" : "READ");
        body.put("maxRows", in.maxRows());
        body.put("timeoutSeconds", in.timeoutSeconds());
        body.put("dryRun", dryRun);
        body.put("confirmDestructive", Boolean.TRUE.equals(in.confirmDestructive()));
        body.put("reason", reason.isEmpty() ? null : reason);
        AgentResponse r = agent.call(t, "POST", AGENT + "/query", body, who.email(), waitFor(in.timeoutSeconds()));

        String action = !write ? "DB_QUERY" : (dryRun ? "DB_WRITE_PREVIEW" : "DB_WRITE");
        audit.record(who, action, "Tenant", String.valueOf(id), id,
                outcome(r) + (reason.isEmpty() ? "" : " | reason: " + clip(reason, 500)) + " | " + clip(in.sql(), 4000), ip);
        return relay(r);
    }

    public record ExplainInput(String sql, Boolean analyze, Integer timeoutSeconds) {}

    @PostMapping("/tenants/{id}/db/explain")
    @PreAuthorize("hasRole('OPERATOR')")
    public JsonNode explain(@PathVariable long id, @RequestBody ExplainInput in, HttpServletRequest request) {
        Tenant t = open(id);
        AgentResponse r = agent.call(t, "POST", AGENT + "/explain", in, email(), waitFor(in.timeoutSeconds()));
        if (Boolean.TRUE.equals(in.analyze())) {
            audit.record(CurrentUser.get(), "DB_EXPLAIN_ANALYZE", "Tenant", String.valueOf(id), id,
                    r.describe() + " | " + clip(in.sql(), 4000), ClientIp.of(request));
        }
        return relay(r);
    }

    // ---------------------------------------------------------------- maintenance

    public record MaintenanceInput(String action, String schema, String table) {}

    @PostMapping("/tenants/{id}/db/maintenance")
    @PreAuthorize("hasRole('OPERATOR')")
    public JsonNode maintenance(@PathVariable long id, @RequestBody MaintenanceInput in, HttpServletRequest request) {
        Tenant t = open(id);
        AgentResponse r = agent.post(t, AGENT + "/maintenance", in, email());
        audit.record(CurrentUser.get(), "DB_MAINTENANCE", "Tenant", String.valueOf(id), id,
                in.action() + " " + (in.table() == null ? "(whole database)" : in.schema() + "." + in.table()) + " — " + r.describe(),
                ClientIp.of(request));
        return relay(r);
    }

    // ---------------------------------------------------------------- backups

    @GetMapping("/tenants/{id}/db/backups")
    @PreAuthorize("hasRole('VIEWER')")
    public JsonNode backups(@PathVariable long id) {
        Tenant t = open(id);
        JsonNode body = relay(agent.get(t, AGENT + "/backups", email()));
        recordFinished(t, body);
        return body;
    }

    public record BackupInput(String note) {}

    @PostMapping("/tenants/{id}/db/backups")
    @PreAuthorize("hasRole('OPERATOR')")
    public JsonNode startBackup(@PathVariable long id, @RequestBody(required = false) BackupInput in, HttpServletRequest request) {
        Tenant t = open(id);
        AgentResponse r = agent.post(t, AGENT + "/backups", in == null ? Map.of() : in, email());
        audit.record(CurrentUser.get(), "DB_BACKUP_STARTED", "Tenant", String.valueOf(id), id,
                r.describe() + (r.ok() && r.body() != null ? " — " + r.body().path("name").asText() : ""), ClientIp.of(request));
        return relay(r);
    }

    public record CodeInput(String code) {}

    @PostMapping("/tenants/{id}/db/backups/{name}/download")
    @PreAuthorize("hasRole('OWNER')")
    public Map<String, Object> downloadTicket(@PathVariable long id, @PathVariable String name,
                                              @RequestBody(required = false) CodeInput in, HttpServletRequest request) {
        PlatformPrincipal who = CurrentUser.get();
        Tenant t = open(id);
        checkName(t, name);
        String ip = ClientIp.of(request);
        auth.requireStepUp(who, in == null ? null : in.code(), "download a copy of " + t.code + "'s database", ip);
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        tickets.put(ticket, new Ticket(id, name, who, ip));
        audit.record(who, "DB_BACKUP_DOWNLOAD_ISSUED", "Tenant", String.valueOf(id), id, name, ip);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("url", "/api/db-downloads/" + URLEncoder.encode(ticket, StandardCharsets.UTF_8));
        out.put("expiresAt", Instant.now().plus(Duration.ofMinutes(2)));
        return out;
    }

    @GetMapping("/db-downloads/{ticket}")
    public void download(@PathVariable String ticket, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        Ticket tk = tickets.asMap().remove(ticket);
        if (tk == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "This download link has expired or was already used.");
        Tenant t = tenants.get(tk.tenantId());
        HttpResponse<InputStream> r;
        try {
            r = agent.stream(t, AGENT + "/backups/" + tk.name() + "/download", tk.who().email(), Duration.ofSeconds(60));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Interrupted");
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The client's server did not answer: " + e.getMessage());
        }
        try (InputStream in = r.body()) {
            if (r.statusCode() != 200) {
                String err = new String(in.readNBytes(2000), StandardCharsets.UTF_8);
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The client's server refused (HTTP " + r.statusCode() + "): " + clip(err, 300));
            }
            audit.record(tk.who(), "DB_BACKUP_DOWNLOADED", "Tenant", String.valueOf(t.id), t.id, tk.name(), ClientIp.of(request));
            response.setStatus(200);
            response.setContentType("application/octet-stream");
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(tk.name()).build().toString());
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
            r.headers().firstValueAsLong("content-length").ifPresent(response::setContentLengthLong);
            OutputStream out = response.getOutputStream();
            in.transferTo(out);
            out.flush();
        }
    }

    @PostMapping("/tenants/{id}/db/backups/{name}/delete")
    @PreAuthorize("hasRole('OWNER')")
    public JsonNode deleteBackup(@PathVariable long id, @PathVariable String name, HttpServletRequest request) {
        Tenant t = open(id);
        checkName(t, name);
        AgentResponse r = agent.post(t, AGENT + "/backups/" + name + "/delete", Map.of(), email());
        audit.record(CurrentUser.get(), "DB_BACKUP_DELETED", "Tenant", String.valueOf(id), id, name + " — " + r.describe(),
                ClientIp.of(request));
        return relay(r);
    }

    /** Files each finished console backup once under Backups, so the dashboard counts it. */
    void recordFinished(Tenant t, JsonNode body) {
        if (body == null || !body.path("backups").isArray()) return;
        for (JsonNode b : body.path("backups")) {
            String status = b.path("status").asText("");
            String name = b.path("name").asText("");
            if (name.isEmpty() || !(status.equals("SUCCESS") || status.equals("FAILED")) || b.path("finishedAt").isMissingNode()) continue;
            String location = "agent:" + name;
            if (backupReports.existsByTenantIdAndLocation(t.id, location)) continue;
            BackupReport r = new BackupReport();
            r.tenantId = t.id;
            r.tenantCode = clip(t.code, 40);
            r.databaseName = clip(b.path("database").asText(t.databaseName), 100);
            r.kind = "DATABASE";
            r.status = status;
            r.startedAt = instant(b.path("startedAt"));
            r.finishedAt = instant(b.path("finishedAt"));
            r.sizeBytes = b.hasNonNull("sizeBytes") ? b.get("sizeBytes").asLong() : null;
            r.location = clip(location, 500);
            r.checksumSha256 = b.hasNonNull("sha256") ? clip(b.get("sha256").asText(), 64) : null;
            r.message = clip("Database console (" + b.path("requestedBy").asText("?") + "): " + b.path("message").asText(""), 1000);
            r.reportedAt = Instant.now();
            r.reporterIp = "agent";
            backupReports.save(r);
        }
    }

    // ---------------------------------------------------------------- helpers

    private Tenant open(long id) {
        Tenant t = tenants.get(id);
        if (t.status == TenantStatus.ARCHIVED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Archived clients can't be opened in the database console");
        }
        if (!agent.configured(t)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "AGENT_NOT_CONFIGURED: Set the client's agent URL and secret first.");
        }
        return t;
    }

    private static void checkName(Tenant t, String name) {
        if (name == null || !BACKUP_NAME.matcher(name).matches() || !name.startsWith(t.code + "-")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a backup of this client");
        }
    }

    /** The agent's statement timeout plus headroom for the network and result transfer. */
    static Duration waitFor(Integer timeoutSeconds) {
        int s = timeoutSeconds == null ? 30 : Math.max(1, Math.min(600, timeoutSeconds));
        return Duration.ofSeconds(s + 20L);
    }

    /**
     * Passes the agent's answer through, or turns a refusal into the same status and
     * {@code CODE: message} so the admin app shows the client's own explanation.
     */
    static JsonNode relay(AgentResponse r) {
        if (r.ok()) return r.body();
        if (r.unreachable()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AGENT_UNREACHABLE: The client's server did not answer: " + r.error());
        }
        JsonNode b = r.body();
        String code = b != null && b.hasNonNull("code") ? b.get("code").asText() : null;
        String message = b != null && b.hasNonNull("message") ? b.get("message").asText() : null;
        int s = r.status();
        if (s == 401) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AGENT_AUTH_FAILED: The client refused our signature (" + code + "). Check the agent secret and clock.");
        }
        if (s == 404 && (code == null || code.equals("NOT_FOUND"))) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "AGENT_NO_DB_TOOLS: The client's agent is off, or its build predates the database tools. Deploy the current backend build.");
        }
        HttpStatus status = switch (s) {
            case 400, 403, 404, 409, 413, 423, 507 -> HttpStatus.valueOf(s);
            default -> HttpStatus.BAD_GATEWAY;
        };
        String text = message != null ? message : "The client's server answered HTTP " + s;
        throw new ResponseStatusException(status, code != null && code.matches("[A-Z_]+") ? code + ": " + text : text);
    }

    private static String outcome(AgentResponse r) {
        if (!r.ok() || r.body() == null) return r.describe();
        JsonNode b = r.body();
        if (!b.path("ok").asBoolean(true)) return "SQL error: " + b.path("error").path("message").asText();
        if (b.has("updateCount")) return b.get("updateCount").asText() + " row(s) affected" + (b.path("dryRun").asBoolean() ? ", rolled back" : "");
        return b.path("rowCount").asText("0") + " row(s) returned";
    }

    private static Instant instant(JsonNode n) {
        try {
            return n == null || n.isMissingNode() || n.isNull() ? null : Instant.parse(n.asText());
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String email() {
        return CurrentUser.get().email();
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
