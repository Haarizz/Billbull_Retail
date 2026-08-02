package com.billbull.backend.pos.admin;

/** What kind of record a {@link CorrectionRequest} corrects. Deliberately covers every
 *  target named in the POS Administration architectural review (docs/
 *  pos-administration-architecture-review-2026-07-29.md §4) even though Phase 1 only
 *  wires up the generic request/approval lifecycle — later phases add the executors
 *  per target type without needing schema changes here. */
public enum CorrectionTargetType {
    SALES_INVOICE,
    SALES_RETURN,
    RECEIPT_VOUCHER,
    CUSTOMER_ADVANCE,
    CASH_MOVEMENT,
    POS_SESSION,
    X_REPORT,
    Z_REPORT,
    DAY_CLOSE
}
