package com.billbull.backend.sales.pricing;

/** Why a transaction is priced at its level — the precedence the resolver applies. */
public enum PriceLevelSource {
    /** Explicitly chosen on the transaction. */
    TRANSACTION,
    /** The customer's assigned default level. */
    CUSTOMER,
    /** Neither: the system default level (the product's existing selling price). */
    DEFAULT
}
