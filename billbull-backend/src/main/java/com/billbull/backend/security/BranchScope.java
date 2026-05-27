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

    /** The branch the current request is acting on, or {@code null} for "all branches" (admin). */
    public static Long currentBranchId() {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (ctx == null || ctx.isAllBranches()) {
            return null;
        }
        return ctx.activeBranchId();
    }

    /** True when a branch filter must be applied to the current query. */
    public static boolean applies() {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        return ctx != null && !ctx.isAllBranches() && ctx.activeBranchId() != null;
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
