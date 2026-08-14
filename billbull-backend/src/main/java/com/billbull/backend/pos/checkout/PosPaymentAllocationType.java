package com.billbull.backend.pos.checkout;

/**
 * The kinds of tender a POS checkout can allocate against an invoice.
 *
 * <p>Deliberately does <em>not</em> contain a MIXED member: under the progressive-payment
 * architecture a "mixed" sale is simply a checkout carrying more than one allocation, and the
 * label shown to the user/receipt is derived from the allocations themselves
 * (e.g. "Cash + Visa + Online"). See {@link PosPaymentAllocationResolver#buildSummaryLabel}.
 *
 * <p>It also deliberately does <em>not</em> contain an ADVANCE member. Customer Advance is not a
 * checkout tender: it is a customer-ledger operation, received and applied from the Customer
 * module (Customer Advance Management / Customer Ledger / back-office Financials), where it can
 * be aged, refunded and reconciled against A/R. Letting a till draw one down mid-sale put the
 * same balance behind two different workflows. {@link #isRetiredAdvanceAlias} recognises the
 * label only so a stale terminal gets a clear error instead of "Unknown payment allocation type".
 */
public enum PosPaymentAllocationType {

    /** Physical cash. The only tender allowed to exceed the remaining balance (change is given). */
    CASH,
    /** Card terminal tender. {@code subtype} carries the network (Visa / Mastercard / Amex / ...). */
    CARD,
    /** Online / bank transfer. {@code bankAccountName} selects the receiving CoA bank account. */
    ONLINE,
    /** Balance left on the customer's A/R ledger — not a receipt, so it creates no Payment row. */
    CREDIT,

    /**
     * Store credit redeemed from a Credit Voucher issued by a Sales Return.
     *
     * <p>A payment instrument, not a discount: it settles the invoice at full price by drawing
     * down the liability recognised when the voucher was issued. Modelling it as a discount would
     * understate revenue on this sale and leave the liability on the books forever.
     *
     * <p>{@code reference} carries the voucher code the cashier scanned. Like every non-cash
     * tender it may not exceed the balance due — a voucher worth more than the sale keeps its
     * remainder rather than paying out change.
     */
    VOUCHER;

    /**
     * Lenient parse of the wire value. Accepts the enum names plus the aliases the existing
     * frontend/legacy request fields use, so a client can send either "ONLINE" or
     * "bank_transfer".
     *
     * @return the matching type, or {@code null} when the value is null/blank/unrecognised
     */
    public static PosPaymentAllocationType parse(String raw) {
        if (raw == null) return null;
        String v = raw.trim().toUpperCase().replace(' ', '_').replace('-', '_');
        if (v.isEmpty()) return null;
        switch (v) {
            case "CASH":
                return CASH;
            case "CARD":
            case "CREDIT_CARD":
            case "DEBIT_CARD":
                return CARD;
            case "ONLINE":
            case "BANK":
            case "BANK_TRANSFER":
            case "TRANSFER":
                return ONLINE;
            case "CREDIT":
            case "AR":
            case "ACCOUNTS_RECEIVABLE":
                return CREDIT;
            case "VOUCHER":
            case "CREDIT_VOUCHER":
            case "GIFT_VOUCHER":
            case "STORE_CREDIT":
                return VOUCHER;
            default:
                return null;
        }
    }

    /**
     * True for the allocation labels a pre-Phase-10 terminal used for Customer Advance. Used only
     * to turn a stale client's request into an actionable message pointing at the Customer module
     * — never to accept the allocation.
     */
    public static boolean isRetiredAdvanceAlias(String raw) {
        if (raw == null) return false;
        String v = raw.trim().toUpperCase().replace(' ', '_').replace('-', '_');
        return v.equals("ADVANCE") || v.equals("CUSTOMER_ADVANCE");
    }
}
