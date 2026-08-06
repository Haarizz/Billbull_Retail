package com.billbull.backend.sales.payment;

/**
 * One thing that does not add up about how an invoice was paid.
 *
 * <p>Findings are descriptive, not fatal: a diagnostic run reports everything it sees so a
 * support engineer gets the whole picture in one look, rather than the first problem and a
 * stack trace. Each carries a stable {@link #getCode()} so alerting can key off it, and a
 * message that states the actual numbers — "expected 156.45, found 140.00" is actionable in a
 * way that "reconciliation failed" is not.
 */
public class PaymentReconciliationFinding {

    /** Stable identifiers — safe to alert on, unlike message text. */
    public enum Code {
        /** No tender rows at all for an invoice the ledger says was paid. */
        MISSING_PAYMENT_ROWS,
        /** Recorded tender does not equal what the invoice says was paid. */
        RECEIVED_DOES_NOT_MATCH_AMOUNT_PAID,
        /** Received + still-outstanding does not equal the invoice total. */
        TOTALS_DO_NOT_RECONCILE,
        /** The invoice's stored payment-mode label disagrees with the recorded tenders. */
        STORED_SUMMARY_STALE,
        /** Two tender rows look like the same payment recorded twice. */
        DUPLICATE_PAYMENT_ROW,
        /** A tender row carries a zero or negative amount. */
        NON_POSITIVE_ALLOCATION,
        /** Recorded tender exceeds the invoice total by more than rounding. */
        OVER_ALLOCATED,
        /** The invoice's stored label still says "Mixed", which no current code path writes. */
        LEGACY_MIXED_LABEL,
    }

    /** How much attention a finding deserves. */
    public enum Severity {
        /** Books disagree — money may be misstated. Investigate. */
        ERROR,
        /** Cosmetic or historical; the figures still add up. */
        WARNING,
        /** Context only. */
        INFO,
    }

    private final Code code;
    private final Severity severity;
    private final String message;

    public PaymentReconciliationFinding(Code code, Severity severity, String message) {
        this.code = code;
        this.severity = severity;
        this.message = message;
    }

    public Code getCode() { return code; }
    public Severity getSeverity() { return severity; }
    public String getMessage() { return message; }

    public boolean isError() { return severity == Severity.ERROR; }

    @Override
    public String toString() {
        return severity + " " + code + ": " + message;
    }
}
