package com.billbull.backend.common.ownership;

import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;

import org.hibernate.Session;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.security.RolePermissionRepository;

import jakarta.persistence.EntityManager;

/**
 * Central enforcement for user-based data visibility (ownership filtering), mirroring
 * {@code settings.branch.BranchAccessService}. This is the ONE place that:
 *   <ul>
 *     <li>reads the {@code ownership.filtering.enabled} feature toggle,</li>
 *     <li>resolves whether the current principal holds the {@code VIEW_ALL_RECORDS} override
 *         (pseudo-module {@code permissions.records.view-all}, ADMIN/BRANCH_ADMIN always bypass —
 *         same rule as {@code RolePermissionService.currentUserHas}),</li>
 *     <li>asserts single-record access (GET-by-id / edit / delete), and</li>
 *     <li>exposes a list-scope + Java-side filter for list endpoints.</li>
 *   </ul>
 *
 * <p><b>Composition with branch is AND, never OR.</b> This service only ever ADDS an ownership
 * predicate; branch scope is applied independently by {@code BranchAccessService}. A restricted user
 * sees {@code branchPredicate AND ownerPredicate}. Callers apply both; neither replaces the other.
 *
 * <p><b>Owner-OR-assignee policy.</b> {@link #canAccessRecord(Long, Collection)} accepts the row
 * owner plus any additional "actor" ids (last-modifier, workflow assignee, cashier, delivery person)
 * so multi-actor documents (sales→delivery→approval, JVs) are not hidden from the next actor. Single-
 * owner domains simply pass no extra actors.
 *
 * <p>When the toggle is off, {@link #filteringEnabled()} is false and every {@code applies()}-style
 * check short-circuits to unrestricted — behaviour is byte-identical to today.
 */
@Service
public class OwnershipAccessService {

    private final RolePermissionRepository rolePermissionRepository;
    private final boolean filteringEnabled;

    /** Pseudo-module for the ownership override, seeded in RolePermissionInitializer. */
    public static final String VIEW_ALL_RECORDS_MODULE = "permissions.records.view-all";

    public OwnershipAccessService(
            RolePermissionRepository rolePermissionRepository,
            @Value("${ownership.filtering.enabled:false}") boolean filteringEnabled) {
        this.rolePermissionRepository = rolePermissionRepository;
        this.filteringEnabled = filteringEnabled;
    }

    /** Master switch — false ⇒ no ownership filtering anywhere (default). */
    public boolean filteringEnabled() {
        return filteringEnabled;
    }

    /**
     * True when the current request must be ownership-restricted: toggle on, an authenticated user
     * id is present, and the principal lacks the override. This is the single gate every list /
     * report / guard consults. Reads the pre-resolved per-request {@link OwnershipContextHolder}
     * populated by {@code JwtFilter}, so no per-call permission query is needed.
     */
    public boolean restrictionApplies() {
        return filteringEnabled && OwnershipScope.applies();
    }

    /** The current principal's user id (never used as a client-supplied value — server-derived only). */
    public Long currentUserId() {
        return OwnershipScope.currentUserId();
    }

    /**
     * Enables the dormant {@code ownerFilter} Hibernate filter on the current session as the
     * defence-in-depth net over derived/JPQL list queries, when (and only when) the request is
     * ownership-restricted. No-op otherwise, so toggle-off is byte-identical. Idempotent within a
     * session. Call at the top of a scoped read path; the explicit predicate/guard remains the real
     * enforcement (the filter does not cover native SQL or {@code find(id)}).
     */
    public void enableOwnerFilter(EntityManager em) {
        if (!restrictionApplies() || em == null) {
            return;
        }
        Long me = currentUserId();
        if (me == null) {
            return;
        }
        Session session = em.unwrap(Session.class);
        session.enableFilter("ownerFilter").setParameter("ownerId", me);
    }

