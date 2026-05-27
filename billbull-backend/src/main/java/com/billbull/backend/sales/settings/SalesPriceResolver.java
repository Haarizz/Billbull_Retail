package com.billbull.backend.sales.settings;

import java.math.BigDecimal;

import com.billbull.backend.inventory.product.ProductPricing;

/**
 * Resolves the default sales line price for an item based on the active
 * {@link SalesItemPricePolicy}. Used by Quotation / Sales Order / Delivery
 * Note services when prefilling line prices from a product's pricing master.
 *
 * Behaviour:
 *  - If the policy-specific field is set and > 0, use it.
 *  - Otherwise fall back to retailPrice (so item-add never silently
 *    produces a zero default when the configured field is empty on a
 *    particular product).
 *  - Returns null when no usable price is available.
 */
public final class SalesPriceResolver {

    private SalesPriceResolver() {}

    public static BigDecimal resolve(ProductPricing pricing, SalesItemPricePolicy policy) {
        if (pricing == null) return null;

        SalesItemPricePolicy effective = policy != null ? policy : SalesItemPricePolicy.RETAIL;
        BigDecimal preferred = switch (effective) {
            case MAX_SALE -> pricing.getMaxPrice();
            case MIN_SALE -> pricing.getMinPrice();
            case RETAIL -> pricing.getRetailPrice();
        };

        if (isPositive(preferred)) return preferred;
        BigDecimal retail = pricing.getRetailPrice();
        return isPositive(retail) ? retail : null;
    }

    private static boolean isPositive(BigDecimal value) {
        return value != null && value.signum() > 0;
    }
}
