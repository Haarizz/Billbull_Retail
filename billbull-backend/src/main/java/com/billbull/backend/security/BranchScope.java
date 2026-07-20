package com.billbull.backend.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Read-only view over the per-request {@link BranchContextHolder}. Repositories
 * and services opt in by calling {@link #currentBranchId()} or
 * {@link #assertCanAccess(Long)} where they would otherwise pass a hard-coded
 * branch filter.
 */
public final class BranchScope {

    private BranchScope() {}

    /**
     * The branch the current request is acting on, or {@code null} for "all branches".
     *
     * <p>"All Branches" is a VIEW state, not a role: an admin who has narrowed the Branch Selector
     * to a specific branch has a non-null {@code activeBranchId} and IS acting on that branch, even
     * though their token carries the admin-derived {@code isAllBranches=true} capability flag. Only
     * the true consolidated view (no specific branch selected → {@code activeBranchId == null})
     * counts as all-branches here. This is intentionally decoupled from {@link #isAllBranches()},
     * which answers the different question "can this user reach every branch" (used by access
     * checks and the branch-selector list — those must stay true for admins regardless of the
     * active selection).
     */
    public static Long currentBranchId() {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        return ctx != null ? ctx.activeBranchId() : null;
    }

    /**
     * True when a branch filter must be applied to the current query — i.e. a specific branch is
     * active. Keyed off {@code activeBranchId}, NOT {@code isAllBranches}, so an admin who selected
     * a specific branch gets branch-scoped reads/writes (see {@link #currentBranchId()}).
     */
    public static boolean applies() {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        return ctx != null && ctx.activeBranchId() != null;
    }

    public static boolean isAllBranches() {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        return ctx != null && ctx.isAllBranches();
    }

    /** Throws 403 if the current user can't touch records in {@code branchId}. */
    public static void assertCanAccess(Long branchId) {
        if (branchId == null) {
            return;
        }
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (ctx == null || ctx.isAllBranches()) {
            return;
        }
        if (!ctx.allowedBranchIds().contains(branchId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This branch is not accessible in the current session.");
        }
    }
}
