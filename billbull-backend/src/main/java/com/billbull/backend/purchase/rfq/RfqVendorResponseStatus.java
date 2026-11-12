package com.billbull.backend.purchase.rfq;

/** Where a single invited vendor's quotation stands. */
public enum RfqVendorResponseStatus {
    PENDING,
    IN_PROGRESS,
    SUBMITTED,
    REVISION_REQUESTED,
    REVISED,
    DECLINED;

    /** The vendor has answered (with prices, or by declining). */
    public boolean hasResponded() {
        return this == SUBMITTED || this == REVISION_REQUESTED || this == REVISED || this == DECLINED;
    }
}
