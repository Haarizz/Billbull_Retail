package com.billbull.backend.pos.businessdate;

/** Machine-readable reason accompanying a {@link BusinessDayValidationVerdict}. */
public enum BusinessDayBlockingReason {
    /** {@link BusinessDayValidationVerdict#ALLOW} — nothing blocking. */
    NONE,
    /** A previous Business Day, strictly before the Candidate Business Day, has
     *  no matching {@code PosDayClose} row yet. */
    PREVIOUS_BUSINESS_DAY_OPEN,
    /** No previous Business Day is unclosed, but the Candidate Business Day
     *  itself already has a matching {@code PosDayClose} row. */
    BUSINESS_DAY_ALREADY_CLOSED,
    /** The oldest unclosed Business Day is strictly after the Candidate Business
     *  Day — an anomalous ordering that should not occur under correct clock
     *  behavior; never silently allowed or silently blocked. */
    UNEXPECTED_STATE,

    /** The Business Day's extension period has expired, so the Business Day is
     *  {@link BusinessDayPhase#CLOSED} and the branch is waiting for the next
     *  configured start time. A scheduled, self-resolving condition — no supervisor
     *  may reopen the Business Day; the remaining work is session closure and Day
     *  Close — so the message must say when trading resumes rather than reading
     *  like an error. */
    BUSINESS_DAY_CLOSED_AWAITING_NEXT_START
}
