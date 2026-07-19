package com.billbull.backend.common.ownership;

/**
 * Per-request ownership scope, populated by {@code JwtFilter} from the JWT {@code userId} claim and
 * a {@code VIEW_ALL_RECORDS} permission lookup. Mirrors {@code security.BranchContextHolder}.
 *
 * <p>Read by {@link OwnershipScope} (static accessor) and {@link OwnershipAuditListener} (persist-time
 * owner stamping). Kept as a {@link ThreadLocal} record so downstream services never re-parse the
 * token or re-query permissions.
 *
 * <p>{@code viewAll == true} means the current principal holds the ownership override (admin /
 * supervisor / manager) and must NOT be ownership-restricted — they see every user's records,
 * subject only to branch scope. When the ownership feature toggle is off, the filter resolver
 * treats everyone as {@code viewAll} so behaviour is byte-identical to today.
 */
public final class OwnershipContextHolder {

    /**
     * @param userId  authenticated principal's stable user id (from the JWT {@code userId} claim);
     *                null for unauthenticated/system threads.
     * @param viewAll true when the principal holds the {@code VIEW_ALL_RECORDS} override, or the
     *                feature toggle is off — either way ownership filtering does not apply to them.
     */
    public record OwnershipContext(Long userId, boolean viewAll) {}

    private static final ThreadLocal<OwnershipContext> CONTEXT = new ThreadLocal<>();

    private OwnershipContextHolder() {}

    public static void set(OwnershipContext ctx) {
        CONTEXT.set(ctx);
    }

    public static OwnershipContext get() {
        return CONTEXT.get();
    }

    public static void clear() {
        CONTEXT.remove();
    }

    /** Current principal's user id, or {@code null} when unauthenticated/system. */
    public static Long currentUserId() {
        OwnershipContext ctx = CONTEXT.get();
        return ctx != null ? ctx.userId() : null;
    }
}
