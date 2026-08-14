package com.billbull.backend.sales.voucher;

/**
 * The kinds of entry in a voucher's history ledger ({@link CreditVoucherTransaction}).
 *
 * <p>The balance on {@link CreditVoucher} is a materialised running total; this ledger is the
 * audit trail behind it. Every change to a voucher's balance writes one of these, so
 * "where did this balance come from" is always answerable.
 */
public enum CreditVoucherTransactionType {

    /** Voucher created from a Sales Return. Always the first entry, for the full face value. */
    ISSUED,

    /** Balance consumed against a sale at POS. */
    REDEEMED,

    /** Voucher withdrawn; remaining balance written off. */
    CANCELLED,

    /** Manual balance correction by an authorized user. */
    ADJUSTED
}
