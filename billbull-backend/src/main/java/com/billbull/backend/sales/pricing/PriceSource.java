package com.billbull.backend.sales.pricing;

/**
 * Where a resolved line price came from, most specific first.
 *
 * <p>A manual price edit is not a source the resolver produces: a saved line keeps the source the
 * resolver offered and is flagged {@code priceOverridden} when the charged price differs.
 */
public enum PriceSource {
    /** The customer's negotiated price set for this branch (Phase 2). */
    CUSTOMER_SPECIFIC_BRANCH,
    /** The customer's all-branches negotiated price (Phase 2). */
    CUSTOMER_SPECIFIC,
    /** The level's quantity tier set for this branch (Phase 3). */
    QUANTITY_TIER_BRANCH,
    /** The level's all-branches quantity tier (Phase 3). */
    QUANTITY_TIER,
    /** The level's price set for this branch. */
    PRICE_LEVEL_BRANCH,
    /** The level's all-branches price. */
    PRICE_LEVEL,
    /** A multi-unit packing's own selling price (default level only). */
    PACKING_PRICE,
    /** The product's branch price row. */
    BRANCH_PRICE,
    /** The product's global pricing master. */
    BASE_PRICE,
    /**
     * Stamped on save only, never resolved: the line's price was carried unchanged from the document
     * it was converted from (quotation → order → invoice …), which is authoritative for it.
     */
    SOURCE_DOCUMENT,
    /** Nothing usable was found (no product, no price). */
    NONE;

    public boolean isLevelPrice() {
        return this == PRICE_LEVEL_BRANCH || this == PRICE_LEVEL;
    }

    public boolean isCustomerPrice() {
        return this == CUSTOMER_SPECIFIC_BRANCH || this == CUSTOMER_SPECIFIC;
    }

    public boolean isTierPrice() {
        return this == QUANTITY_TIER_BRANCH || this == QUANTITY_TIER;
    }
}
