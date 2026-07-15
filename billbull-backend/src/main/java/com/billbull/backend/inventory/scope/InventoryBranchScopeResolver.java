package com.billbull.backend.inventory.scope;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.billbull.backend.security.BranchScope;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchAccessService.ListScope;

/**
 * Branch-Level Inventory Phase 3 — the single decision point for whether an inventory read should
 * be branch-scoped, and to which branches.
 *
 * <p><b>Dormant by design.</b> Nothing calls this yet (Phase 3 introduces it only). Phase 4+ will
 * consult it to choose between the branch-scoped repository variants and the existing unscoped
 * ones. It is gated by {@code inventory.branch-scope.enabled} (default {@code false}), so with the
 * flag off it always reports "not scoped" and the system behaves exactly as before.
 *
 * <p>Scoping applies only when BOTH:
 * <ul>
 *   <li>the tenant has {@code inventory.branch-scope.enabled=true}, AND</li>
 *   <li>{@link BranchScope#applies()} — i.e. a specific branch is active (not admin/All-Branches).</li>
 * </ul>
 * In every other case (flag off, or All-Branches admin view) the resolver reports "not scoped" and
 * callers must use the existing unscoped query path — preserving consolidated admin reporting.
 *
 * <p>When scoping is active, {@link #activeListScope()} returns the {@link ListScope} produced by
 * {@link BranchAccessService#currentListScope()}, whose branch-id set drives the
 * {@code branch_id IN (:ids) OR branch_id IS NULL} predicate (legacy/global {@code NULL} rows stay
 * visible everywhere).
 */
@Component
public class InventoryBranchScopeResolver {

    private final BranchAccessService branchAccessService;
    private final boolean enabled;

    public InventoryBranchScopeResolver(
            BranchAccessService branchAccessService,
            @Value("${inventory.branch-scope.enabled:false}") boolean enabled) {
        this.branchAccessService = branchAccessService;
        this.enabled = enabled;
    }

    /** Whether branch-scoped inventory reads are enabled for this tenant (the master flag). */
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * True when an inventory read should be branch-filtered right now: the flag is on AND a
     * specific branch is active. False for a disabled tenant or an admin All-Branches view.
     */
    public boolean shouldScope() {
        return enabled && BranchScope.applies();
    }

    /**
     * The branch scope to apply, present only when {@link #shouldScope()} is true. When empty,
     * callers must use the existing unscoped query path (no behaviour change). Never returns a
     * scope that would hide data when the flag is off.
     */
    public Optional<ListScope> activeListScope() {
        if (!shouldScope()) {
            return Optional.empty();
        }
        return Optional.of(branchAccessService.currentListScope());
    }
}
