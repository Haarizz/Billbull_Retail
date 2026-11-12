package com.billbull.backend.purchase.rfq;

import java.util.EnumSet;
import java.util.Set;

/** Lifecycle of a Request for Quotation (Vendor Price Shares). */
public enum RfqStatus {
    DRAFT,
    SENT,
    AWAITING,
    PARTIAL,
    RECEIVED,
    EVALUATION,
    NEGOTIATION,
    PARTIAL_ORDERED,
    COMPLETED_LPO,
    COMPLETED_NO_LPO,
    CANCELLED,
    REJECTED,
    EXPIRED;

    /** Finished RFQs: no more quotes, negotiations or LPOs. */
    public static final Set<RfqStatus> CLOSED =
            EnumSet.of(COMPLETED_LPO, COMPLETED_NO_LPO, CANCELLED, REJECTED, EXPIRED);

    /** Statuses the response count may move automatically (Sent → Partially responded → Received). */
    public static final Set<RfqStatus> RESPONSE_DRIVEN = EnumSet.of(SENT, AWAITING, PARTIAL, RECEIVED);

    public boolean isClosed() {
        return CLOSED.contains(this);
    }
}
