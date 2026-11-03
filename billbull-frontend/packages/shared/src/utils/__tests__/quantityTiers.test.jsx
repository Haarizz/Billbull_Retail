import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  buildRepricePatches,
  expectedLineKey,
  levelHasTiers,
  linesNeedingReprice,
  tierLabelOf,
  tierSignatures,
  toResolveLines,
} from '../priceLevels';
import PriceSourceTag from '../../components/pricing/PriceSourceTag';
import { tierMarkerOf } from '../../pages/Sales/POS/posUtils';
import { TradeInvoiceRow } from '../../pages/Sales/POS/TradePOS/components/cart/TradeInvoiceRow';

// Pricing Phase 3 — the client side of quantity tiers: when lines must be re-priced, what is sent,
// what is stamped back, and the small "Wholesale · Tier 20+" marker.

const tiered = { priceSource: 'QUANTITY_TIER', priceLevelName: 'Wholesale', tierMinQuantity: 20, untieredPrice: 27, price: 25 };

describe('quantity tier keys', () => {
  it('a level has tiers only when it reports a live tier count', () => {
    expect(levelHasTiers({ quantityTierCount: 3 })).toBe(true);
    expect(levelHasTiers({ quantityTierCount: 0 })).toBe(false);
    expect(levelHasTiers(null)).toBe(false);
  });

  it('signs every live line of a product, whatever the order, voided lines excluded', () => {
    const sigs = tierSignatures([
      { code: 'a', unit: 'PCS', quantity: 3 },
      { code: 'A', unit: 'BOX', qty: 1 },
      { code: 'A', unit: 'PCS', quantity: 9, isVoided: true },
      { code: 'B', quantity: 2 },
    ]);
    expect(sigs.get('c:A')).toBe('box*1,pcs*3');
    expect(sigs.get('c:B')).toBe('*2');
    const swapped = tierSignatures([{ code: 'A', unit: 'BOX', qty: 1 }, { code: 'A', unit: 'PCS', quantity: 3 }]);
    expect(swapped.get('c:A')).toBe(sigs.get('c:A'));
  });

  it('a quantity change on one line makes every auto line of that product stale, and nothing else', () => {
    const items = [
      { id: 1, code: 'A', quantity: 10, priceLevelKey: 'default|q:*10,*10' },
      { id: 2, code: 'A', quantity: 11, priceLevelKey: 'default|q:*10,*10' },
      { id: 3, code: 'B', quantity: 1, priceLevelKey: 'default|q:*1' },
      { id: 4, code: 'A', quantity: 10, priceOverridden: true },
    ];
    const sigs = tierSignatures(items);
    const stale = linesNeedingReprice(items, 'default', (it) => expectedLineKey(it, 'default', sigs));
    expect(stale.map((it) => it.id)).toEqual([1, 2]);
  });

  it('without tiers the key is the plain level key', () => {
    expect(expectedLineKey({ code: 'A' }, 'default', null)).toBe('default');
  });

  it('sends the paid quantity from either field name', () => {
    expect(toResolveLines([{ code: 'A', qty: '24', unit: 'PCS' }, { code: 'B', quantity: 2 }, { code: 'C', qty: '' }]))
      .toEqual([
        { productId: null, itemCode: 'A', unit: 'PCS', quantity: 24 },
        { productId: null, itemCode: 'B', unit: null, quantity: 2 },
        { productId: null, itemCode: 'C', unit: null, quantity: null },
      ]);
  });

  it('stamps tier details from the answer and clears them when no tier applied', () => {
    const lines = [{ id: 1 }, { id: 2 }];
    const patches = buildRepricePatches(lines, {
      level: { id: 2, name: 'Wholesale' },
      lines: [
        { price: 25, source: 'QUANTITY_TIER', quantityTierId: 7, tierMinQuantity: 20, eligibleQuantity: 24, untieredPrice: 27 },
        { price: 27, source: 'PRICE_LEVEL', untieredPrice: 27 },
        { price: 99, source: 'BASE_PRICE' }, // a context line's answer — ignored
      ],
    }, (it) => `k${it.id}`);
    expect(patches.get(1)).toMatchObject({ priceLevelKey: 'k1', price: 25, quantityTierId: 7, tierMinQuantity: 20, tierEligibleQuantity: 24, untieredPrice: 27 });
    expect(patches.get(2)).toMatchObject({ priceLevelKey: 'k2', price: 27, quantityTierId: null, tierMinQuantity: null });
    expect(patches.size).toBe(2);
  });
});

describe('tier markers', () => {
  it('labels a tier-priced line with its level and threshold', () => {
    expect(tierLabelOf(tiered)).toBe('Wholesale · Tier 20+');
    expect(tierLabelOf({ ...tiered, tierMinQuantity: 12.5 })).toBe('Wholesale · Tier 12.5+');
  });

  it('never marks a negotiated, hand-edited, voided or untiered line', () => {
    expect(tierLabelOf({ ...tiered, priceSource: 'CUSTOMER_SPECIFIC' })).toBeNull();
    expect(tierLabelOf({ ...tiered, priceOverridden: true })).toBeNull();
    expect(tierMarkerOf({ ...tiered, isVoided: true })).toBeNull();
    expect(tierLabelOf({ priceSource: 'PRICE_LEVEL', priceLevelName: 'Wholesale' })).toBeNull();
    expect(tierMarkerOf(tiered)).toBe('Wholesale · Tier 20+');
  });

  it('the back-office tag shows the tier, or the customer price, but not both', () => {
    const { rerender } = render(<PriceSourceTag line={tiered} />);
    expect(screen.getByTestId('price-source-tag')).toHaveTextContent('Wholesale · Tier 20+');
    expect(screen.getByTestId('price-source-tag').getAttribute('title')).toContain('otherwise 27.00');
    rerender(<PriceSourceTag line={{ ...tiered, priceSource: 'CUSTOMER_SPECIFIC', fallbackPrice: 25 }} />);
    expect(screen.getByTestId('price-source-tag')).toHaveTextContent('Customer price');
    rerender(<PriceSourceTag line={{ ...tiered, priceOverridden: true }} />);
    expect(screen.queryByTestId('price-source-tag')).toBeNull();
  });

  it('the TradePOS cart row shows the tier marker', () => {
    render(
      <TradeInvoiceRow
        item={{ id: 'x', name: 'Product A', code: 'A', unit: 'PCS', quantity: 20, price: 25, discount: 0, total: 500, ...tiered }}
        index={0}
        isSelected={false}
        onSelect={() => {}}
        onUpdateQuantity={() => {}}
        onRemove={() => {}}
        formatCurrency={(v) => String(v)}
      />,
    );
    expect(screen.getByTestId('tier-price-marker')).toHaveTextContent('Wholesale · Tier 20+');
    expect(screen.queryByTestId('customer-price-marker')).toBeNull();
  });
});
