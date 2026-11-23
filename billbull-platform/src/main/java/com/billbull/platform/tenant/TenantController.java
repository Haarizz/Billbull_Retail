package com.billbull.platform.tenant;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.agent.TenantAgentClient;
import com.billbull.platform.audit.AuditService;
import com.billbull.platform.auth.CurrentUser;
import com.billbull.platform.health.HealthService;
import com.billbull.platform.health.HealthSnapshot;
import com.billbull.platform.health.HealthSnapshotRepository;
import com.billbull.platform.plan.Plan;
import com.billbull.platform.plan.PlanRepository;
import com.billbull.platform.sync.StateSyncService;
import com.billbull.platform.web.ClientIp;

/**
 * <pre>
 *   GET  /api/tenants                         VIEWER   registry with plan, entitlements, health
 *   GET  /api/tenants/{id}                    VIEWER   one tenant in full
 *   POST /api/tenants                         OPERATOR onboard (returns the agent secret once)
 *   PUT  /api/tenants/{id}                    OPERATOR edit details and domains
 *   POST /api/tenants/{id}/status             OPERATOR ACTIVE / READ_ONLY / SUSPENDED (ARCHIVED: OWNER)
 *   PUT  /api/tenants/{id}/entitlements       OPERATOR plan, module overrides, limits
 *   POST /api/tenants/{id}/sync               OPERATOR push state now
 *   POST /api/tenants/{id}/health-check       OPERATOR poll health now
 *   GET  /api/tenants/{id}/health             VIEWER   snapshot history
 *   GET  /api/tenants/{id}/agent-state        VIEWER   what the tenant currently enforces
 *   POST /api/tenants/{id}/rotate-secret      OWNER    new agent secret (shown once)
 *   GET  /api/tenants/{id}/provisioning-kit   OPERATOR generated server files
 *   GET  /api/tenants/modules                 VIEWER   optional module catalogue
 * </pre>
 */
@RestController
@RequestMapping("/api/tenants")
public class TenantController {

    private final TenantService service;
    private final TenantRepository tenants;
    private final PlanRepository plans;
    private final HealthSnapshotRepository snapshots;
    private final HealthService health;
    private final StateSyncService sync;
    private final TenantAgentClient agent;
    private final ProvisioningKitService kit;
    private final AuditService audit;

    public TenantController(TenantService service, TenantRepository tenants, PlanRepository plans,
                            HealthSnapshotRepository snapshots, HealthService health, StateSyncService sync,
                            TenantAgentClient agent, ProvisioningKitService kit, AuditService audit) {
        this.service = service;
        this.tenants = tenants;
        this.plans = plans;
        this.snapshots = snapshots;
        this.health = health;
        this.sync = sync;
        this.agent = agent;
        this.kit = kit;
        this.audit = audit;
    }

    @GetMapping("/modules")
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, String>> modules() {
        return Modules.OPTIONAL.stream().map(m -> Map.of("key", m, "label", Modules.LABELS.get(m))).toList();
    }

