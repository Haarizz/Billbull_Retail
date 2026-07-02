package com.billbull.backend.exception;

import java.util.Map;

/**
 * Thrown when POS close-day reconciliation (sales or cash) fails. Carries a structured
 * breakdown map (cash/card/credit/online/returns/rounding, expected vs. actual, variance)
 * so the frontend can render the exact cause instead of a bare variance number.
 */
public class ReconciliationException extends RuntimeException {

    private final String stage;
    private final Map<String, Object> breakdown;

    public ReconciliationException(String stage, String message, Map<String, Object> breakdown) {
        super(message);
        this.stage = stage;
        this.breakdown = breakdown;
    }

    public String getStage() {
        return stage;
    }

    public Map<String, Object> getBreakdown() {
        return breakdown;
    }
}
