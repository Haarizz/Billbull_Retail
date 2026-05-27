package com.billbull.backend.sales.settings;

/**
 * Which price field on a Product's pricing master is used as the default
 * line price when an item is added to a Quotation, Sales Order, or Sales
 * Invoice via the product selector.
 *
 * RETAIL    — ProductPricing.retailPrice (system default).
 * MAX_SALE  — ProductPricing.maxPrice — typical "ceiling" / list price.
 * MIN_SALE  — ProductPricing.minPrice — typical "floor" / promo price.
 *
 * If the configured field is null or zero on a given product, the resolver
 * falls back to retailPrice so item-add never produces a zero price by
 * surprise.
 */
public enum SalesItemPricePolicy {
    RETAIL,
    MAX_SALE,
    MIN_SALE
}
