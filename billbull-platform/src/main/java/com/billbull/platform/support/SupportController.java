package com.billbull.platform.support;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.agent.TenantAgentClient;
import com.billbull.platform.audit.AuditService;
import com.billbull.platform.auth.CurrentUser;
import com.billbull.platform.auth.PlatformPrincipal;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantService;
import com.billbull.platform.tenant.TenantStatus;
import com.billbull.platform.web.ClientIp;

/**
 * Time-boxed support sign-in to a tenant, on the tenant's terms (it must have enabled support
 * access and keep an active {@code platform.support} user — see the tenant's
 * {@code PlatformSupportService}).
 *
 * <p>The returned link opens the tenant's own site at {@code /support-login#token=…}: the token is
 * in the URL fragment, which browsers never send to a server or write to access logs, and it is
 * not stored in the control plane.
 */
@RestController
@RequestMapping("/api")
public class SupportController {

    private final TenantService tenants;
    private final SupportSessionRepository sessions;
    private final TenantAgentClient agent;
    private final AuditService audit;

    public SupportController(TenantService tenants, SupportSessionRepository sessions, TenantAgentClient agent,
                             AuditService audit) {
        this.tenants = tenants;
        this.sessions = sessions;
        this.agent = agent;
        this.audit = audit;
    }

    public record SupportRequest(String reason, String ticketRef, Integer minutes) {}

    @PostMapping("/tenants/{id}/support-sessions")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> open(@PathVariable long id, @RequestBody SupportRequest body, HttpServletRequest request) {
        PlatformPrincipal who = CurrentUser.get();
        Tenant t = tenants.get(id);
        if (t.status == TenantStatus.ARCHIVED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Archived tenants can't be opened for support");
        }
        if (t.appUrl == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Set the tenant's app URL first");
        String reason = body.reason() == null ? "" : body.reason().trim();
        if (reason.length() < 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give a reason of at least 10 characters");
        }
        int minutes = body.minutes() == null ? 30 : Math.max(5, Math.min(240, body.minutes()));
        Map<String, Object> agentBody = new LinkedHashMap<>();
        agentBody.put("platformUser", who.email());
        agentBody.put("reason", reason);
        agentBody.put("ticketRef", body.ticketRef());
        agentBody.put("minutes", minutes);
        AgentResponse r = agent.post(t, "/api/platform/support-sessions", agentBody, who.email());
        if (!r.ok() || r.body() == null || !r.body().hasNonNull("token")) {
            audit.record(who, "SUPPORT_SESSION_REFUSED", "Tenant", String.valueOf(id), id,
                    r.describe() + " — reason: " + reason, ClientIp.of(request));
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The tenant refused: " + r.describe());
        }
        SupportSession s = new SupportSession();
        s.tenantId = id;
        s.platformUserId = who.id();
        s.platformUserEmail = who.email();
        s.reason = reason.length() > 1000 ? reason.substring(0, 1000) : reason;
        s.ticketRef = body.ticketRef();
        s.minutes = minutes;
        s.tenantSessionId = r.body().path("sessionId").asLong();
        s.expiresAt = Instant.parse(r.body().path("expiresAt").asText());
        s.createdAt = Instant.now();
        sessions.save(s);
        audit.record(who, "SUPPORT_SESSION_OPENED", "Tenant", String.valueOf(id), id,
                "Support sign-in as " + r.body().path("username").asText() + " until " + s.expiresAt
                        + (s.ticketRef != null ? " (ticket " + s.ticketRef + ")" : "") + ": " + reason,
                ClientIp.of(request));
        Map<String, Object> out = view(s);
        out.put("loginUrl", t.appUrl + "/support-login#token="
                + URLEncoder.encode(r.body().get("token").asText(), StandardCharsets.UTF_8)
                + "&expires=" + URLEncoder.encode(s.expiresAt.toString(), StandardCharsets.UTF_8));
        return out;
    }

    @PostMapping("/support-sessions/{sessionId}/revoke")
    @PreAuthorize("hasRole('OPERATOR')")
    public Map<String, Object> revoke(@PathVariable long sessionId, HttpServletRequest request) {
        PlatformPrincipal who = CurrentUser.get();
        SupportSession s = sessions.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Support session not found"));
        Tenant t = tenants.get(s.tenantId);
        AgentResponse r = agent.post(t, "/api/platform/support-sessions/" + s.tenantSessionId + "/revoke", Map.of(), who.email());
        if (!r.ok()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The tenant did not confirm: " + r.describe());
        }
        s.revokedAt = Instant.now();
        s.revokedBy = who.email();
        sessions.save(s);
        audit.record(who, "SUPPORT_SESSION_REVOKED", "Tenant", String.valueOf(t.id), t.id,
                "Revoked support session " + s.id, ClientIp.of(request));
        return view(s);
    }

    @GetMapping("/tenants/{id}/support-sessions")
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, Object>> listForTenant(@PathVariable long id, @RequestParam(defaultValue = "50") int limit) {
        return sessions.findByTenantIdOrderByCreatedAtDesc(id, PageRequest.of(0, Math.max(1, Math.min(200, limit))))
                .stream().map(SupportController::view).toList();
    }

    @GetMapping("/support-sessions")
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, Object>> listAll(@RequestParam(defaultValue = "100") int limit) {
        return sessions.findAllByOrderByCreatedAtDesc(PageRequest.of(0, Math.max(1, Math.min(500, limit))))
                .stream().map(SupportController::view).toList();
    }

    static Map<String, Object> view(SupportSession s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.id);
        m.put("tenantId", s.tenantId);
        m.put("platformUserEmail", s.platformUserEmail);
        m.put("reason", s.reason);
        m.put("ticketRef", s.ticketRef);
        m.put("minutes", s.minutes);
        m.put("createdAt", s.createdAt);
        m.put("expiresAt", s.expiresAt);
        m.put("revokedAt", s.revokedAt);
        m.put("revokedBy", s.revokedBy);
        m.put("live", s.revokedAt == null && s.expiresAt.isAfter(Instant.now()));
        return m;
    }
}
