package com.billbull.backend.sales.returns;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Authoritative §9 eligibility verdict for one invoice, plus every sold line with its
 * returnable ceiling. This is the single payload the shared Sales Return screen loads after
 * the user picks an invoice — one round trip for the whole two-pane UI (§10).
 *
 * <p>The frontend may render {@link #eligible} however it likes, but it is a snapshot: the
 * same checks run again inside the confirmation transaction under row locks (§29), so a
 * return that looked eligible here can still be rejected at confirm time. That is by design.
 */
public class ReturnEligibilityResponse {

    /** False when the invoice cannot be returned against at all. Lines are still returned
     *  for display so the cashier can see what was sold. */
    public boolean eligible;

    /** Machine-readable code for the blocking condition, null when eligible. */
    public String ineligibleCode;

    /** Human-readable explanation shown to the cashier, null when eligible. */
    public String ineligibleReason;

    /** Non-blocking advisories (e.g. "invoice is 45 days old"), always safe to display. */
    public List<String> warnings = new ArrayList<>();

    // ----- Invoice header snapshot for the §8 summary strip -----

    public Long invoiceId;
    public String invoiceNumber;
    public String receiptNumber;
    public LocalDate invoiceDate;
    public String customerCode;
    public String customerName;
    public String customerMobile;
    public String branchName;
    public Long branchId;
    public String salesperson;
    public String paymentMode;
    public BigDecimal invoiceTotal;
    public String status;

    /**
     * True when the sale was anonymous — no customer code, the POS walk-in placeholder, or a
     * code with no Customer master row. Drives which refund methods are offered (§14): a
     * walk-in has no ledger to post Customer Credit to, but Credit Voucher works fine because
     * it is bearer credit.
     */
    public boolean walkInCustomer;

    /** Refund method values that cannot be used on this invoice, mapped to the reason why. */
    public java.util.Map<String, String> blockedRefundMethods = new java.util.LinkedHashMap<>();

    // ----- The economic split (Phase 2 §14) -----
    //
    // Server-derived, so the screen never computes them. Until the cashier has chosen lines
    // there is no return value yet, so these describe the FULL remaining returnable value of
    // the invoice: the worst case the cashier could reach. The screen recomputes the display
    // split as lines are picked by applying the same min() against invoiceOutstanding, and the
    // server computes the authoritative one again at approval under the invoice row lock. The
    // figure that matters for enabling a refund method before any line is chosen is
    // invoiceOutstanding, which is the only one of these the client cannot derive.

    /**
     * Canonical effective outstanding of this invoice:
     * {@code max(0, invoiceTotal - receipts - advance applications - return credits applied)}.
     *
     * <p>The one figure the refund-method rules turn on. Already net of earlier return credits,
     * so two successive returns against the same part-paid invoice cannot both claim the same
     * unpaid portion.
     */
    public BigDecimal invoiceOutstanding;

    /** Return credit already applied to this invoice by earlier approved returns. */
    public BigDecimal returnCreditApplied;

    /**
     * Value of everything still returnable on this invoice — the ceiling for
     * {@link #maxPaidPortion} below. Not a prediction of any particular return.
     */
    public BigDecimal returnableValue;

    /**
     * {@code min(returnableValue, invoiceOutstanding)} — the most of the remaining returnable
     * value that could become a receivable credit rather than a refund.
     */
    public BigDecimal maxUnpaidPortion;

    /**
     * {@code returnableValue - maxUnpaidPortion} — the most that could ever be paid back on
     * this invoice. <b>Zero means no money-moving refund method is legitimate at all</b>,
     * whatever the cashier selects, because nothing on this invoice has been paid for yet.
     */
    public BigDecimal maxPaidPortion;

    /**
     * True when {@link #maxPaidPortion} is zero: cash, card, bank and voucher refunds are all
     * impossible on this invoice and the only settlement is the receivable allocation. The
     * reason is in {@link #blockedRefundMethods} for each affected method.
     */
    public boolean refundBlockedUnpaidInvoice;

    /** Original invoice VAT mode. Drives how the return reverses tax (§13). */
    public boolean taxInclusive;

    /** POS provenance of the original sale, when it was a POS transaction. */
    public Long posSessionId;
    public String posTerminalId;
    public String posCounterName;

    // ----- Return history and policy -----

    /** Return numbers already raised against this invoice. */
    public List<String> existingReturnNumbers = new ArrayList<>();

    /** Days between the invoice date and today. */
    public long invoiceAgeDays;

    /** Configured return window in days; null when unlimited. */
    public Integer returnWindowDays;

    /** True when the window has lapsed — a return is still possible but needs approval (§15). */
    public boolean returnWindowExpired;

    /** True when confirming this return will require supervisor authorization. */
    public boolean authorizationRequired;

    /** Why authorization is required, null when it is not. */
    public String authorizationReason;

    // ----- The sold lines -----

    public List<ReturnEligibilityLine> lines = new ArrayList<>();

    /** Total units still returnable across all lines. */
    public int totalReturnableQty;

    public static ReturnEligibilityResponse ineligible(String code, String reason) {
        ReturnEligibilityResponse r = new ReturnEligibilityResponse();
        r.eligible = false;
        r.ineligibleCode = code;
        r.ineligibleReason = reason;
        return r;
    }
}
