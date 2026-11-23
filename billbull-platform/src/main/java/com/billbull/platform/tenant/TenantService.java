package com.billbull.platform.tenant;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.audit.AuditService;
import com.billbull.platform.auth.PlatformPrincipal;
import com.billbull.platform.auth.PlatformRole;
import com.billbull.platform.config.SecretCipher;
import com.billbull.platform.plan.Plan;
import com.billbull.platform.plan.PlanRepository;

/**
 * The client registry. Every change is audited; every change the tenant must enforce bumps
 * {@code configVersion} so {@code StateSyncService} pushes it.
 */
@Service
public class TenantService {

    private static final Pattern CODE = Pattern.compile("^[a-z0-9][a-z0-9-]{1,39}$");
    private static final Pattern HOST = Pattern.compile("^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$");

    private final TenantRepository tenants;
    private final TenantDomainRepository domains;
    private final PlanRepository plans;
    private final SecretCipher cipher;
    private final AuditService audit;

    public TenantService(TenantRepository tenants, TenantDomainRepository domains, PlanRepository plans,
                         SecretCipher cipher, AuditService audit) {
        this.tenants = tenants;
        this.domains = domains;
        this.plans = plans;
        this.cipher = cipher;
        this.audit = audit;
    }

    public record TenantInput(String code, String name, String planCode, String appUrl, String agentUrl,
                              String serverLabel, String springProfile, Integer backendPort, String databaseName,
                              String contactName, String contactEmail, String contactPhone, String notes,
                              List<String> domains) {}

    public record StatusChange(String status, String reason, String customerMessage) {}

    public record EntitlementChange(String planCode, Map<String, Boolean> moduleOverrides, Integer maxUsers,
                                    Integer maxBranches, Integer maxTerminalsPerBranch) {}

    /** Result of creating a tenant or rotating its secret: the secret is shown exactly once. */
    public record WithSecret(Tenant tenant, String agentSecret) {}

