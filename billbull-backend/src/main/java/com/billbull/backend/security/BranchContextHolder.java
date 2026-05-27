package com.billbull.backend.security;

import java.util.Collections;
import java.util.Set;

/**
 * Per-request branch scope, populated by {@code JwtFilter} from the JWT claims
 * and the optional {@code X-Branch-Id} header. Read by {@link BranchScope} so
 * downstream services don't have to re-parse the token.
 */
public final class BranchContextHolder {

    public record BranchContext(Long activeBranchId, Set<Long> allowedBranchIds, boolean isAllBranches) {
        public BranchContext {
            allowedBranchIds = allowedBranchIds == null ? Collections.emptySet() : Set.copyOf(allowedBranchIds);
        }
    }

    private static final ThreadLocal<BranchContext> CONTEXT = new ThreadLocal<>();

    private BranchContextHolder() {}

    public static void set(BranchContext ctx) {
        CONTEXT.set(ctx);
    }

    public static BranchContext get() {
        return CONTEXT.get();
    }

    public static void clear() {
        CONTEXT.remove();
    }
}
