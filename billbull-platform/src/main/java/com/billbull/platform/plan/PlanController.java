package com.billbull.platform.plan;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.platform.audit.AuditService;
import com.billbull.platform.auth.CurrentUser;
import com.billbull.platform.tenant.Modules;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;
import com.billbull.platform.web.ClientIp;

/**
 * Plans: VIEWER reads, OWNER edits. Editing a plan re-pushes every tenant on it (their
 * {@code configVersion} is bumped), so a plan change reaches all its clients within a sync cycle.
 */
@RestController
@RequestMapping("/api/plans")
public class PlanController {

    private final PlanRepository plans;
    private final TenantRepository tenants;
    private final AuditService audit;

    public PlanController(PlanRepository plans, TenantRepository tenants, AuditService audit) {
        this.plans = plans;
        this.tenants = tenants;
        this.audit = audit;
    }

    public record PlanInput(String code, String name, String description, List<String> modules, Integer maxUsers,
                            Integer maxBranches, Integer maxTerminalsPerBranch, BigDecimal monthlyPrice,
                            String currency, Boolean active) {}

    @GetMapping
    @PreAuthorize("hasRole('VIEWER')")
    public List<Map<String, Object>> list() {
        return plans.findAllByOrderByIdAsc().stream().map(this::view).toList();
    }

    @PostMapping
    @PreAuthorize("hasRole('OWNER')")
    @Transactional
    public Map<String, Object> create(@RequestBody PlanInput in, HttpServletRequest request) {
        String code = in.code() == null ? "" : in.code().trim().toUpperCase();
        if (!code.matches("^[A-Z0-9_]{2,40}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Plan code: 2-40 of A-Z, 0-9, _");
        }
        if (plans.findByCodeIgnoreCase(code).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan " + code + " already exists");
        }
        Plan p = new Plan();
        p.code = code;
        apply(p, in);
        plans.save(p);
        audit.record(CurrentUser.get(), "PLAN_CREATED", "Plan", p.code, null, describe(p), ClientIp.of(request));
        return view(p);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody PlanInput in, HttpServletRequest request) {
        Plan p = plans.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Plan not found"));
        String before = describe(p);
        apply(p, in);
        plans.save(p);
        int affected = 0;
        for (Tenant t : tenants.findAll()) {
            if (p.id.equals(t.planId)) {
                t.bumpConfig();
                tenants.save(t);
                affected++;
            }
        }
        audit.record(CurrentUser.get(), "PLAN_UPDATED", "Plan", p.code, null,
                before + " → " + describe(p) + "; re-pushing " + affected + " tenant(s)", ClientIp.of(request));
        return view(p);
    }

    private static void apply(Plan p, PlanInput in) {
        if (in.name() == null || in.name().isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        p.name = in.name().trim();
        p.description = in.description();
        Set<String> modules = new LinkedHashSet<>();
        if (in.modules() != null) {
            for (String m : in.modules()) {
                if (!Modules.isOptional(m)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown module: " + m);
                modules.add(m);
            }
        }
        p.setModuleSet(modules);
        p.maxUsers = positiveOrNull(in.maxUsers());
        p.maxBranches = positiveOrNull(in.maxBranches());
        p.maxTerminalsPerBranch = positiveOrNull(in.maxTerminalsPerBranch());
        if (p.maxTerminalsPerBranch != null && p.maxTerminalsPerBranch > 999) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "maxTerminalsPerBranch can be at most 999");
        }
        p.monthlyPrice = in.monthlyPrice();
        if (in.currency() != null && !in.currency().isBlank()) p.currency = in.currency().trim().toUpperCase();
        if (in.active() != null) p.active = in.active();
    }

    private static Integer positiveOrNull(Integer v) {
        return v == null || v <= 0 ? null : v;
    }

    private static String describe(Plan p) {
        return p.code + "{modules=" + p.modules + ", users=" + p.maxUsers + ", branches=" + p.maxBranches
                + ", terminals/branch=" + p.maxTerminalsPerBranch + ", active=" + p.active + "}";
    }

    private Map<String, Object> view(Plan p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.id);
        m.put("code", p.code);
        m.put("name", p.name);
        m.put("description", p.description);
        m.put("modules", p.moduleSet());
        m.put("maxUsers", p.maxUsers);
        m.put("maxBranches", p.maxBranches);
        m.put("maxTerminalsPerBranch", p.maxTerminalsPerBranch);
        m.put("monthlyPrice", p.monthlyPrice);
        m.put("currency", p.currency);
        m.put("active", p.active);
        m.put("tenantCount", tenants.countByPlanId(p.id));
        return m;
    }
}