    @GetMapping
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, Object>> list(@RequestParam(defaultValue = "false") boolean includeArchived) {
        Map<Long, Plan> planById = plans.findAll().stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
        Map<Long, HealthSnapshot> latest = snapshots.latestPerTenant().stream()
                .collect(Collectors.toMap(s -> s.tenantId, Function.identity(), (a, b) -> a));
        return tenants.findAllByOrderByNameAsc().stream()
                .filter(t -> includeArchived || t.status != TenantStatus.ARCHIVED)
                .map(t -> summary(t, planById.get(t.planId), latest.get(t.id)))
                .toList();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('VIEWER')")
    public Map<String, Object> get(@PathVariable long id) {
        Tenant t = service.get(id);
        return detail(t);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> create(@RequestBody TenantService.TenantInput input, HttpServletRequest request) {
        TenantService.WithSecret created = service.create(input, CurrentUser.get(), ClientIp.of(request));
        Map<String, Object> out = detail(created.tenant());
        out.put("agentSecret", created.agentSecret());
        return out;
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody TenantService.TenantInput input,
                                      HttpServletRequest request) {
        service.update(id, input, CurrentUser.get(), ClientIp.of(request));
        return pushAndDetail(id);
    }

    @PostMapping("/{id}/status")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> status(@PathVariable long id, @RequestBody TenantService.StatusChange change,
                                      HttpServletRequest request) {
        service.changeStatus(id, change, CurrentUser.get(), ClientIp.of(request));
        return pushAndDetail(id);
    }

    @PutMapping("/{id}/entitlements")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> entitlements(@PathVariable long id, @RequestBody TenantService.EntitlementChange change,
                                            HttpServletRequest request) {
        service.changeEntitlements(id, change, CurrentUser.get(), ClientIp.of(request));
        return pushAndDetail(id);
    }

    @PostMapping("/{id}/sync")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> syncNow(@PathVariable long id, HttpServletRequest request) {
        Tenant t = service.get(id);
        AgentResponse r = sync.push(id, CurrentUser.get().email());
        audit.record(CurrentUser.get(), "TENANT_SYNC", "Tenant", String.valueOf(id), id, r.describe(), ClientIp.of(request));
        Map<String, Object> out = detail(service.get(t.id));
        out.put("lastAction", r.describe());
        return out;
    }

    @PostMapping("/{id}/health-check")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> healthCheck(@PathVariable long id) {
        return snapshotView(health.check(id));
    }

    @GetMapping("/{id}/health")
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, Object>> healthHistory(@PathVariable long id, @RequestParam(defaultValue = "50") int limit) {
        service.get(id);
        return snapshots.findByTenantIdOrderByCheckedAtDesc(id, PageRequest.of(0, Math.max(1, Math.min(500, limit))))
                .stream().map(TenantController::snapshotView).toList();
    }

    @GetMapping("/{id}/agent-state")
    @PreAuthorize("hasRole('VIEWER')")
    public Map<String, Object> agentState(@PathVariable long id) {
        AgentResponse r = agent.get(service.get(id), "/api/platform/state", CurrentUser.get().email());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", r.ok());
        out.put("result", r.describe());
        out.put("state", r.ok() ? r.body() : null);
        return out;
    }

    @PostMapping("/{id}/rotate-secret")
    @PreAuthorize("hasRole('OWNER')")
    public Map<String, Object> rotate(@PathVariable long id, HttpServletRequest request) {
        TenantService.WithSecret r = service.rotateAgentSecret(id, CurrentUser.get(), ClientIp.of(request));
        Map<String, Object> out = detail(r.tenant());
        out.put("agentSecret", r.agentSecret());
        return out;
    }

    @GetMapping("/{id}/provisioning-kit")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, String> provisioningKit(@PathVariable long id) {
        Tenant t = service.get(id);
        return kit.kit(t, service.domainsOf(id));
    }

    /** Pushes right away so the change is live in seconds; the sync job retries if this fails. */
    private Map<String, Object> pushAndDetail(long id) {
        Tenant t = service.get(id);
        String result = null;
        if (t.syncPending() && agent.configured(t)) {
            result = sync.push(id, CurrentUser.get().email()).describe();
        }
        Map<String, Object> out = detail(service.get(id));
        if (result != null) out.put("lastAction", "Pushed to tenant: " + result);
        return out;
    }

    private Map<String, Object> detail(Tenant t) {
        Plan plan = service.planOf(t);
        Map<String, Object> m = summary(t, plan, snapshots.findTopByTenantIdOrderByCheckedAtDesc(t.id).orElse(null));
        m.put("statusReason", t.statusReason);
        m.put("statusMessage", t.statusMessage);
        m.put("agentUrl", t.agentUrl);
        m.put("agentSecretSetAt", t.agentSecretSetAt);
        m.put("springProfile", t.springProfile);
        m.put("backendPort", t.backendPort);
        m.put("databaseName", t.databaseName);
        m.put("contactName", t.contactName);
        m.put("contactEmail", t.contactEmail);
        m.put("contactPhone", t.contactPhone);
        m.put("notes", t.notes);
        m.put("moduleOverrides", t.moduleOverrides);
        Map<String, Object> limits = new LinkedHashMap<>();
        limits.put("maxUsers", t.maxUsers);
        limits.put("maxBranches", t.maxBranches);
        limits.put("maxTerminalsPerBranch", t.maxTerminalsPerBranch);
        m.put("limitOverrides", limits);
        m.put("domains", service.domainsOf(t.id).stream().map(d -> {
            Map<String, Object> dm = new LinkedHashMap<>();
            dm.put("id", d.id);
            dm.put("host", d.host);
            dm.put("primary", d.primaryDomain);
            return dm;
        }).toList());
        m.put("createdAt", t.createdAt);
        m.put("createdBy", t.createdBy);
        return m;
    }

    static Map<String, Object> summary(Tenant t, Plan plan, HealthSnapshot latest) {
        Entitlements e = Entitlements.resolve(plan, t);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.id);
        m.put("code", t.code);
        m.put("name", t.name);
        m.put("status", t.status.name());
        m.put("statusChangedAt", t.statusChangedAt);
        m.put("planCode", plan != null ? plan.code : null);
        m.put("planName", plan != null ? plan.name : null);
        m.put("appUrl", t.appUrl);
        m.put("serverLabel", t.serverLabel);
        m.put("modules", e.modules());
        Map<String, Object> limits = new LinkedHashMap<>();
        limits.put("maxUsers", e.maxUsers());
        limits.put("maxBranches", e.maxBranches());
        limits.put("maxTerminalsPerBranch", e.maxTerminalsPerBranch());
        m.put("limits", limits);
        m.put("agentConfigured", t.agentUrl != null && t.agentSecretEnc != null);
        m.put("configVersion", t.configVersion);
        m.put("appliedConfigVersion", t.appliedConfigVersion);
        m.put("syncPending", t.syncPending());
        m.put("lastSyncAt", t.lastSyncAt);
        m.put("lastSyncError", t.lastSyncError);
        m.put("healthStatus", t.lastHealthStatus);
        m.put("healthAt", t.lastHealthAt);
        m.put("health", latest != null ? snapshotView(latest) : null);
        return m;
    }

    public static Map<String, Object> snapshotView(HealthSnapshot s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.id);
        m.put("checkedAt", s.checkedAt);
        m.put("status", s.status);
        m.put("httpStatus", s.httpStatus);
        m.put("latencyMs", s.latencyMs);
        m.put("appVersion", s.appVersion);
        m.put("artifactSha256", s.artifactSha256);
        m.put("artifactTime", s.artifactTime);
        m.put("flywayVersion", s.flywayVersion);
        m.put("flywayPending", s.flywayPending);
        m.put("flywayFailed", s.flywayFailed);
        m.put("dbSizeBytes", s.dbSizeBytes);
        m.put("activeUsers", s.activeUsers);
        m.put("branches", s.branches);
        m.put("terminals", s.terminals);
        m.put("openSessions", s.openSessions);
        m.put("invoices30d", s.invoices30d);
        m.put("lastInvoiceAt", s.lastInvoiceAt);
        m.put("heapUsedBytes", s.heapUsedBytes);
        m.put("heapMaxBytes", s.heapMaxBytes);
        m.put("diskFreeBytes", s.diskFreeBytes);
        m.put("diskTotalBytes", s.diskTotalBytes);
        m.put("uptimeSeconds", s.uptimeSeconds);
        m.put("reportedStatus", s.reportedStatus);
        m.put("reportedConfigVersion", s.reportedConfigVersion);
        m.put("error", s.error);
        return m;
    }
}
