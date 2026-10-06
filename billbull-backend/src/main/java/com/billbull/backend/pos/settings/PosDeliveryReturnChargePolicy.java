package com.billbull.backend.pos.settings;

/**
 * What happens to an invoice's delivery charge when the goods come back on a delivery return.
 *
 * <p>The goods themselves are always credited by the return lines. The delivery charge is not a
 * return line — it is a service the business may or may not consider rendered once the driver
 * has made the trip — so it needs a policy of its own rather than an implicit answer.
 *
 * <p>The choice is per-branch (see {@code PosSettings#deliveryReturnChargePolicy}) because it is
 * a commercial decision, not a technical one: a branch delivering white goods across the emirate
 * charges for the trip; a branch delivering flowers down the road does not.
 *
 * <p>It also decides whether the order leaves the Delivery Settlement list. {@link #WAIVE}
 * zeroes the charge, so a fully returned order owes nothing and is closed out. {@link #RETAIN}
 * leaves the charge outstanding, so the order stays in the list as a small balance the cashier
 * still has to collect — which is the whole point of retaining it.
 */
public enum PosDeliveryReturnChargePolicy {

    /** Cancel the delivery charge along with the goods. A fully returned order owes nothing. */
    WAIVE("Waive the delivery charge"),

    /** Keep the delivery charge payable. A fully returned order stays open for that amount. */
    RETAIN("Keep the delivery charge payable"),

    /** The cashier decides per order, on the return dialog. Defaults to waiving. */
    ASK("Ask the cashier each time");

    private final String label;

    PosDeliveryReturnChargePolicy(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /** Resolves a stored/posted value, falling back to {@link #WAIVE} for anything unknown. */
    public static PosDeliveryReturnChargePolicy fromCode(String code) {
        if (code == null || code.isBlank()) return WAIVE;
        for (PosDeliveryReturnChargePolicy p : values()) {
            if (p.name().equalsIgnoreCase(code.trim())) return p;
        }
        return WAIVE;
    }
}
