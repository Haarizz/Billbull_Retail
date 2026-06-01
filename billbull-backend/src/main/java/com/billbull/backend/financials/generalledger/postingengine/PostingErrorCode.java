package com.billbull.backend.financials.generalledger.postingengine;

/**
 * Stable error codes raised by the posting gateway ({@link PostingEngineService}).
 *
 * Codes are part of the API contract: the frontend keys error messaging off the
 * {@code code} carried by {@link PostingException}, so values must remain stable
 * once shipped. See BillBull_Financial_Flow PDF §1 / §4 / §21A.
 */
public enum PostingErrorCode {

    /** Posting date falls inside a Closed accounting period. */
    PERIOD_LOCKED,

    /** Σ debit ≠ Σ credit beyond the rounding tolerance. */
    UNBALANCED_ENTRY,

    /** A mandatory dimension (branch / outlet / cost center) is missing. */
    MISSING_DIMENSION,

    /** A referenced GL account exists but is not active. */
    ACCOUNT_INACTIVE,

    /** Foreign-currency line has no usable exchange rate for its date. */
    INVALID_FX_RATE,

    /** Posting would push a customer past their approved credit limit. */
    CREDIT_LIMIT_BREACH
}
