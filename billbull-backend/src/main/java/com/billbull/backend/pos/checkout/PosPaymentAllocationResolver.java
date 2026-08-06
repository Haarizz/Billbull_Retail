package com.billbull.backend.pos.checkout;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Normalises the payment portion of a {@link PosCheckoutRequest} into a single
 * {@link PosPaymentPlan} of ordered {@link ResolvedPaymentAllocation}s.
 *
 * <p>Payment allocations are the canonical model. Every current client sends
 * {@code paymentAllocations}: an ordered list of tenders, each settling part of the invoice
 * until the remaining balance is zero. Multiple allocations of the same type are allowed. Only
 * CASH may exceed the remaining balance (that overpayment is the customer's change); CARD /
 * ONLINE / CREDIT may not.
 *
 * <p>Customer Advance is not a checkout tender — see {@link PosPaymentAllocationType}. Both the
 * allocation type and the legacy {@code advanceAmount} scalar are rejected with a message
 * pointing at the Customer module rather than silently ignored, because ignoring them would
 * post the invoice short by the advance amount.
 *
 * <p>The legacy per-mode scalars ({@code cashAmount}, {@code cardAmount} / {@code cardLegs},
 * {@code onlineAmount}, {@code amountTendered}) are still accepted, and
 * are converted here into the equivalent allocations with identical mode labels, ordering,
 * capping and validation. This exists for one reason: a POS terminal whose browser tab has not
 * been reloaded since the last deploy still posts that shape, and dropping it would make those
 * tills post invoices with no payment recorded. It is a deployment-window compatibility
 * surface, not a second architecture — nothing downstream of {@link PosPaymentPlan} knows
 * which shape arrived. Remove it once every terminal has cycled.
 *
 * <p>The resulting payment-mode label is always derived from the allocations actually present
 * ("Cash", "Cash + Visa", "Cash + Visa + Online + Credit"). The literal word "Mixed" is never
 * produced, and is stripped if a client sends it as {@code combinedPaymentMode}.
 */
@Component
public class PosPaymentAllocationResolver {

    /** Currency rounding tolerance used when comparing tender totals against the invoice total. */
    public static final double ROUNDING_TOLERANCE = 0.01;
    /** Amounts at or below this are treated as "no tender" (matches the pre-existing 0.001 guards). */
    public static final double ZERO_TOLERANCE = 0.001;
    /** Cap on how many card legs one checkout may itemize — a UI/receipt-layout sanity limit. */
    public static final int MAX_CARD_LEGS = 5;

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Structural validation that must run before any invoice row is created, so a malformed
     * payment fails fast rather than leaving a stranded DRAFT invoice behind.
     */
    public void validateStructure(PosCheckoutRequest request) {
        rejectLegacyAdvanceScalar(request);
        if (hasExplicitAllocations(request)) {
            validateAllocationStructure(request.getPaymentAllocations());
        }
        resolveCardLegs(request); // throws on a malformed legacy multi-card split
    }

    /**
     * A stale terminal may still post {@code advanceAmount}. Failing the checkout is the only
     * safe response: honouring it would settle the sale from the customer ledger behind the
     * Customer module's back, and dropping it would post the invoice short by that amount.
     */
    private void rejectLegacyAdvanceScalar(PosCheckoutRequest request) {
        Double advance = request.getAdvanceAmount();
        if (advance != null && advance > ZERO_TOLERANCE) {
            throw badRequest(ADVANCE_RETIRED_MESSAGE);
        }
    }

    static final String ADVANCE_RETIRED_MESSAGE =
            "Customer Advance is no longer a checkout payment method. Receive and apply advances "
            + "from Customer > Customer Advance Management, then settle this sale with "
            + "Cash, Card, Online or Credit.";

    /**
     * Builds the settlement plan for this checkout against the (already computed) invoice total.
     */
    public PosPaymentPlan resolve(PosCheckoutRequest request, double invoiceTotal) {
        return hasExplicitAllocations(request)
                ? resolveFromAllocations(request, invoiceTotal)
                : resolveFromLegacyFields(request, invoiceTotal);
    }

    public boolean hasExplicitAllocations(PosCheckoutRequest request) {
        List<PosPaymentAllocation> list = request.getPaymentAllocations();
        return list != null && !list.isEmpty();
    }

    /** True when the checkout was flagged as a Credit sale by the legacy {@code paymentMode} field. */
    public boolean isCreditCheckout(PosCheckoutRequest request) {
        return "credit".equalsIgnoreCase(request.getPaymentMode());
    }

    /**
     * The single-mode label used when no allocation-derived label applies (invoice creation,
     * delivery-checkout detection). Unchanged from the pre-allocation implementation except that
     * a literal "Mixed" is never returned.
     */
    public String resolvePaymentMode(PosCheckoutRequest req) {
        if (isMeaningfulLabel(req.getCombinedPaymentMode())) return req.getCombinedPaymentMode();
        if (req.getPaymentMode() != null && !isMixed(req.getPaymentMode())) return req.getPaymentMode();
        return "Cash";
    }

    /** Returns the card network name to use as the payment mode (e.g. "Visa", "Card"). */
    public String resolveCardMode(PosCheckoutRequest req) {
        if (req.getCardType() != null && !req.getCardType().isBlank()) return req.getCardType();
        return "Card";
    }

    /**
     * Validates and returns the legacy multi-card split (if any). Empty list means the legacy
     * scalar cardAmount/cardType/cardReference fields drive the (single) card leg instead.
     */
    public List<PosCheckoutRequest.PosCardLeg> resolveCardLegs(PosCheckoutRequest request) {
        List<PosCheckoutRequest.PosCardLeg> legs = request.getCardLegs();
        if (legs == null || legs.isEmpty()) return List.of();

        if (legs.size() > MAX_CARD_LEGS) {
            throw badRequest("A single payment can include at most " + MAX_CARD_LEGS + " card legs.");
        }

        Set<String> seenReferences = new HashSet<>();
        for (PosCheckoutRequest.PosCardLeg leg : legs) {
            if (leg.getCardType() == null || leg.getCardType().isBlank()) {
                throw badRequest("Card type is required for every card leg.");
            }
            if (leg.getAmount() == null || leg.getAmount() <= ZERO_TOLERANCE) {
                throw badRequest("Each card leg amount must be greater than zero.");
            }
            String ref = leg.getReferenceNumber();
            if (ref != null && !ref.isBlank() && !seenReferences.add(ref.trim().toLowerCase())) {
                throw badRequest("Duplicate reference number \"" + ref.trim() + "\" across card legs.");
            }
        }
        return legs;
    }

    /**
     * Builds the payment summary label from the allocations actually present, in allocation
     * order and de-duplicated: "Cash", "Cash + Visa", "Cash + Visa + Online + Credit".
     * Never returns "Mixed".
     */
    public String buildSummaryLabel(List<ResolvedPaymentAllocation> allocations) {
        LinkedHashSet<String> labels = new LinkedHashSet<>();
        for (ResolvedPaymentAllocation a : allocations) {
            if (a.getAmount() <= ZERO_TOLERANCE) continue;
            labels.add(summaryLabelFor(a));
        }
        return labels.isEmpty() ? null : String.join(" + ", labels);
    }

    // ── Progressive-payment path ───────────────────────────────────────────────

    private void validateAllocationStructure(List<PosPaymentAllocation> raw) {
        int cardCount = 0;
        Set<String> seenCardReferences = new HashSet<>();
        for (PosPaymentAllocation a : raw) {
            PosPaymentAllocationType type = PosPaymentAllocationType.parse(a.getType());
            if (type == null) {
                if (PosPaymentAllocationType.isRetiredAdvanceAlias(a.getType())) {
                    throw badRequest(ADVANCE_RETIRED_MESSAGE);
                }
                throw badRequest("Unknown payment allocation type \"" + a.getType() + "\".");
            }
            if (a.getAmount() == null || a.getAmount() <= ZERO_TOLERANCE) {
                throw badRequest("Each payment allocation amount must be greater than zero.");
            }
            if (type == PosPaymentAllocationType.CARD) {
                cardCount++;
                String ref = a.getReference();
                if (ref != null && !ref.isBlank() && !seenCardReferences.add(ref.trim().toLowerCase())) {
                    throw badRequest("Duplicate reference number \"" + ref.trim() + "\" across card allocations.");
                }
            }
        }
        if (cardCount > MAX_CARD_LEGS) {
            throw badRequest("A single payment can include at most " + MAX_CARD_LEGS + " card legs.");
        }
    }

    private PosPaymentPlan resolveFromAllocations(PosCheckoutRequest request, double invoiceTotal) {
        return resolveAllocations(request.getPaymentAllocations(), invoiceTotal,
                request.getCombinedPaymentMode(), resolvePaymentMode(request));
    }

    /**
     * The one settlement engine, usable by any flow that collects money — POS checkout,
     * delivery-order settlement, layaway deposits — not just the checkout endpoint.
     *
     * <p>Takes a bare allocation list rather than a request object so every settlement screen
     * applies identical rules: same over-allocation guard, same cash capping, same summary
     * label. Duplicating any of that per flow is how "cash may overpay" ends up true on one
     * screen and false on another.
     *
     * @param raw            the tenders, in the order the cashier entered them
     * @param amountDue      what this settlement has to cover
     * @param combinedLabelOverride  client-supplied mode label, ignored when blank or "Mixed"
     * @param fallbackLabel  label to use when nothing is allocated
     */
    public PosPaymentPlan resolveAllocations(List<PosPaymentAllocation> raw, double amountDue,
                                             String combinedLabelOverride, String fallbackLabel) {
        double invoiceTotal = amountDue;
        validateAllocationStructure(raw);

        List<ResolvedPaymentAllocation> resolved = new ArrayList<>();
        double cash = 0, card = 0, online = 0, credit = 0;

        for (PosPaymentAllocation a : raw) {
            PosPaymentAllocationType type = PosPaymentAllocationType.parse(a.getType());
            double amount = a.getAmount();
            switch (type) {
                case CASH -> cash += amount;
                case CARD -> card += amount;
                case ONLINE -> online += amount;
                case CREDIT -> credit += amount;
            }
            resolved.add(new ResolvedPaymentAllocation(
                    type, modeLabelFor(type, a.getSubtype()), amount,
                    a.getReference(), a.getBankAccountName(),
                    type != PosPaymentAllocationType.CREDIT));
        }

        // Business rule: only CASH may exceed the remaining balance (the excess is the customer's
        // change). Every other tender is money that would otherwise have to be refunded through a
        // separate channel, so an over-allocation is rejected rather than silently truncated.
        double nonCash = card + online + credit;
        if (invoiceTotal > 0 && nonCash - invoiceTotal > ROUNDING_TOLERANCE) {
            throw badRequest(String.format(
                    "Non-cash payment allocations (%.2f) cannot exceed the invoice total (%.2f).",
                    nonCash, invoiceTotal));
        }

        // Credit is the balance the customer carries on their A/R ledger — it is not a receipt,
        // so it never counts toward the settled amount that drives the invoice's PAID status.
        double settled = Math.min(cash + card + online, invoiceTotal);
        List<ResolvedPaymentAllocation> capped = capCashAllocations(resolved, settled - (card + online));

        String combined = isMeaningfulLabel(combinedLabelOverride)
                ? combinedLabelOverride
                : buildSummaryLabel(capped);
        if (combined == null) combined = fallbackLabel;

        return new PosPaymentPlan(capped, cash, card, online, credit, settled, combined, false);
    }

    // ── Legacy scalar path ─────────────────────────────────────────────────────

    private PosPaymentPlan resolveFromLegacyFields(PosCheckoutRequest request, double invoiceTotal) {
        List<PosCheckoutRequest.PosCardLeg> cardLegs = resolveCardLegs(request);
        boolean useCardLegs = !cardLegs.isEmpty();

        double cash = request.getCashAmount() != null ? request.getCashAmount() : 0.0;
        double card = useCardLegs
                ? cardLegs.stream().mapToDouble(PosCheckoutRequest.PosCardLeg::getAmount).sum()
                : (request.getCardAmount() != null ? request.getCardAmount() : 0.0);
        double online = request.getOnlineAmount() != null ? request.getOnlineAmount() : 0.0;

        boolean hasSplitAmounts = cash > ZERO_TOLERANCE || card > ZERO_TOLERANCE
                || online > ZERO_TOLERANCE;
        double settled = hasSplitAmounts
                ? Math.min(cash + card + online, invoiceTotal)
                : Math.min(request.getAmountTendered() != null ? request.getAmountTendered() : 0.0, invoiceTotal);

        List<ResolvedPaymentAllocation> resolved = new ArrayList<>();
        if (cash > ZERO_TOLERANCE) {
            resolved.add(new ResolvedPaymentAllocation(
                    PosPaymentAllocationType.CASH, "Cash", cash, null, null, true));
        }
        if (useCardLegs) {
            for (PosCheckoutRequest.PosCardLeg leg : cardLegs) {
                resolved.add(new ResolvedPaymentAllocation(
                        PosPaymentAllocationType.CARD, leg.getCardType(), leg.getAmount(),
                        leg.getReferenceNumber(), null, true));
            }
        } else if (card > ZERO_TOLERANCE) {
            resolved.add(new ResolvedPaymentAllocation(
                    PosPaymentAllocationType.CARD, resolveCardMode(request), card,
                    request.getCardReference(), null, true));
        }
        if (online > ZERO_TOLERANCE) {
            resolved.add(new ResolvedPaymentAllocation(
                    PosPaymentAllocationType.ONLINE, "Online", online,
                    null, request.getBankAccountName(), true));
        }
        // Cash tender natively accepts overpayment (change), so it is capped to whatever the
        // invoice balance is after the non-cash legs — mirroring the pre-allocation behaviour.
        List<ResolvedPaymentAllocation> capped = capCashAllocations(resolved, settled - (card + online));

        if (capped.isEmpty() && settled > 0) {
            // No scalars or legs at all — a plain single-leg payment driven entirely by
            // paymentMode + amountTendered, exactly as before. isReceipt() is forced true so this
            // leg still records a Payment row whatever the parsed type turns out to be.
            String mode = resolvePaymentMode(request);
            PosPaymentAllocationType type = PosPaymentAllocationType.parse(mode);
            capped = List.of(new ResolvedPaymentAllocation(
                    type != null ? type : PosPaymentAllocationType.CASH, mode, settled,
                    request.getCardReference(), request.getBankAccountName(), true));
        }

        String combined = buildLegacyCombinedMode(request, capped);
        return new PosPaymentPlan(capped, cash, card, online, 0.0, settled, combined, useCardLegs);
    }

    /**
     * A Credit checkout with a partial receipt must keep the invoice's paymentMode stamped
     * "Credit" — the leg mode belongs on the Payment/Receipt row, not on the invoice, so the
     * remaining balance still reads as outstanding credit rather than a plain Cash/Card sale.
     */
    private String buildLegacyCombinedMode(PosCheckoutRequest request, List<ResolvedPaymentAllocation> allocations) {
        if (isCreditCheckout(request)) return "Credit";
        if (isMeaningfulLabel(request.getCombinedPaymentMode())) return request.getCombinedPaymentMode();
        String derived = buildSummaryLabel(allocations);
        return derived != null ? derived : resolvePaymentMode(request);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Trims the cash allocations (in order) so their total does not exceed {@code cashBudget},
     * the invoice balance left after every non-cash leg. Cash allocations are kept in the list
     * even when trimmed to zero so the leg count — and therefore whether this checkout gets a
     * shared splitGroupId — stays the same as before capping.
     */
    private List<ResolvedPaymentAllocation> capCashAllocations(List<ResolvedPaymentAllocation> allocations,
                                                               double cashBudget) {
        double remaining = Math.max(0, cashBudget);
        List<ResolvedPaymentAllocation> out = new ArrayList<>(allocations.size());
        for (ResolvedPaymentAllocation a : allocations) {
            if (a.getType() != PosPaymentAllocationType.CASH) {
                out.add(a);
                continue;
            }
            double applied = Math.min(a.getAmount(), remaining);
            remaining -= applied;
            out.add(a.withAmount(applied));
        }
        return out;
    }

    private String modeLabelFor(PosPaymentAllocationType type, String subtype) {
        if (subtype != null && !subtype.isBlank()) return subtype.trim();
        return switch (type) {
            case CASH -> "Cash";
            case CARD -> "Card";
            case ONLINE -> "Online";
            case CREDIT -> "Credit";
        };
    }

    /** Summary labels group by tender family, so "Visa" and "Mastercard" both read as "Card". */
    private String summaryLabelFor(ResolvedPaymentAllocation a) {
        return switch (a.getType()) {
            case CASH -> "Cash";
            case CARD -> a.getModeLabel() != null && !a.getModeLabel().isBlank() ? a.getModeLabel() : "Card";
            case ONLINE -> "Online";
            case CREDIT -> "Credit";
        };
    }

    private boolean isMeaningfulLabel(String label) {
        return label != null && !label.isBlank() && !isMixed(label);
    }

    private boolean isMixed(String label) {
        return label != null && "mixed".equalsIgnoreCase(label.trim());
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
