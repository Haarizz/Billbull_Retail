package com.billbull.backend.sales.returns;

/**
 * How the customer is made whole for a return (§14).
 *
 * <p>Replaces the previous arrangement where the refund method was written into
 * {@link SalesReturn#getInternalNotes()} as prose ("Refund method: Cash Back. POS terminal
 * …"), which made it unreportable and unreconcilable.
 *
 * <p>Note the single CASH_REFUND concept: the legacy POS UI offered both "Cash Back" and
 * "Cash Return" for what is one physical cash-out from the drawer. {@link #fromLegacyLabel}
 * folds both onto CASH_REFUND when reading historic rows.
 */
public enum SalesReturnRefundMethod {

    /** Physical cash out of the POS drawer. Requires an open POS session. */
    CASH_REFUND("Cash Refund"),

    /** Reversal against the original card payment, via the existing payment architecture. */
    CARD_REFUND("Card Refund"),

    /** Outbound bank transfer. Only where branch payment configuration supports it. */
    BANK_TRANSFER("Bank Transfer"),

    /** Issues a store-credit voucher. Distinct from a promotional Coupon (§16). */
    CREDIT_VOUCHER("Credit Voucher"),

    /** Credits the customer's account via the existing customer-credit mechanism. */
    CUSTOMER_CREDIT("Customer Credit");

    private final String label;

    SalesReturnRefundMethod(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /** True when settling this method moves physical cash in the drawer. */
    public boolean isCashDrawerAffecting() {
        return this == CASH_REFUND;
    }

    /**
     * Resolves both the enum name and the legacy free-text labels the old POS wizard wrote
     * ("Cash Back", "Cash Return", "Credit Voucher"). Returns null when unrecognisable.
     */
    public static SalesReturnRefundMethod fromLegacyLabel(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim();
        for (SalesReturnRefundMethod m : values()) {
            if (m.name().equalsIgnoreCase(v) || m.label.equalsIgnoreCase(v)) return m;
        }
        // Legacy POS labels that collapsed onto one concept.
        if (v.equalsIgnoreCase("Cash Back") || v.equalsIgnoreCase("Cash Return")
                || v.equalsIgnoreCase("Cash")) {
            return CASH_REFUND;
        }
        if (v.equalsIgnoreCase("Card")) return CARD_REFUND;
        if (v.equalsIgnoreCase("Bank")) return BANK_TRANSFER;
        if (v.equalsIgnoreCase("Voucher")) return CREDIT_VOUCHER;
        if (v.equalsIgnoreCase("Credit")) return CUSTOMER_CREDIT;
        return null;
    }
}
