package com.billbull.backend.sales.voucher;

/**
 * Lifecycle of a {@link CreditVoucher}.
 *
 * <p>Status is derived from the balance on every redemption rather than set independently, so it
 * can never contradict the money — see {@link CreditVoucher#recalculateStatus()}.
 *
 * <p>{@link #EXPIRED} is a bookkeeping convenience only. Redemption eligibility is decided by
 * comparing the expiry date to the current date at redemption time, so a voucher whose status has
 * not yet been swept is still correctly refused.
 */
public enum CreditVoucherStatus {

    /** Issued, in date, nothing redeemed yet. */
    ACTIVE,

    /** Some balance consumed, some remaining. */
    PARTIALLY_REDEEMED,

    /** Balance exhausted. Terminal — a fully redeemed voucher is never reopened. */
    FULLY_REDEEMED,

    /** Past its expiry date. Set by a sweep; never the sole basis for refusing redemption. */
    EXPIRED,

    /** Withdrawn by an authorized user. Terminal, and never redeemable. */
    CANCELLED;

    /** True when the status itself permits redemption (date and balance are checked separately). */
    public boolean isRedeemable() {
        return this == ACTIVE || this == PARTIALLY_REDEEMED;
    }

    /** True when no further change to this voucher is possible. */
    public boolean isTerminal() {
        return this == FULLY_REDEEMED || this == CANCELLED;
    }
}