    /** Turns the net off again so the session (if pooled/reused) does not leak the filter. */
    public void disableOwnerFilter(EntityManager em) {
        if (em == null) {
            return;
        }
        try {
            em.unwrap(Session.class).disableFilter("ownerFilter");
        } catch (RuntimeException ignored) {
            // filter was never enabled on this session — nothing to disable.
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Override resolution — used by JwtFilter to compute the per-request viewAll flag.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Resolves whether a set of role names grants the ownership override. ADMIN / BRANCH_ADMIN /
     * SUPER_ADMIN always bypass (mirrors the admin short-circuit in
     * {@code RolePermissionService.currentUserHas} and {@code ModulePermissionService}). Everyone
     * else needs an explicit {@code permissions.records.view-all} row with canView=true for one of
     * their roles.
     *
     * <p>Called once per request from {@code JwtFilter}; when the toggle is off it is not consulted
     * (the filter sets viewAll=true unconditionally).
     */
    public boolean rolesGrantViewAll(Collection<String> roleNames) {
        if (roleNames == null || roleNames.isEmpty()) {
            return false;
        }
        for (String r : roleNames) {
            if ("ADMIN".equalsIgnoreCase(r) || "BRANCH_ADMIN".equalsIgnoreCase(r)
                    || "SUPER_ADMIN".equalsIgnoreCase(r)) {
                return true;
            }
        }
        return rolePermissionRepository.findByRole_NameIn(List.copyOf(roleNames)).stream()
                .anyMatch(rp -> VIEW_ALL_RECORDS_MODULE.equalsIgnoreCase(rp.getModule()) && rp.isCanView());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Single-record access (GET-by-id / edit / delete).
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * True if the current principal may access a record owned by {@code ownerId} with the given
     * additional actor ids. Unrestricted (toggle off / override / unauthenticated) ⇒ always true.
     * Restricted ⇒ true iff the current user is the owner or one of the extra actors.
     *
     * <p>Null {@code ownerId} means an unowned (legacy/system) row — restricted users cannot see it
     * (override-holders already returned true above), matching the design's null-owner policy.
     */
    public boolean canAccessRecord(Long ownerId, Collection<Long> extraActorIds) {
        if (!restrictionApplies()) {
            return true;
        }
        Long me = currentUserId();
        if (me == null) {
            return true; // no principal to restrict against (should not happen when restrictionApplies)
        }
        if (Objects.equals(me, ownerId)) {
            return true;
        }
        return extraActorIds != null && extraActorIds.stream().anyMatch(id -> Objects.equals(me, id));
    }

    /** Owner-only convenience overload for single-actor domains. */
    public boolean canAccessRecord(Long ownerId) {
        return canAccessRecord(ownerId, List.of());
    }

    /**
     * 404s a non-owned record for a restricted user (404 not 403 — avoids id-enumeration leakage,
     * per roadmap Phase 4). {@code label} names the document in the message. Owner-or-assignee.
     */
    public void assertCanAccessRecord(Long ownerId, Collection<Long> extraActorIds, String label) {
        if (!canAccessRecord(ownerId, extraActorIds)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    label + " was not found.");
        }
    }

    public void assertCanAccessRecord(Long ownerId, String label) {
        assertCanAccessRecord(ownerId, List.of(), label);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // List scope — describes the ownership predicate for DB-pushed queries, and a
    // Java-side fallback filter for endpoints not yet converted to a scoped query.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * SQL-friendly description of the ownership scope for the current request.
     *
     * <p>{@code unrestricted == true} ⇒ apply NO ownership predicate (toggle off, override-holder,
     * or unauthenticated). Otherwise rows must satisfy {@code created_by_user_id = ownerId} (and, for
     * multi-actor domains, an OR against the row's actor columns the caller adds). {@code ownerId} is
     * never null when restricted.
     */
    public record OwnerScope(boolean unrestricted, Long ownerId) {}

    public OwnerScope currentOwnerScope() {
        if (!restrictionApplies()) {
            return new OwnerScope(true, null);
        }
        return new OwnerScope(false, currentUserId());
    }

    /**
     * Java-side ownership filter for list endpoints that fetch-then-filter (mirrors
     * {@code BranchAccessService.filterBranchScoped}). Prefer a DB-pushed predicate on large lists;
     * this is the safety net / small-list path. {@code ownerExtractor} yields the row owner id;
     * {@code actorExtractor} (nullable) yields additional actor ids for owner-or-assignee domains.
     */
    public <T> List<T> filterOwned(
            List<T> items,
            Function<T, Long> ownerExtractor,
            Function<T, Collection<Long>> actorExtractor) {
        if (!restrictionApplies()) {
            return items;
        }
        return items.stream()
                .filter(item -> canAccessRecord(
                        ownerExtractor.apply(item),
                        actorExtractor != null ? actorExtractor.apply(item) : List.of()))
                .toList();
    }

    /** Owner-only convenience overload for single-actor domains. */
    public <T> List<T> filterOwned(List<T> items, Function<T, Long> ownerExtractor) {
        return filterOwned(items, ownerExtractor, null);
    }
}
