package com.billbull.backend.pos.checkout;

import java.util.List;

/**
 * The fully-normalised settlement plan for one POS checkout: the ordered allocations to apply,
 * the aggregate figures the invoice status depends on, and the payment-mode label to stamp.
 *
 * <p>Produced by {@link PosPaymentAllocationResolver#resolve} from either the new
 * {@code paymentAllocations} list or the legacy scalar fields, so the checkout controller has a
 * single shape to work with either way.
 */
public final class PosPaymentPlan {

    private final List<ResolvedPaymentAllocation> allocations;
    private final double cashAmount;
    private final double cardAmount;
    private final double onlineAmount;
    private final double creditAmount;
    /** Amount that actually settles the invoice (cash capped to the balance; credit excluded). */
    private final double settledAmount;
    /** Label stamped on the invoice / receipt, e.g. "Cash + Visa + Online". Never "Mixed". */
    private final String combinedPaymentMode;
    /** True when the client sent the legacy {@code cardLegs} array. */
    private final boolean usesCardLegs;

    public PosPaymentPlan(List<ResolvedPaymentAllocation> allocations, double cashAmount, double cardAmount,
                          double onlineAmount, double creditAmount, double settledAmount,
                          String combinedPaymentMode, boolean usesCardLegs) {
        this.allocations = List.copyOf(allocations);
        this.cashAmount = cashAmount;
        this.cardAmount = cardAmount;
        this.onlineAmount = onlineAmount;
        this.creditAmount = creditAmount;
        this.settledAmount = settledAmount;
        this.combinedPaymentMode = combinedPaymentMode;
        this.usesCardLegs = usesCardLegs;
    }

    public List<ResolvedPaymentAllocation> getAllocations() { return allocations; }
    public double getCashAmount() { return cashAmount; }
    public double getCardAmount() { return cardAmount; }
    public double getOnlineAmount() { return onlineAmount; }
    public double getCreditAmount() { return creditAmount; }
    public double getSettledAmount() { return settledAmount; }
    public String getCombinedPaymentMode() { return combinedPaymentMode; }
    public boolean isUsesCardLegs() { return usesCardLegs; }

    /** Total tender offered before capping — used to validate an exact-settlement requirement. */
    public double getTenderTotal() {
        return cashAmount + cardAmount + onlineAmount;
    }

    /** Number of distinct allocations that will produce their own Payment record. */
    public int getLegCount() {
        return (int) allocations.stream().filter(ResolvedPaymentAllocation::isReceipt).count();
    }

    /**
     * Total allocated to one tender type, taken from the (already capped) allocations rather
     * than the pre-cap scalars — this is what actually got recorded, so session totals and
     * reports built from it reconcile with the {@code sales_payments} rows.
     */
    public double amountFor(PosPaymentAllocationType type) {
        return allocations.stream()
                .filter(a -> a.getType() == type)
                .mapToDouble(ResolvedPaymentAllocation::getAmount)
                .sum();
    }
}
