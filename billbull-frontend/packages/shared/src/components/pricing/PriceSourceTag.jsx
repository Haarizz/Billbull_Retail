import React from 'react';
import { isCustomerPriceSource, tierLabelOf } from '../../utils/priceLevels';

/**
 * A small tag under a line's price saying where an automatically resolved price came from — only
 * the sources a user needs to notice: a customer-specific (negotiated) price, or a quantity tier
 * ("Wholesale · Tier 20+"). Renders nothing for a hand-edited price or any other source, and no
 * tier marker for a negotiated price (a negotiated price is fixed whatever the quantity).
 */
export default function PriceSourceTag({ line }) {
  if (!line || line.priceOverridden || line.voided || line.isVoided) return null;
  const tier = tierLabelOf(line);
  if (tier) {
    const base = Number(line.untieredPrice);
    const title = Number.isFinite(base) && line.untieredPrice != null
      ? `Quantity tier price${line.priceSource === 'QUANTITY_TIER_BRANCH' ? ' for this branch' : ''} (otherwise ${base.toFixed(2)})`
      : 'Quantity tier price';
    return (
      <span
        className="mt-0.5 inline-block rounded bg-amber-50 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-700"
        title={title}
        data-testid="price-source-tag"
      >
        {tier}
      </span>
    );
  }
  if (!isCustomerPriceSource(line.priceSource)) return null;
  const branch = line.priceSource === 'CUSTOMER_SPECIFIC_BRANCH';
  const fallback = Number(line.fallbackPrice);
  const title = Number.isFinite(fallback) && line.fallbackPrice != null
    ? `Negotiated price for this customer${branch ? ' in this branch' : ''} (otherwise ${fallback.toFixed(2)})`
    : `Negotiated price for this customer${branch ? ' in this branch' : ''}`;
  return (
    <span
      className="mt-0.5 inline-block rounded bg-emerald-50 px-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-700"
      title={title}
      data-testid="price-source-tag"
    >
      {branch ? 'Customer · branch' : 'Customer price'}
    </span>
  );
}
