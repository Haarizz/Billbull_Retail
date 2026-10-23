package com.billbull.backend.pos.settings;

/**
 * How a POS delivery order becomes a sale. Chosen per branch in BillBull Console → Behavior →
 * Delivery Workflow (see {@code PosSettings#deliveryWorkflowMode}).
 *
 * <p>Both modes send the goods out the same way and end the same way — the cashier settles the
 * order by pay mode or returns it from the Delivery Settlement screen. They differ only in when
 * the sale is recognised:
 */
public enum PosDeliveryWorkflowMode {

    /** The invoice is posted when the order goes out for delivery: it is a sale (stock, GL,
     *  sales reports) from that moment, and Delivery Settlement only collects the money. */
    DEFAULT_SETTLEMENT,

    /** Going out for delivery issues a Pro-forma Invoice: a DRAFT sales invoice that holds the
     *  stock but posts nothing and stays out of sales reports. Settling it (by pay mode or by a
     *  return) converts it into the final sales invoice on the settlement date. */
    PI_FLOW;

    /** Resolves a stored/posted value, falling back to {@link #DEFAULT_SETTLEMENT}. */
    public static PosDeliveryWorkflowMode fromCode(String code) {
        if (code == null || code.isBlank()) return DEFAULT_SETTLEMENT;
        for (PosDeliveryWorkflowMode m : values()) {
            if (m.name().equalsIgnoreCase(code.trim())) return m;
        }
        return DEFAULT_SETTLEMENT;
    }
}
