package com.billbull.backend.pos.checkout;

/**
 * A single tender allocation after normalisation — the internal form the checkout pipeline
 * settles against, produced by {@link PosPaymentAllocationResolver} from either the new
 * {@code paymentAllocations} list or the legacy scalar request fields.
 *
 * <p>Immutable on purpose: the resolver has already applied ordering, cash capping and
 * label resolution, so nothing downstream needs to re-derive them.
 */
public final class ResolvedPaymentAllocation {

    private final PosPaymentAllocationType type;
    /**
     * The exact string stamped on the resulting {@code Payment.paymentMode} row — the card
     * network for CARD legs ("Visa"), "Cash", "Online", ... This is what the GL posting rules
     * and settlement reports already match on, so it must stay identical to the strings the
     * pre-allocation code passed to {@code SalesInvoiceService.recordPayment}.
     */
    private final String modeLabel;
    private final double amount;
    private final String reference;
    private final String bankAccountName;
    /** True when this allocation must produce a Payment row + Receipt Voucher + GL posting. */
    private final boolean receipt;

    public ResolvedPaymentAllocation(PosPaymentAllocationType type, String modeLabel, double amount,
                                     String reference, String bankAccountName, boolean receipt) {
        this.type = type;
        this.modeLabel = modeLabel;
        this.amount = amount;
        this.reference = reference;
        this.bankAccountName = bankAccountName;
        this.receipt = receipt;
    }

    public PosPaymentAllocationType getType() { return type; }
    public String getModeLabel() { return modeLabel; }
    public double getAmount() { return amount; }
    public String getReference() { return reference; }
    public String getBankAccountName() { return bankAccountName; }
    public boolean isReceipt() { return receipt; }

    /** Same allocation with a different (capped) amount — used when cash is trimmed to the balance. */
    public ResolvedPaymentAllocation withAmount(double newAmount) {
        return new ResolvedPaymentAllocation(type, modeLabel, newAmount, reference, bankAccountName, receipt);
    }
}
