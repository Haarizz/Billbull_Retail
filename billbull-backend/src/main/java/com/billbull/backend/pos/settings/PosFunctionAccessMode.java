package com.billbull.backend.pos.settings;

/**
 * Who may use the POS Functions/Actions buttons (Returns, Layaways, Cash Drawer, Reprint,
 * Delivery Settlement and the rest of the shared action panel).
 *
 * <p>These are the operations a cashier reaches from the right-hand panel in Classic and Cart
 * Focus, and from the Functions slide-over in Compact. They are not all equally harmless — a
 * Return moves money and a Cash Drawer open exposes the till — so a branch can decide how far
 * an ordinary cashier is trusted with them, instead of the product deciding once for everyone.
 *
 * <p>The mode is branch-wide and applies to every screen template, so a branch cannot weaken the
 * rule by switching layouts.
 */
public enum PosFunctionAccessMode {
    /** Any signed-in POS user may use them. The historical behaviour, and the default. */
    ALL_USERS,
    /** Any user may use them, but each use must first be authorized with the supervisor
     *  credential (the PIN or the supervisor password, per {@code supervisorApprovalMode}).
     *  Users who already hold a supervisor role are not asked for their own credential. */
    SUPERVISOR_PASSWORD,
    /** Only users holding a supervisor-capable role may use them at all; for everyone else the
     *  buttons are refused outright, with no credential prompt to work around. */
    SUPERVISOR_ONLY;

    /** Null/blank/unknown -> {@link #ALL_USERS}, so an unconfigured branch keeps today's behaviour. */
    public static PosFunctionAccessMode resolve(String raw) {
        if (raw == null || raw.isBlank()) return ALL_USERS;
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return ALL_USERS;
        }
    }

    public static boolean isValid(String raw) {
        if (raw == null || raw.isBlank()) return true;
        try {
            valueOf(raw.trim().toUpperCase());
            return true;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }
}
