package com.billbull.backend.pos.printer;

/**
 * Outcome of checking a printer byte stream against a command policy.
 *
 * <p>{@code drawerPulse} is set on an otherwise allowed ESC/POS job that opens a cash drawer; the
 * caller must then pass {@link com.billbull.backend.pos.cashdrawer.PosDrawerKickAuthorizer} before
 * anything is sent. A refused job carries where it was refused ({@code offset}), the command
 * ({@code command}) and why ({@code category}, e.g. {@code POWER}, {@code NV_WRITE}).
 */
record PrintCommandVerdict(boolean allowed, boolean drawerPulse, int offset, String command, String category) {

    static final PrintCommandVerdict ALLOWED = new PrintCommandVerdict(true, false, -1, null, null);
    static final PrintCommandVerdict ALLOWED_WITH_DRAWER_PULSE = new PrintCommandVerdict(true, true, -1, null, null);

    static PrintCommandVerdict refused(int offset, String command, String category) {
        return new PrintCommandVerdict(false, false, offset, command, category);
    }
}
