package com.billbull.backend.sales.returns;

public enum SalesReturnStatus {

    /** Being built. Nothing is posted and the row is freely editable. */
    DRAFT,

    /**
     * Posted. Stock, journals, the receivable allocation and any settlement have all happened.
     * The row is immutable from here — the only way out is {@link #REVERSED}.
     */
    APPROVED,

    /**
     * A draft abandoned before approval. No side effects were ever posted, so there is nothing
     * to unwind. Distinct from {@link #REVERSED} on purpose: this status means "never happened",
     * not "happened and was undone".
     */
    CANCELLED,

    /**
     * An approved return that has been unwound by {@code SalesReturnReversalService}: contra
     * journals posted, stock taken back out, the receivable allocation reversed, any voucher
     * cancelled and any drawer payout compensated.
     *
     * <p>The original return's rows are left exactly as they were. A reversal is a new set of
     * entries, never an edit of the old ones, so the audit trail still shows what was originally
     * posted and what undid it — the same rule
     * {@code SalesReturnCreditApplicationStatus.REVERSED} follows for allocations.
     *
     * <p>Reporting treats REVERSED as out of scope: it is not an approved return, so it drops
     * out of return totals, and the contra journals remove its effect from the GL.
     */
    REVERSED
}
