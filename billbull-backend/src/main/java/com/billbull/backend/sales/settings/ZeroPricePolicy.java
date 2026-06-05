package com.billbull.backend.sales.settings;

/**
 * Controls what the system does when a sales line item has a unit price of zero.
 *
 * ALLOW  – zero-price lines are saved without any interruption (e.g. free gifts, samples).
 * WARN   – the user sees a warning but can still proceed (cashier oversight).
 * BLOCK  – saving/posting is rejected until every line has a price > 0.
 */
public enum ZeroPricePolicy {
    ALLOW,
    WARN,
    BLOCK
}
