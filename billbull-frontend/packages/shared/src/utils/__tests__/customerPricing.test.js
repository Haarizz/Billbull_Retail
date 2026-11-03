import { describe, expect, it } from 'vitest';
import {
  applyRepricePatches,
  buildRepricePatches,
  customerPricingSummary,
  isCustomerPriceSource,
  isWalkInCode,
  linesNeedingReprice,
  pricingKeyFor,
  priceSourceOf,
} from '../priceLevels';
import { getCartPriceWarning, getLineFloor, isCustomerPricedLine } from '../../pages/Sales/POS/posUtils';

// Pricing Phase 2 — client helpers for customer-specific prices. The backend resolver decides the
// price; these decide which lines to re-resolve, how to show the result and the advisory floor.

const RETAIL = { id: 1, name: 'Retail', systemDefault: true, active: true };
const WHOLESALE = { id: 2, name: 'Wholesale', systemDefault: false, active: true };
const ABC = { id: '501', code: 'ABC' };
const XYZ = { id: '502', code: 'XYZ' };

describe('pricingKeyFor', () => {
  it('names the customer so a customer change re-prices auto lines', () => {
    expect(pricingKeyFor(WHOLESALE, ABC)).toBe('2|c:ABC');
    expect(pricingKeyFor(WHOLESALE, XYZ)).toBe('2|c:XYZ');
    expect(pricingKeyFor(RETAIL, ABC)).toBe('default|c:ABC');
  });

  it('keeps the plain level key for walk-in sales', () => {
    expect(pricingKeyFor(RETAIL, null)).toBe('default');
    expect(pricingKeyFor(RETAIL, { id: 'walk-in', name: 'Walk-in' })).toBe('default');
    expect(pricingKeyFor(RETAIL, { id: 'WALKIN-ID', code: 'WALKIN' })).toBe('default');
    expect(pricingKeyFor(WHOLESALE, { code: 'walk-in' })).toBe('2');
    expect(isWalkInCode('WALKIN')).toBe(true);
    expect(isWalkInCode('ABC')).toBe(false);
  });

  it('selecting, replacing and removing a customer makes every auto line stale', () => {
    const items = [
      { id: 'a', productId: 10, code: 'A', priceLevelKey: '2|c:ABC', price: 25 },
      { id: 'b', productId: 11, code: 'B', priceLevelKey: '2|c:ABC', price: 45, priceOverridden: true },
    ];
    expect(linesNeedingReprice(items, '2|c:ABC')).toHaveLength(0);
    expect(linesNeedingReprice(items, '2|c:XYZ').map((i) => i.id)).toEqual(['a']);
    expect(linesNeedingReprice(items, 'default').map((i) => i.id)).toEqual(['a']);
  });
});

describe('buildRepricePatches with customer prices', () => {
  const lines = [{ id: 'a', productId: 10, code: 'A' }, { id: 'b', productId: 11, code: 'B' }];
  const resolution = {
    level: WHOLESALE,
    lines: [
      { price: 25, basePrice: 30, source: 'CUSTOMER_SPECIFIC', customerPriceId: 7, fallbackPrice: 27 },
      { price: 45, basePrice: 50, source: 'PRICE_LEVEL', customerPriceId: null, fallbackPrice: 45 },
    ],
  };

  it('records the negotiated price and what the line would otherwise cost', () => {
    const patches = buildRepricePatches(lines, resolution, '2|c:ABC');
    expect(patches.get('a')).toMatchObject({ price: 25, priceSource: 'CUSTOMER_SPECIFIC', customerPriceId: 7, customerPrice: 25, fallbackPrice: 27 });
    expect(patches.get('b')).toMatchObject({ price: 45, priceSource: 'PRICE_LEVEL', customerPriceId: null, customerPrice: null });
  });

  it("clears the previous customer's negotiated price when the new customer has none", () => {
    const before = [{ id: 'a', productId: 10, code: 'A', price: 25, priceSource: 'CUSTOMER_SPECIFIC', customerPrice: 25, customerPriceId: 7 }];
    const fallback = { level: WHOLESALE, lines: [{ price: 27, source: 'PRICE_LEVEL' }] };
    const next = applyRepricePatches(before, buildRepricePatches(before, fallback, '2|c:XYZ'));
    expect(next[0]).toMatchObject({ price: 27, priceSource: 'PRICE_LEVEL', customerPrice: null, customerPriceId: null });
  });

  it('never touches a hand-edited line', () => {
    const edited = [{ id: 'a', price: 22, priceOverridden: true }];
    expect(applyRepricePatches(edited, buildRepricePatches(edited, resolution, '2|c:ABC'))[0].price).toBe(22);
  });
});

describe('customerPricingSummary', () => {
  const items = [
    { id: 'a', code: 'A', priceSource: 'CUSTOMER_SPECIFIC' },
    { id: 'b', code: 'B', priceSource: 'PRICE_LEVEL' },
    { id: 'c', code: 'C', priceSource: 'CUSTOMER_SPECIFIC_BRANCH' },
    { id: 'd', code: 'D', priceSource: 'CUSTOMER_SPECIFIC', priceOverridden: true },
  ];

  it('counts lines charged a negotiated price', () => {
    expect(customerPricingSummary(items, { liveMappings: 3 })).toMatchObject({ applied: 2, tone: 'info', message: 'Customer price on 2 items' });
  });

  it('says when the customer has none, or none applies', () => {
    expect(customerPricingSummary(items, { liveMappings: 0 }).message).toBe('No negotiated prices for this customer');
    expect(customerPricingSummary([{ id: 'b', code: 'B', priceSource: 'PRICE_LEVEL' }], { liveMappings: 4 }).message)
      .toBe('No negotiated price applies to these items');
    expect(customerPricingSummary(items, null)).toBeNull();
  });

  it('labels manual and customer sources', () => {
    expect(isCustomerPriceSource('CUSTOMER_SPECIFIC_BRANCH')).toBe(true);
    expect(isCustomerPriceSource('PRICE_LEVEL')).toBe(false);
    expect(priceSourceOf(items[3])).toBe('MANUAL_OVERRIDE');
    expect(priceSourceOf(items[0])).toBe('CUSTOMER_SPECIFIC');
  });
});

describe('POS price floor with a negotiated price', () => {
  const line = { id: 1, price: 180, minPrice: 190, cost: 150, discount: 0 };

  it('a negotiated price below the minimum is not a below-minimum sale', () => {
    const negotiated = { ...line, priceSource: 'CUSTOMER_SPECIFIC', customerPrice: 180 };
    expect(getLineFloor(negotiated)).toBe(180);
    expect(getCartPriceWarning(negotiated)).toBeNull();
    expect(isCustomerPricedLine(negotiated)).toBe(true);
  });

  it('selling under the negotiated price still warns', () => {
    const under = { ...line, price: 170, priceSource: 'CUSTOMER_SPECIFIC', customerPrice: 180, priceOverridden: true };
    expect(getCartPriceWarning(under)).toMatchObject({ level: 'error' });
    expect(isCustomerPricedLine(under)).toBe(false);
  });

  it('without a negotiated price the product floor applies', () => {
    expect(getLineFloor(line)).toBe(190);
    expect(getCartPriceWarning(line)).toMatchObject({ level: 'error' });
  });
});
