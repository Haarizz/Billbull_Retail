package com.billbull.backend.inventory.scope;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Branch-Level Inventory Phase 6B — the single place that encodes master-data branch governance
 * (design §15) and cross-branch reference validation (design §16), so the Department / Sub-Department
 * / Brand / Unit services stay thin and consistent.
 *
 * <p><b>Entirely dormant while {@code inventory.branch-scope.enabled=false}.</b> Every method below
 * either no-ops or returns the "unchanged" answer when scoping is off, so a toggle-off tenant
 * behaves byte-identically to before Phase 6B.
 *
 * <p>Governance (§15): who may create a <i>global</i> (null-branch) master row is configurable —
 * {@code inventory.global-master.creation-enabled} + {@code inventory.global-master.allowed-roles}.
 *
 * <p>Reference validation (§16): a branch-scoped row may reference own-branch or global masters
 * only, never another branch's; a global row may reference only global masters.
 */
@Component
public class MasterDataBranchService {

    private final BranchAccessService branchAccessService;
    private final InventoryBranchScopeResolver scopeResolver;
    private final boolean globalCreationEnabled;
    private final Set<String> globalAllowedRoles;

    public MasterDataBranchService(
            BranchAccessService branchAccessService,
            InventoryBranchScopeResolver scopeResolver,
            @Value("${inventory.global-master.creation-enabled:true}") boolean globalCreationEnabled,
            @Value("${inventory.global-master.allowed-roles:SUPER_ADMIN,ADMIN,BRANCH_ADMIN}") String allowedRoles) {
        this.branchAccessService = branchAccessService;
        this.scopeResolver = scopeResolver;
        this.globalCreationEnabled = globalCreationEnabled;
        this.globalAllowedRoles = new LinkedHashSet<>();
        if (allowedRoles != null) {
            Arrays.stream(allowedRoles.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .forEach(globalAllowedRoles::add);
        }
    }

    /** Whether branch-scoping is active for this request (toggle on + a specific branch active). */
    public boolean scopingActive() {
        return scopeResolver.shouldScope();
    }

    /**
     * Resolve the branch to stamp on a NEW master row (design §15), context-driven so the request
     * DTOs need no new field:
     * <ul>
     *   <li><b>Toggle OFF</b> → returns {@code null}; creation is exactly as today (no stamping, no
     *       governance) — byte-identical.</li>
     *   <li><b>Toggle ON + a specific branch active</b> (a branch user) → stamps that branch
     *       (branch-private item).</li>
     *   <li><b>Toggle ON + All-Branches</b> (an admin) → a global (null-branch) item; governance
     *       ({@link #assertMayCreateGlobal()}) must permit it.</li>
     * </ul>
     */
    public Branch resolveBranchForCreate() {
        if (!scopeResolver.isEnabled()) {
            return null; // toggle off → unchanged behaviour (no branch stamping, no governance)
        }
        if (scopingActive()) {
            // A specific branch is active → branch-private row for that branch.
            return branchAccessService.getRequiredCurrentUserBranch();
        }
        // Toggle on but no specific branch (All-Branches admin) → creating a GLOBAL row: gate it.
        assertMayCreateGlobal();
        return null;
    }

    /** Governance guard (design §15): reject a global-master create the caller isn't allowed to make. */
    public void assertMayCreateGlobal() {
        if (!globalCreationEnabled) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Creating shared/global master data is disabled on this tenant.");
        }
        if (globalAllowedRoles.isEmpty()
                || !branchAccessService.currentUserHasRole(globalAllowedRoles.toArray(new String[0]))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only " + String.join(", ", globalAllowedRoles)
                            + " may create shared/global master data on this tenant.");
        }
    }

    /**
     * Cross-branch reference validation (design §16). A child row with branch {@code childBranchId}
     * (null = global) may reference a parent with branch {@code parentBranchId} only when the parent
     * is global (null) or same-branch. A global child may reference only global parents.
     *
     * <p>No-op when scoping is inactive (toggle off) so existing flows never see a new rejection.
     *
     * @param label human-friendly parent name for the error message (e.g. "Department").
     */
    public void assertMasterReferenceAccessible(Long parentBranchId, Long childBranchId, String label) {
        if (!scopingActive()) {
            return; // toggle off → no new validation
        }
        if (parentBranchId == null) {
            return; // global parent is always referenceable
        }
        // Parent is branch-owned: allowed only if the child is the SAME branch.
        if (childBranchId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A shared/global item cannot reference a branch-specific " + label + ".");
        }
        if (!Objects.equals(parentBranchId, childBranchId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This " + label + " belongs to another branch and cannot be referenced here.");
        }
    }

    /** Convenience: the branch id of a {@link Branch} or null. */
    public static Long branchIdOf(Branch branch) {
        return branch != null ? branch.getId() : null;
    }
}
