package com.billbull.backend.pos.checkout;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionStatus;

/**
 * Pre-write session rules for {@code POST /api/pos/checkout} (Phase 0 / M1).
 *
 * <h3>Why this exists</h3>
 * M0 proved on a disposable clone that a checkout naming a CLOSED or SUSPENDED session was
 * accepted in full. The invoice, Delivery Note, stock movement, GL, Payment and Receipt Voucher
 * were all written, and the Payment was attributed to the closed session. Nothing on that path
 * refused it: {@code SalesInvoiceService.createSalesPaymentForInvoice} calls the one-argument
 * {@code PaymentService.savePayment}, so {@code PosDrawerSessionValidator} never runs for a till
 * sale, and {@code incrementSessionTotals} silently updates nothing for a non-OPEN session.
 * These rules are therefore the authoritative check. They run before the first write, so a
 * refusal leaves nothing behind.
 *
 * <h3>Rules</h3>
 * <ul>
 *   <li>A supplied {@code sessionId} must name an existing session ({@link Code#SESSION_NOT_FOUND}).
 *       Each tenant has its own database, so existing means existing in this tenant.</li>
 *   <li>That session must belong to the branch the server resolved for this user, and to the
 *       request's {@code branchId} when one is sent ({@link Code#SESSION_BRANCH_MISMATCH}). The
 *       invoice is stamped with the resolved branch, so a session of another branch would book
 *       this branch's sale into that branch's drawer.</li>
 *   <li>The session must be {@code OPEN} ({@link Code#SESSION_NOT_OPEN}). This is checked
 *       <em>after</em> the existing continuation and close-workflow gates, so those keep their
 *       own, more specific 409s.</li>
 *   <li>A checkout with no session may not collect tender ({@link Code#SESSION_REQUIRED}). Money
 *       taken at a till must land in a drawer. A tenderless checkout without a session, such as a
 *       delivery order the till sends with {@code sessionId: currentSession?.id || null}, keeps
 *       working as before.</li>
 * </ul>
 *
 * <h3>What this is not</h3>
 * The first use of these rules is an ordinary read made before the writes, <b>not</b> a lock. Since
 * M2 the same rules run a second time inside the checkout claim, on the session row while it is
 * locked ({@code PosCheckoutAttemptService#claim}), and close, begin-closure and suspend refuse while
 * the claimed attempt is open. That second run is what makes a concurrent close safe; this first one
 * keeps the cheap early refusal. There is deliberately no switch that turns these rules off.
 */
final class PosCheckoutSessionGuard {

    /** Stable machine-readable refusal codes, sent as {@code code} in the 409 body. */
    enum Code { SESSION_NOT_FOUND, SESSION_NOT_OPEN, SESSION_BRANCH_MISMATCH, SESSION_REQUIRED }

    private static final double ZERO_TOLERANCE = 0.001;

    /** A refused checkout. {@link #body()} is the JSON returned to the till. */
    record Refusal(Code code, String message, Long sessionId, String sessionStatus,
                   Long sessionBranchId, Long requestBranchId, Long resolvedBranchId) {

        Map<String, Object> body() {
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("code", code.name());
            b.put("message", message);
            b.put("sessionId", sessionId);
            b.put("sessionStatus", sessionStatus);
            b.put("recorded", false);
            return b;
        }

        /** One line for the POS audit trail. */
        String auditDetail() {
            return code + ": session=" + sessionId + " status=" + sessionStatus
                    + " sessionBranch=" + sessionBranchId + " requestBranch=" + requestBranchId
                    + " resolvedBranch=" + resolvedBranchId;
        }
    }

    private PosCheckoutSessionGuard() {}

    /** {@code sessionId} was supplied but no such session exists. */
    static Refusal missing(Long sessionId) {
        return new Refusal(Code.SESSION_NOT_FOUND,
                "POS session " + sessionId + " was not found, so this sale was not recorded. "
                        + "Reload the till and open a session before trying again.",
                sessionId, null, null, null, null);
    }

    /**
     * Branch ownership. {@code resolvedBranchId} is the branch the server will stamp on the
     * invoice; when it cannot be resolved the checkout is refused rather than assumed.
     */
    static Optional<Refusal> checkBranch(PosCheckoutRequest request, PosSession session, Long resolvedBranchId) {
        Long sessionBranch = session.getBranchId();
        Long requestBranch = request.getBranchId();
        boolean mismatch = sessionBranch == null
                || resolvedBranchId == null
                || !sessionBranch.equals(resolvedBranchId)
                || (requestBranch != null && !sessionBranch.equals(requestBranch));
        if (!mismatch) return Optional.empty();
        return Optional.of(new Refusal(Code.SESSION_BRANCH_MISMATCH,
                "POS session " + session.getId() + " does not belong to the branch this sale is being recorded in, "
                        + "so the sale was not recorded. Switch the till to the session's branch or open a session here.",
                session.getId(), statusOf(session), sessionBranch, requestBranch, resolvedBranchId));
    }

    /** The session must be OPEN. CLOSED and SUSPENDED are refused. */
    static Optional<Refusal> checkOpen(PosSession session) {
        if (session.getStatus() == PosSessionStatus.OPEN) return Optional.empty();
        return Optional.of(new Refusal(Code.SESSION_NOT_OPEN,
                "POS session " + session.getId() + " is " + statusOf(session) + ", so this sale was not recorded. "
                        + (session.getStatus() == PosSessionStatus.SUSPENDED
                                ? "Resume the session, then settle the sale again."
                                : "Open a new session, then settle the sale again."),
                session.getId(), statusOf(session), session.getBranchId(), null, null));
    }

    /** No session supplied. Refused only when the checkout would record a payment. */
    static Optional<Refusal> checkSessionless(PosCheckoutRequest request) {
        if (!collectsTender(request)) return Optional.empty();
        return Optional.of(new Refusal(Code.SESSION_REQUIRED,
                "A sale that takes payment needs an open POS session, so this sale was not recorded. "
                        + "Open a session, then settle the sale again.",
                null, null, null, request.getBranchId(), null));
    }

    /**
     * Whether the checkout would record at least one Payment. Mirrors
     * {@link PosPaymentAllocationResolver#resolve}: explicit allocations win over the legacy
     * scalars, and a CREDIT allocation records nothing.
     */
    static boolean collectsTender(PosCheckoutRequest request) {
        List<PosPaymentAllocation> allocations = request.getPaymentAllocations();
        if (allocations != null && !allocations.isEmpty()) {
            for (PosPaymentAllocation a : allocations) {
                if (a == null || a.getAmount() == null || a.getAmount() <= ZERO_TOLERANCE) continue;
                if (PosPaymentAllocationType.parse(a.getType()) != PosPaymentAllocationType.CREDIT) return true;
            }
            return false;
        }
        if (positive(request.getCashAmount()) || positive(request.getCardAmount())
                || positive(request.getOnlineAmount()) || positive(request.getAmountTendered())) {
            return true;
        }
        if (request.getCardLegs() != null) {
            for (PosCheckoutRequest.PosCardLeg leg : request.getCardLegs()) {
                if (leg != null && positive(leg.getAmount())) return true;
            }
        }
        return false;
    }

    private static boolean positive(Double v) {
        return v != null && v > ZERO_TOLERANCE;
    }

    private static String statusOf(PosSession session) {
        return Objects.toString(session.getStatus(), null);
    }
}
