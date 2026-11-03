import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEVEL_KEY,
  applyRepricePatches,
  buildRepricePatches,
  customerLevelOf,
  levelKeyFor,
  linesNeedingReprice,
  resolveClientLevel,
  toResolveLines,
} from '../priceLevels';

// Pricing Phase 1 — which level a screen shows, and which lines it re-prices.

const RETAIL = { id: 1, name: 'Retail', systemDefault: true, active: true };
const WHOLESALE = { id: 2, name: 'Wholesale', systemDefault: false, active: true };
const VIP = { id: 3, name: 'VIP', systemDefault: false, active: true };
const OLD = { id: 4, name: 'Old Trade', systemDefault: false, active: false };
const LEVELS = [RETAIL, WHOLESALE, VIP, OLD];

describe('resolveClientLevel — same precedence as the server', () => {
  it('uses the default level with no customer and no choice', () => {
    const r = resolveClientLevel({ levels: LEVELS, explicitLevelId: null, customer: null });
    expect(r.level).toBe(RETAIL);
    expect(r.source).toBe('DEFAULT');
  });

  it("uses the customer's default level", () => {
    const r = resolveClientLevel({ levels: LEVELS, explicitLevelId: null, customer: { priceLevelId: 2 } });
    expect(r.level).toBe(WHOLESALE);
    expect(r.source).toBe('CUSTOMER');
  });

  it("an explicit choice overrides the customer's default", () => {
    const r = resolveClientLevel({ levels: LEVELS, explicitLevelId: 3, customer: { priceLevelId: 2 } });
    expect(r.level).toBe(VIP);
    expect(r.source).toBe('TRANSACTION');
  });

  it('choosing the customer level explicitly still reads as the customer default', () => {
    expect(resolveClientLevel({ levels: LEVELS, explicitLevelId: 2, customer: { priceLevelId: 2 } }).source).toBe('CUSTOMER');
  });

  it('falls back to default prices with a notice when the customer level is inactive', () => {
    const r = resolveClientLevel({ levels: LEVELS, explicitLevelId: null, customer: { priceLevelId: 4 } });
    expect(r.level).toBe(RETAIL);
    expect(r.notice).toMatch(/inactive/);
  });

  it('recognises a legacy price list name', () => {
    expect(customerLevelOf(LEVELS, { priceList: ' wholesale ' })).toBe(WHOLESALE);
    expect(customerLevelOf(LEVELS, { priceList: 'General' })).toBeNull();
  });

  it('the default level and "no level" share one key', () => {
    expect(levelKeyFor(RETAIL)).toBe(DEFAULT_LEVEL_KEY);
    expect(levelKeyFor(null)).toBe(DEFAULT_LEVEL_KEY);
    expect(levelKeyFor(VIP)).toBe('3');
  });
});

describe('re-pricing lines', () => {
  const items = [
    { id: 'a', productId: 10, code: 'P10', quantity: 2, price: 100 },
    { id: 'b', productId: 11, code: 'P11', quantity: 1, price: 50, priceOverridden: true },
    { id: 'c', productId: 12, code: 'P12', quantity: 1, price: 30, isVoided: true },
    { id: 'd', productId: 13, code: 'P13', quantity: 1, price: 70, priceLevelKey: '2' },
  ];

  it('nothing needs re-pricing at the default level for fresh lines', () => {
    expect(linesNeedingReprice(items, DEFAULT_LEVEL_KEY).map((i) => i.id)).toEqual(['d']);
  });

  it('switching level re-prices only lines not on it, never hand-edited or voided ones', () => {
    expect(linesNeedingReprice(items, '2').map((i) => i.id)).toEqual(['a']);
    expect(linesNeedingReprice(items, '3').map((i) => i.id)).toEqual(['a', 'd']);
  });

  it('builds resolver lines with product, code, unit and quantity', () => {
    expect(toResolveLines([{ id: 'x', productId: 10, code: 'P10', unit: 'Box', quantity: 3 }]))
      .toEqual([{ productId: 10, itemCode: 'P10', unit: 'Box', quantity: 3 }]);
    expect(toResolveLines([{ id: '10::B1', productId: 10, code: 'P10' }])[0].productId).toBe(10);
  });

  it('patches the server price onto the line and leaves vanished lines alone', () => {
    const stale = [items[0], items[3]];
    const resolution = {
      level: { id: 3, name: 'VIP' },
      lines: [
        { price: 90, basePrice: 100, source: 'PRICE_LEVEL' },
        { price: null, basePrice: null, source: 'NONE' },
      ],
    };
    const patches = buildRepricePatches(stale, resolution, '3');
    const next = applyRepricePatches(items.filter((i) => i.id !== 'd'), patches);

    expect(next.find((i) => i.id === 'a')).toMatchObject({ price: 90, basePrice: 100, priceLevelKey: '3', priceLevelName: 'VIP' });
    expect(next.find((i) => i.id === 'b').price).toBe(50);
    expect(next).toHaveLength(3);
    // No price returned: the key moves (no retry loop) but the price stays.
    expect(patches.get('d')).toEqual(expect.objectContaining({ priceLevelKey: '3' }));
    expect(patches.get('d').price).toBeUndefined();
  });

  it('a line hand-edited while the request was in flight is not overwritten', () => {
    const patches = buildRepricePatches([items[0]], { level: { id: 3 }, lines: [{ price: 90 }] }, '3');
    const edited = [{ ...items[0], price: 120, priceOverridden: true }];
    expect(applyRepricePatches(edited, patches)[0].price).toBe(120);
  });
});
