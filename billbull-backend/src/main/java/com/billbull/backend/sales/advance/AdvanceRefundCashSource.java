package com.billbull.backend.sales.advance;

/**
 * Where the physical cash for an advance refund comes out of.
 *
 * <p>An advance refund paid in notes can legitimately originate in two different places, and
 * they reconcile against different things:
 *
 * <ul>
 *   <li>{@link #POS_DRAWER} — a cashier pays the customer from a till. This is POS cash: it
 *       must reduce that session's Expected Cash, so it requires a declared drawer session and
 *       books a {@code DROP_OUT}.</li>
 *   <li>{@link #BACK_OFFICE} — an administrator pays the customer from the office safe or petty
 *       cash. No POS drawer is involved, so it takes no part in POS cash reconciliation and
 *       books no drawer movement.</li>
 * </ul>
 *
 * <h3>Why this is declared rather than derived</h3>
 * The obvious shortcut — "a session was supplied, so it is a till refund; none was supplied, so
 * it is back-office" — reintroduces exactly the defect this whole change set exists to remove.
 * Under that rule a POS client that simply forgets to send its session silently becomes a
 * back-office refund: the notes leave the till, no drawer movement is booked, and the session
 * closes short with nothing to explain it. That is the same shape as the original
 * credit-receipt defect, just relocated.
 *
 * <p>Making the source an explicit statement means a caller that supplies neither a session nor
 * a source is <em>rejected</em>, not quietly reclassified. Absence of information can no longer
 * masquerade as a business decision.
 *
 * <p>This is not session inference in either direction: the server never discovers which drawer
 * (or which safe) the money came from. It only decides whether what the caller stated is
 * internally consistent.
 */
public enum AdvanceRefundCashSource {

    /** Paid from a POS till. Requires a declared, open drawer session; books a DROP_OUT. */
    POS_DRAWER,

    /** Paid from the office safe / petty cash. Must carry no POS session; books no movement. */
    BACK_OFFICE;

    /**
     * Lenient parse of the wire value, mirroring {@code PosPaymentAllocationType#parse}.
     *
     * @return the matching source, or {@code null} when the value is null/blank/unrecognised
     */
    public static AdvanceRefundCashSource parse(String raw) {
        if (raw == null) return null;
        String v = raw.trim().toUpperCase(java.util.Locale.ROOT).replace(' ', '_').replace('-', '_');
        if (v.isEmpty()) return null;
        return switch (v) {
            case "POS_DRAWER", "POS", "DRAWER", "TILL" -> POS_DRAWER;
            case "BACK_OFFICE", "BACKOFFICE", "OFFICE", "SAFE", "PETTY_CASH" -> BACK_OFFICE;
            default -> null;
        };
    }
}
