package com.billbull.platform.sync;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.billbull.platform.agent.AgentResponse;
import com.billbull.platform.agent.TenantAgentClient;
import com.billbull.platform.plan.Plan;
import com.billbull.platform.plan.PlanRepository;
import com.billbull.platform.tenant.Entitlements;
import com.billbull.platform.tenant.Tenant;
import com.billbull.platform.tenant.TenantRepository;

/**
 * Pushes each tenant's desired state (status, plan, modules, limits) to its platform agent.
 *
 * <p>Pushes are idempotent and carry {@code configVersion}; a tenant is "in sync" once it has
 * acknowledged the current version. {@link #syncPending()} retries every
 * {@code platform.sync.interval-ms}, so a tenant that was down during a change catches up when
 * it comes back. Agent calls run outside any database transaction.
 */
@Service
public class StateSyncService {

    private static final Logger log = LoggerFactory.getLogger(StateSyncService.class);

    private final TenantRepository tenants;
    private final PlanRepository plans;
    private final TenantAgentClient agent;
    private final TransactionTemplate tx;

    public StateSyncService(TenantRepository tenants, PlanRepository plans, TenantAgentClient agent, TransactionTemplate tx) {
        this.tenants = tenants;
        this.plans = plans;
        this.agent = agent;
        this.tx = tx;
    }

    /** Pushes one tenant's state now and records the outcome. */
    public AgentResponse push(long tenantId, String actor) {
        Tenant t = tenants.findById(tenantId).orElseThrow();
        if (!agent.configured(t)) {
            return new AgentResponse(0, null, 0, "agent URL or secret not set");
        }
        Plan plan = t.planId != null ? plans.findById(t.planId).orElse(null) : null;
        long version = t.configVersion;
        AgentResponse r = agent.put(t, "/api/platform/state", Entitlements.resolve(plan, t).agentState(t, plan), actor);
        tx.executeWithoutResult(s -> tenants.findById(tenantId).ifPresent(fresh -> {
            fresh.lastSyncAt = Instant.now();
            if (r.ok()) {
                // Only acknowledge the version that was sent; a change made meanwhile stays pending.
                fresh.appliedConfigVersion = version;
                fresh.lastSyncError = null;
            } else {
                String d = r.describe();
                fresh.lastSyncError = d.length() > 1000 ? d.substring(0, 1000) : d;
            }
            tenants.save(fresh);
        }));
        return r;
    }

    @Scheduled(fixedDelayString = "${platform.sync.interval-ms:60000}", initialDelay = 20_000)
    public void syncPending() {
        List<Tenant> pending = tenants.findAll().stream().filter(Tenant::syncPending).filter(agent::configured).toList();
        for (Tenant t : pending) {
            try {
                AgentResponse r = push(t.id, "platform-sync");
                if (!r.ok()) log.info("State sync to {} failed: {}", t.code, r.describe());
            } catch (RuntimeException e) {
                log.warn("State sync to {} errored: {}", t.code, e.getMessage());
            }
        }
    }
}
