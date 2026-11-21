package com.billbull.backend.pos.checkout;

import java.util.List;

/**
 * What this build of the checkout API can accept.
 *
 * <p>Exists so a POS terminal can find out, before it tries to settle a sale, whether the
 * server it is talking to understands the payment shape it is about to send. A terminal that
 * posts progressive `paymentAllocations` to a server predating them would have its payment
 * silently dropped — the invoice would post with the tender missing — so the terminal checks
 * first and refuses to settle rather than losing the money.
 */
public class PosCheckoutCapabilitiesResponse {

    /** True when {@code PosCheckoutRequest.paymentAllocations} is honoured. */
    private final boolean paymentAllocations;
    /** True when the legacy per-mode scalars (cashAmount/cardAmount/cardLegs/...) still work. */
    private final boolean legacyPaymentScalars;
    /** Maximum card allocations one checkout may itemize. */
    private final int maxCardAllocations;
    /** Allocation types this server recognises, for forward-compatible clients. */
    private final List<String> supportedAllocationTypes;
    /** Checkout contract version — bumped when the accepted request shape changes. */
    private final int checkoutApiVersion;
    /**
     * True when every checkout request must carry a caller-supplied {@code checkoutKey} (Phase 0 /
     * M2.2.1). A request without one is refused with 409 {@code CHECKOUT_KEY_REQUIRED} before
     * anything is written, whatever its tender, session or delivery workflow (PI-Flow delivery
     * orders included). The client creates the key before the first attempt and sends the same key
     * on every retry of that attempt, including after a timeout or a lost response; a new key means
     * a new sale. A server whose response omits this field predates the rule.
     */
    private final boolean checkoutKeyRequired;

    public PosCheckoutCapabilitiesResponse(boolean paymentAllocations, boolean legacyPaymentScalars,
                                           int maxCardAllocations, List<String> supportedAllocationTypes,
                                           int checkoutApiVersion, boolean checkoutKeyRequired) {
        this.paymentAllocations = paymentAllocations;
        this.legacyPaymentScalars = legacyPaymentScalars;
        this.maxCardAllocations = maxCardAllocations;
        this.supportedAllocationTypes = supportedAllocationTypes;
        this.checkoutApiVersion = checkoutApiVersion;
        this.checkoutKeyRequired = checkoutKeyRequired;
    }

    public boolean isPaymentAllocations() { return paymentAllocations; }
    public boolean isLegacyPaymentScalars() { return legacyPaymentScalars; }
    public int getMaxCardAllocations() { return maxCardAllocations; }
    public List<String> getSupportedAllocationTypes() { return supportedAllocationTypes; }
    public int getCheckoutApiVersion() { return checkoutApiVersion; }
    public boolean isCheckoutKeyRequired() { return checkoutKeyRequired; }
}
