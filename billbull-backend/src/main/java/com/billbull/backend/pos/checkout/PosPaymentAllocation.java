package com.billbull.backend.pos.checkout;

import java.util.Map;

/**
 * One tender allocation on a POS checkout — the wire form of the progressive-payment model.
 *
 * <p>A checkout carries an ordered list of these; each one settles part of the invoice until the
 * remaining balance reaches zero. Multiple allocations of the same {@link #type} are allowed
 * (e.g. Cash 20 + Cash 30, or Visa 40 + Mastercard 10), which is why this is a list and not a
 * map of per-mode scalars.
 *
 * <p>This is purely additive: {@link PosCheckoutRequest} still accepts the legacy scalar fields
 * (cashAmount / cardAmount / cardLegs / onlineAmount / advanceAmount / amountTendered), and
 * {@link PosPaymentAllocationResolver} converts those into the same allocation list so the
 * checkout pipeline has a single code path regardless of which shape the client sent.
 */
public class PosPaymentAllocation {

    /** CASH | CARD | ONLINE | CREDIT | ADVANCE — see {@link PosPaymentAllocationType#parse}. */
    private String type;

    /**
     * Refinement of {@link #type}, used as the human-facing mode label when present:
     * the card network for CARD ("Visa", "Mastercard"), the wallet/rail for ONLINE.
     */
    private String subtype;

    /** Amount of this allocation in invoice currency. Must be greater than zero. */
    private Double amount;

    /** Card auth/approval code, bank transfer reference, cheque number, ... */
    private String reference;

    /**
     * Receiving bank account for ONLINE allocations, formatted "{code} - {name}" so
     * PostingEngineService.resolveSelectedPaymentAccount() can resolve it to the exact
     * Chart-of-Accounts row for GL posting and reconciliation.
     */
    private String bankAccountName;

    /**
     * Free-form extras the UI wants carried alongside the allocation (auth code, terminal id,
     * wallet handle, ...). Not interpreted by the checkout pipeline — held so that later phases
     * can persist or print it without another request-shape change.
     */
    private Map<String, Object> metadata;

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getSubtype() { return subtype; }
    public void setSubtype(String subtype) { this.subtype = subtype; }
    public Double getAmount() { return amount; }
    public void setAmount(Double amount) { this.amount = amount; }
    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public String getBankAccountName() { return bankAccountName; }
    public void setBankAccountName(String bankAccountName) { this.bankAccountName = bankAccountName; }
    public Map<String, Object> getMetadata() { return metadata; }
    public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }
}
