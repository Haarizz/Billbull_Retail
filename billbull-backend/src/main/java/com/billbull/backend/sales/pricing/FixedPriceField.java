package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;

import com.billbull.backend.inventory.product.ProductPricing;

/**
 * A fixed selling-price field of the product pricing master, read on its own — with no fallback to
 * another field. Used where a specific price must be shown exactly as configured (barcode labels):
 * a missing value stays missing. Cost fields are deliberately not here; cost is never a selling
 * price.
 */
public enum FixedPriceField {
    WHOLESALE("Wholesale price"),
    ONLINE("Online price"),
    MIN("Minimum price"),
    MAX("Maximum price");

    private final String label;

    FixedPriceField(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** This field on {@code pricing}, or null. */
    public BigDecimal read(ProductPricing pricing) {
        if (pricing == null) return null;
        return switch (this) {
            case WHOLESALE -> pricing.getWholesalePrice();
            case ONLINE -> pricing.getOnlinePrice();
            case MIN -> pricing.getMinPrice();
            case MAX -> pricing.getMaxPrice();
        };
    }
}
