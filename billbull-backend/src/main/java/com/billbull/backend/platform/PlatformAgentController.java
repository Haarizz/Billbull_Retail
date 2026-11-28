package com.billbull.backend.platform;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.security.AuditLogService;

/**
 * The tenant's platform agent: the only API the control plane (admin.billbull.app) uses.
 * Every call is HMAC-signed and checked by {@link PlatformAgentAuthFilter}; a tenant JWT can't
 * reach it.
 *
 * <pre>
 *   GET  /api/platform/health                       health, build, migration and usage snapshot
 *   GET  /api/platform/presence                     who is signed in now (Live Clients)
 *   GET  /api/platform/state                        current status, plan, modules, limits
 *   PUT  /api/platform/state                        replace them (idempotent; carries configVersion)
 *   GET  /api/platform/support-sessions             support sign-ins issued on this tenant
 *   POST /api/platform/support-sessions             issue a time-boxed support sign-in
 *   POST /api/platform/support-sessions/{id}/revoke end one early
 * </pre>
 */
@RestController
@RequestMapping("/api/platform")
@PreAuthorize("hasRole('PLATFORM_AGENT')")
public class PlatformAgentController {

    private final PlatformHealthService healthService;
    private final PlatformStateService stateService;
    private final PlatformSupportService supportService;
    private final AuditLogService auditLogService;
    private final TenantIdentity tenant;
    private final PlatformAgentProperties properties;

    /** Setter-injected so the constructor (and its call sites) stay as they are. */
    private com.billbull.backend.presence.UserPresenceService presenceService;

    @org.springframework.beans.factory.annotation.Autowired
    public void setPresenceService(com.billbull.backend.presence.UserPresenceService presenceService) {
        this.presenceService = presenceService;
    }

    public PlatformAgentController(PlatformHealthService healthService, PlatformStateService stateService,
                                   PlatformSupportService supportService, AuditLogService auditLogService,
                                   TenantIdentity tenant, PlatformAgentProperties properties) {
        this.healthService = healthService;
        this.stateService = stateService;
        this.supportService = supportService;
        this.auditLogService = auditLogService;
        this.tenant = tenant;
        this.properties = properties;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> h = healthService.snapshot();
        h.put("supportAccessEnabled", properties.isSupportAccessEnabled());
        return h;
    }

    /**
     * Live presence for the control plane's Live Clients page: devices seen in the last 24 hours
     * (online = active within {@code onlineWindowSeconds}), open tills and today's invoice count.
     */
    @GetMapping("/presence")
    public Map<String, Object> presence(@RequestParam(defaultValue = "180") int onlineWindowSeconds,
                                        @RequestParam(defaultValue = "200") int limit) {
        return presenceService.snapshot(onlineWindowSeconds, limit);
    }

    @GetMapping("/state")
    public Map<String, Object> state() {
        return view(stateService.current());
    }

    @PutMapping("/state")
    public Map<String, Object> putState(@RequestBody PlatformStateUpdate update, HttpServletRequest request) {
        PlatformState before = stateService.current();
        String actor = actor(request);
        PlatformState after = stateService.apply(update, actor);
        auditLogService.logDomainEvent("PlatformTenantState", tenant.code(), "UPDATED",
                "By " + actor + ": status " + before.status() + " → " + after.status()
                        + ", plan " + before.planCode() + " → " + after.planCode()
                        + ", modules " + after.modules() + ", limits " + after.limits()
                        + ", configVersion " + after.configVersion());
        return view(after);
    }

    @GetMapping("/support-sessions")
    public List<Map<String, Object>> supportSessions(@RequestParam(defaultValue = "50") int limit) {
        return supportService.list(limit);
    }

    @PostMapping("/support-sessions")
    public Map<String, Object> issueSupport(@RequestBody PlatformSupportService.IssueRequest body,
                                            HttpServletRequest request) {
        return supportService.issue(body, actor(request));
    }

    @PostMapping("/support-sessions/{id}/revoke")
    public ResponseEntity<Map<String, Object>> revokeSupport(@PathVariable long id, HttpServletRequest request) {
        boolean revoked = supportService.revoke(id, "platform:" + actor(request));
        return ResponseEntity.ok(Map.of("revoked", revoked));
    }

    static Map<String, Object> view(PlatformState s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("managed", s.managed());
        m.put("status", s.status().name());
        m.put("statusMessage", s.statusMessage());
        m.put("planCode", s.planCode());
        m.put("modules", s.modules());
        m.put("limits", s.limits());
        m.put("configVersion", s.configVersion());
        m.put("updatedAt", s.updatedAt() != null ? s.updatedAt().toInstant().toString() : null);
        m.put("updatedBy", s.updatedBy());
        return m;
    }

    private static String actor(HttpServletRequest request) {
        Object a = request.getAttribute(PlatformAgentAuthFilter.ACTOR_ATTRIBUTE);
        return a != null ? a.toString() : "platform";
    }
}