    public Tenant get(long id) {
        return tenants.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));
    }

    public List<TenantDomain> domainsOf(long id) {
        return domains.findByTenantIdOrderByPrimaryDomainDescHostAsc(id);
    }

    public Plan planOf(Tenant t) {
        return t.planId == null ? null : plans.findById(t.planId).orElse(null);
    }

    @Transactional
    public WithSecret create(TenantInput in, PlatformPrincipal actor, String ip) {
        String code = normaliseCode(in.code());
        if (tenants.findByCode(code).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A tenant with code '" + code + "' already exists");
        }
        Tenant t = new Tenant();
        t.code = code;
        t.createdBy = actor.email();
        apply(t, in, true);
        t.status = TenantStatus.ONBOARDING;
        t.statusChangedAt = Instant.now();
        String secret = cipher.newSecret();
        t.agentSecretEnc = cipher.encrypt(secret);
        t.agentSecretSetAt = Instant.now();
        tenants.save(t);
        replaceDomains(t, in.domains());
        audit.record(actor, "TENANT_CREATED", "Tenant", String.valueOf(t.id), t.id,
                "Created " + t.code + " (" + t.name + ") on plan " + planCodeOf(t), ip);
        return new WithSecret(t, secret);
    }

    @Transactional
    public Tenant update(long id, TenantInput in, PlatformPrincipal actor, String ip) {
        Tenant t = get(id);
        Map<String, Object> before = snapshot(t);
        apply(t, in, false);
        tenants.save(t);
        if (in.domains() != null) replaceDomains(t, in.domains());
        audit.record(actor, "TENANT_UPDATED", "Tenant", String.valueOf(t.id), t.id,
                diff(before, snapshot(t)), ip);
        return t;
    }

    @Transactional
    public Tenant changeStatus(long id, StatusChange change, PlatformPrincipal actor, String ip) {
        Tenant t = get(id);
        TenantStatus next;
        try {
            next = TenantStatus.valueOf(change.status().trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown status: " + change.status());
        }
        String reason = change.reason() == null ? "" : change.reason().trim();
        if (next.restrictive() && reason.length() < 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Give a reason of at least 10 characters for " + next + " — it goes in the audit trail");
        }
        if ((next == TenantStatus.ARCHIVED || t.status == TenantStatus.ARCHIVED) && actor.role() != PlatformRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an OWNER can archive or un-archive a tenant");
        }
        TenantStatus prev = t.status;
        t.status = next;
        t.statusReason = reason.isEmpty() ? null : clip(reason, 500);
        t.statusMessage = blankToNull(clip(change.customerMessage(), 500));
        t.statusChangedAt = Instant.now();
        t.bumpConfig();
        tenants.save(t);
        audit.record(actor, "TENANT_STATUS_CHANGED", "Tenant", String.valueOf(t.id), t.id,
                prev + " → " + next + (reason.isEmpty() ? "" : ". Reason: " + reason)
                        + (t.statusMessage != null ? ". Customer message: " + t.statusMessage : ""), ip);
        return t;
    }

    @Transactional
    public Tenant changeEntitlements(long id, EntitlementChange change, PlatformPrincipal actor, String ip) {
        Tenant t = get(id);
        Plan beforePlan = planOf(t);
        Entitlements before = Entitlements.resolve(beforePlan, t);
        if (change.planCode() != null) {
            t.planId = change.planCode().isBlank() ? null : planByCode(change.planCode()).id;
        }
        if (change.moduleOverrides() != null) {
            Map<String, Boolean> overrides = new LinkedHashMap<>();
            change.moduleOverrides().forEach((k, v) -> {
                if (!Modules.isOptional(k)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown or core module: " + k);
                }
                if (v != null) overrides.put(k, v);
            });
            t.moduleOverrides.clear();
            t.moduleOverrides.putAll(overrides);
        }
        t.maxUsers = nonNegative(change.maxUsers(), "maxUsers");
        t.maxBranches = nonNegative(change.maxBranches(), "maxBranches");
        t.maxTerminalsPerBranch = nonNegative(change.maxTerminalsPerBranch(), "maxTerminalsPerBranch");
        if (t.maxTerminalsPerBranch != null && t.maxTerminalsPerBranch > 999) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "maxTerminalsPerBranch can be at most 999");
        }
        t.bumpConfig();
        tenants.save(t);
        Plan afterPlan = planOf(t);
        Entitlements after = Entitlements.resolve(afterPlan, t);
        audit.record(actor, "TENANT_ENTITLEMENTS_CHANGED", "Tenant", String.valueOf(t.id), t.id,
                "Plan " + code(beforePlan) + " → " + code(afterPlan) + "; modules " + before.modules() + " → "
                        + after.modules() + "; limits " + before.limitsMap() + " → " + after.limitsMap(), ip);
        return t;
    }

    @Transactional
    public WithSecret rotateAgentSecret(long id, PlatformPrincipal actor, String ip) {
        Tenant t = get(id);
        String secret = cipher.newSecret();
        t.agentSecretEnc = cipher.encrypt(secret);
        t.agentSecretSetAt = Instant.now();
        t.appliedConfigVersion = 0; // re-push once the tenant runs with the new secret
        tenants.save(t);
        audit.record(actor, "TENANT_AGENT_SECRET_ROTATED", "Tenant", String.valueOf(t.id), t.id,
                "New agent secret issued; the tenant must be restarted with it", ip);
        return new WithSecret(t, secret);
    }

    private void apply(Tenant t, TenantInput in, boolean creating) {
        if (in.name() == null || in.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        t.name = clip(in.name().trim(), 200);
        if (creating || in.planCode() != null) {
            String pc = in.planCode();
            Long newPlan = pc == null || pc.isBlank() ? null : planByCode(pc).id;
            if (!creating && !java.util.Objects.equals(newPlan, t.planId)) t.bumpConfig();
            t.planId = newPlan;
        }
        t.appUrl = url(in.appUrl(), "appUrl");
        t.agentUrl = url(in.agentUrl() != null && !in.agentUrl().isBlank() ? in.agentUrl() : in.appUrl(), "agentUrl");
        t.serverLabel = blankToNull(clip(in.serverLabel(), 120));
        t.springProfile = blankToNull(clip(in.springProfile(), 60));
        if (in.backendPort() != null && (in.backendPort() < 1 || in.backendPort() > 65535)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "backendPort must be 1-65535");
        }
        t.backendPort = in.backendPort();
        t.databaseName = blankToNull(clip(in.databaseName(), 100));
        t.contactName = blankToNull(clip(in.contactName(), 150));
        t.contactEmail = blankToNull(clip(in.contactEmail(), 200));
        t.contactPhone = blankToNull(clip(in.contactPhone(), 50));
        t.notes = blankToNull(in.notes());
    }

    private void replaceDomains(Tenant t, List<String> hosts) {
        if (hosts == null) return;
        List<String> clean = new ArrayList<>();
        for (String h : hosts) {
            if (h == null || h.isBlank()) continue;
            String host = h.trim().toLowerCase(Locale.ROOT);
            if (!HOST.matcher(host).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid hostname: " + h);
            }
            domains.findByHostIgnoreCase(host).ifPresent(existing -> {
                if (!existing.tenantId.equals(t.id)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, host + " already belongs to another tenant");
                }
            });
            if (!clean.contains(host)) clean.add(host);
        }
        List<TenantDomain> current = domains.findByTenantIdOrderByPrimaryDomainDescHostAsc(t.id);
        domains.deleteAll(current.stream().filter(d -> !clean.contains(d.host)).toList());
        domains.flush();
        for (int i = 0; i < clean.size(); i++) {
            String host = clean.get(i);
            TenantDomain d = current.stream().filter(x -> x.host.equals(host)).findFirst().orElseGet(TenantDomain::new);
            d.tenantId = t.id;
            d.host = host;
            d.primaryDomain = i == 0;
            domains.save(d);
        }
    }

    private Plan planByCode(String code) {
        return plans.findByCodeIgnoreCase(code.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown plan: " + code));
    }

    private String planCodeOf(Tenant t) {
        return code(planOf(t));
    }

    private static String code(Plan p) {
        return p == null ? "(none)" : p.code;
    }

    static String normaliseCode(String raw) {
        String code = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (!CODE.matcher(code).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Code must be 2-40 characters: lowercase letters, digits and dashes (it must match the backend's"
                            + " Spring profile / billbull.tenant.code)");
        }
        return code;
    }

    static String url(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();
        try {
            URI u = URI.create(s);
            if (!("https".equals(u.getScheme()) || "http".equals(u.getScheme())) || u.getHost() == null) throw new IllegalArgumentException();
            if (u.getRawQuery() != null || u.getRawFragment() != null || u.getUserInfo() != null) throw new IllegalArgumentException();
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " must be an http(s) URL without query, e.g. https://demo.billbull.app");
        }
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static Integer nonNegative(Integer v, String field) {
        if (v != null && v < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " can't be negative");
        return v;
    }

    private static Map<String, Object> snapshot(Tenant t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", t.name);
        m.put("planId", t.planId);
        m.put("appUrl", t.appUrl);
        m.put("agentUrl", t.agentUrl);
        m.put("serverLabel", t.serverLabel);
        m.put("springProfile", t.springProfile);
        m.put("backendPort", t.backendPort);
        m.put("databaseName", t.databaseName);
        m.put("contactName", t.contactName);
        m.put("contactEmail", t.contactEmail);
        m.put("contactPhone", t.contactPhone);
        return m;
    }

    private static String diff(Map<String, Object> a, Map<String, Object> b) {
        StringBuilder sb = new StringBuilder();
        b.forEach((k, v) -> {
            Object old = a.get(k);
            if (!java.util.Objects.equals(old, v)) sb.append(k).append(": ").append(old).append(" → ").append(v).append("; ");
        });
        return sb.length() == 0 ? "No field changes (domains or notes only)" : sb.toString();
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
