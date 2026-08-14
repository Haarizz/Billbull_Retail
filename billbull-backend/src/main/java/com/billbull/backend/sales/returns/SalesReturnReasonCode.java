package com.billbull.backend.sales.returns;

/**
 * Why the customer returned the line (§12). Stored per return line in
 * {@link SalesReturnItem#getReturnReason()}, which is a free-text column for backward
 * compatibility with rows written before this vocabulary existed — this enum defines the
 * values the UI offers and the backend validates against for new returns.
 *
 * <p>Deliberately distinct from {@link SalesReturnCondition}: condition describes the
 * goods (and drives inventory), reason describes the customer's motive (and drives
 * reporting). "Damaged Goods" as a reason can accompany a GOOD condition when the
 * customer was mistaken; the inventory outcome follows the condition, not the reason.
 */
public enum SalesReturnReasonCode {

    CUSTOMER_RETURN("Customer Return"),
    WRONG_ITEM("Wrong Item"),
    CHANGED_MIND("Changed Mind"),
    DAMAGED_GOODS("Damaged Goods"),
    DEFECTIVE("Defective"),
    EXPIRED("Expired"),
    PRICE_ISSUE("Price Issue"),
    OTHER("Other");

    private final String label;

    SalesReturnReasonCode(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /** Resolves a stored string to a known code, or null when it predates this vocabulary. */
    public static SalesReturnReasonCode fromCode(String code) {
        if (code == null || code.isBlank()) return null;
        for (SalesReturnReasonCode r : values()) {
            if (r.name().equalsIgnoreCase(code.trim())) return r;
        }
        return null;
    }
}
