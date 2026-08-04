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
    UNEXPECTED_STATE
}
