package com.billbull.backend.pos.auth;

/**
 * The permission that admits a user to the POS till.
 *
 * <p>{@code sales.pos} is the existing till key ("POS Sales" in Roles &amp; Permissions; see
 * {@link com.billbull.backend.security.ModuleCatalog}). The POS transaction endpoints check it with
 * {@code ModulePermissionService.requireCanView}, the same view check the till's route guards make,
 * so a direct API call is held to the rule the UI applies. Before this check those endpoints only
 * required authentication, and any signed-in user could ring up a sale over the API.
 *
 * <p>The check is deliberately view, not create: the UI admits on view, and every seeded role that
 * reaches the till today holds {@code sales} view. Supervisor overrides, day close, variance and
 * closure authorization, reprint and POS Administration keep their own, separate checks.
 */
public final class PosTillPermission {

    public static final String MODULE = "sales.pos";

    private PosTillPermission() {
    }
}
