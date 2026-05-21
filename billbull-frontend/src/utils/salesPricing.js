// Resolves the default line price when an item is added to a Quotation,
// Sales Order, or Sales Invoice. Mirrors the backend SalesPriceResolver:
// the configured policy (RETAIL / MAX_SALE / MIN_SALE) chooses which field
// of the product's pricing master is used; if that field is missing or
// non-positive on a given product we fall back to retail so item-add never
// silently produces a zero default.

export const SALES_ITEM_PRICE_POLICIES = {
    RETAIL: 'RETAIL',
    MAX_SALE: 'MAX_SALE',
    MIN_SALE: 'MIN_SALE',
};

const numeric = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Pick the configured sales price from a product master record.
 * Looks at product.pricing.{min,max,retail}Price as the primary source,
 * with flat product.{minPrice,maxPrice,retailPrice} as a secondary, then
 * falls back through retailPrice → sellingPrice → 0.
 */
export const pickSalesItemPrice = (product, policy) => {
    if (!product) return 0;

    const pricing = product.pricing || {};
    const retail = numeric(pricing.retailPrice ?? product.retailPrice);
    const maxSale = numeric(pricing.maxPrice ?? product.maxPrice);
    const minSale = numeric(pricing.minPrice ?? product.minPrice);

    let chosen = retail;
    switch (policy) {
        case SALES_ITEM_PRICE_POLICIES.MAX_SALE:
            chosen = (maxSale != null && maxSale > 0) ? maxSale : retail;
            break;
        case SALES_ITEM_PRICE_POLICIES.MIN_SALE:
            chosen = (minSale != null && minSale > 0) ? minSale : retail;
            break;
        case SALES_ITEM_PRICE_POLICIES.RETAIL:
        default:
            chosen = retail;
    }

    if (chosen != null && chosen > 0) return chosen;
    const sellingFallback = numeric(product.sellingPrice);
    if (sellingFallback != null && sellingFallback > 0) return sellingFallback;
    return 0;
};
