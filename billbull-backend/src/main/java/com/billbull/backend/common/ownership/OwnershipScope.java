package com.billbull.backend.common.ownership;

/**
 * Read-only static view over the per-request {@link OwnershipContextHolder}, mirroring
 * {@code security.BranchScope}. Services and the filter aspect opt in by calling {@link #applies()}
 * and {@link #currentUserId()} rather than re-deriving ownership from the token/permissions.
 *
 * <p>Enforcement itself (assert / predicate composition, and the feature-toggle read) lives in
 * {@link OwnershipAccessService} — a Spring bean — because it needs the injected
 * {@code ownership.filtering.enabled} property. This class only exposes the already-resolved
 * per-request context, and never throws.
 */
public final class OwnershipScope {

    private OwnershipScope() {}

    /**
     * True when the current request must be ownership-restricted — i.e. there is an authenticated
     * user id AND the principal does NOT hold the {@code VIEW_ALL_RECORDS} override.
     *
     * <p>Note the resolver in {@code JwtFilter} sets {@code viewAll = true} whenever the feature
     * toggle is off, so {@code applies()} is always false in that case and behaviour matches today.
     * Callers that need the toggle state directly use {@link OwnershipAccessService#filteringEnabled()}.
     */
    public static boolean applies() {
        OwnershipContextHolder.OwnershipContext ctx = OwnershipContextHolder.get();
        return ctx != null && ctx.userId() != null && !ctx.viewAll();
    }

    /** The current principal's user id, or {@code null} when unauthenticated/system. */
    public static Long currentUserId() {
        return OwnershipContextHolder.currentUserId();
    }

    /** True when the principal holds the ownership override (or the toggle is off). */
    public static boolean viewAll() {
        OwnershipContextHolder.OwnershipContext ctx = OwnershipContextHolder.get();
        return ctx == null || ctx.viewAll();
    }
}
