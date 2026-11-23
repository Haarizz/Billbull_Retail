package com.billbull.backend.platform;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * The tenant's view of its control-plane state, cached in memory.
 *
 * <p>Read on every request by {@link PlatformPolicyFilter}, so it is cached for
 * {@link #CACHE_MILLIS}; a push through the agent replaces the cache at once. When the table is
 * missing or unreadable the tenant fails <em>open</em> (unmanaged: everything allowed) and logs it,
 * because a control-plane fault must never lock a shop out of its till.
 */
@Service
public class PlatformStateService {

    static final long CACHE_MILLIS = 15_000;
    private static final Logger log = LoggerFactory.getLogger(PlatformStateService.class);

    private final PlatformStateRepository repository;
    private volatile PlatformState cached;
    private volatile long cachedAt;

    public PlatformStateService(PlatformStateRepository repository) {
        this.repository = repository;
    }

    public PlatformState current() {
        PlatformState snapshot = cached;
        if (snapshot != null && System.currentTimeMillis() - cachedAt < CACHE_MILLIS) {
            return snapshot;
        }
        return reload();
    }

    public synchronized PlatformState reload() {
        PlatformState loaded;
        try {
            loaded = repository.load().orElseGet(PlatformState::unmanaged);
        } catch (RuntimeException e) {
            log.warn("Could not read platform_tenant_state ({}); treating this tenant as unmanaged.", e.getMessage());
            loaded = cached != null ? cached : PlatformState.unmanaged();
        }
        cached = loaded;
        cachedAt = System.currentTimeMillis();
        return loaded;
    }

    public synchronized PlatformState apply(PlatformStateUpdate update, String actor) {
        if (update == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "State body required");
        }
        TenantLifecycleStatus status;
        try {
            status = TenantLifecycleStatus.parse(update.status());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown status: " + update.status());
        }
        Map<String, Boolean> modules = new LinkedHashMap<>();
        if (update.modules() != null) {
            update.modules().forEach((k, v) -> {
                String key = k == null ? null : k.trim().toLowerCase(java.util.Locale.ROOT);
                if (!PlatformModules.isOptional(key)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Module '" + k + "' can't be switched off (optional modules: " + PlatformModules.OPTIONAL.keySet() + ")");
                }
                modules.put(key, v == null || v);
            });
        }
        Map<String, Integer> limits = new LinkedHashMap<>();
        if (update.limits() != null) {
            update.limits().forEach((k, v) -> {
                if (!PlatformState.LIMIT_USERS.equals(k) && !PlatformState.LIMIT_BRANCHES.equals(k)
                        && !PlatformState.LIMIT_TERMINALS_PER_BRANCH.equals(k)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown limit: " + k);
                }
                if (v != null && v > 0) limits.put(k, v);
            });
        }
        String message = update.statusMessage();
        if (message != null && message.length() > 500) message = message.substring(0, 500);
        PlatformState next = new PlatformState(true, status, message, update.planCode(), modules, limits,
                update.configVersion() == null ? 0L : update.configVersion(), null, actor);
        repository.save(next);
        return reload();
    }

    /** Throws 409 {@code PLAN_LIMIT_REACHED} when adding one more would exceed {@code limitKey}. */
    public void assertWithinLimit(String limitKey, long currentCount, String what) {
        Integer limit = current().limit(limitKey);
        if (limit != null && currentCount >= limit) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Your plan allows " + limit + " " + what + ". Contact BillBull support to raise the limit.");
        }
    }
}
