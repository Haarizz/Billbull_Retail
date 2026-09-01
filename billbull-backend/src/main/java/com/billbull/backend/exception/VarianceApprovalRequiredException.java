package com.billbull.backend.exception;

import java.math.BigDecimal;

/**
 * Thrown when a session close is refused because its cash discrepancy exceeds the branch
 * threshold and no valid supervisor authorization was presented.
 *
 * <p>Carries the figures rather than only a sentence so the approval UI can render the exact
 * financial state the server is refusing on — expected, counted, variance, threshold — without
 * recomputing any of it. Every number a cashier or supervisor sees on that panel therefore comes
 * from the same reconciliation the close was evaluated against, which is the whole point: a
 * client that derived its own would be showing one figure and approving another.
 *
 * <p>Modelled on {@link ReconciliationException}, which already carries a structured breakdown
 * for the same reason.
 */
public class VarianceApprovalRequiredException extends RuntimeException {

    private final Long sessionId;
    private final BigDecimal expectedCash;
    private final BigDecimal countedCash;
    private final BigDecimal cashDifference;
    private final BigDecimal threshold;

    public VarianceApprovalRequiredException(Long sessionId, BigDecimal expectedCash,
                                             BigDecimal countedCash, BigDecimal cashDifference,
                                             BigDecimal threshold, String message) {
        super(message);
        this.sessionId = sessionId;
        this.expectedCash = expectedCash;
        this.countedCash = countedCash;
        this.cashDifference = cashDifference;
        this.threshold = threshold;
    }

    public Long getSessionId() { return sessionId; }
    public BigDecimal getExpectedCash() { return expectedCash; }
    public BigDecimal getCountedCash() { return countedCash; }

    /** Signed: negative is short, positive is over. */
    public BigDecimal getCashDifference() { return cashDifference; }

    public BigDecimal getThreshold() { return threshold; }

    public String getVarianceDirection() {
        if (cashDifference == null) return null;
        return cashDifference.signum() < 0 ? "SHORT" : "OVER";
    }
}
