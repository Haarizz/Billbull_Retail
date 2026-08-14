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
