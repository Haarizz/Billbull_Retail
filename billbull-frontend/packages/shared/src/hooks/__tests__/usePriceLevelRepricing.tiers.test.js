import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/pricingApi', () => ({
  resolvePrices: vi.fn(),
}));

import { resolvePrices } from '../../api/pricingApi';
import usePriceLevelRepricing from '../usePriceLevelRepricing';
import { pricingKeyFor } from '../../utils/priceLevels';

// Pricing Phase 3 — quantity tiers on the client. The server (mocked here as the real rule: lines of
// one product added up in base units, BOX = 12) prices; the hook decides when to ask and applies
// only the newest answer.

const RETAIL = { id: 1, name: 'Retail', systemDefault: true, active: true, quantityTierCount: 3 };
const CONVERSION = { BOX: 12 };

function serverPrice(req) {
  const totals = new Map();
  req.items.forEach((l) => {
    const base = (Number(l.quantity) || 0) * (CONVERSION[l.unit] || 1);
    totals.set(l.itemCode, (totals.get(l.itemCode) || 0) + base);
  });
  return {
    level: { id: 1, name: 'Retail', systemDefault: true },
    lines: req.items.map((l) => {
      const conv = CONVERSION[l.unit] || 1;
      if (req.customerCode === 'ABC') {
        return { price: 25 * conv, source: 'CUSTOMER_SPECIFIC', customerPriceId: 9, fallbackPrice: 28 * conv, untieredPrice: 30 * conv };
      }
      const eligible = totals.get(l.itemCode);
      if (eligible >= 20) {
        return { price: 28 * conv, source: 'QUANTITY_TIER', quantityTierId: 7, tierMinQuantity: 20, eligibleQuantity: eligible, untieredPrice: 30 * conv };
      }
      return { price: 30 * conv, source: 'BASE_PRICE', untieredPrice: 30 * conv, eligibleQuantity: eligible };
    }),
  };
}

// Every price line 'a' has been rendered with, to catch a stale answer that is later corrected.
let priceHistory = [];

function useCart(initialItems, { tierAware = true, customerCode = null } = {}) {
  const [items, setItems] = useState(initialItems);
  const a = items.find((it) => it.id === 'a');
  if (a && priceHistory.at(-1) !== a.price) priceHistory.push(a.price);
  const [customer, setCustomer] = useState(customerCode);
  const levelKey = pricingKeyFor(RETAIL, customer ? { code: customer } : null);
  const request = { channel: 'POS', sessionId: 4, customerCode: customer };
  const pricing = usePriceLevelRepricing({ items, levelKey, request, setItems, tierAware });
  const setQty = (id, quantity) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, quantity } : it)));
  return { items, setItems, setQty, setCustomer, pricing };
}

const line = (id, code, quantity, extra = {}) => ({ id, code, productId: 10, quantity, price: 30, unit: 'PCS', ...extra });
const get = (result, id) => result.current.items.find((i) => i.id === id);

describe('usePriceLevelRepricing — quantity tiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    priceHistory = [];
    resolvePrices.mockImplementation(async (req) => serverPrice(req));
  });

  it('re-prices when a quantity crosses a threshold, and restores the price when it drops back', async () => {
    const { result } = renderHook(() => useCart([line('a', 'A', 19)]));
    await waitFor(() => expect(get(result, 'a').priceSource).toBe('BASE_PRICE'));
    expect(get(result, 'a').price).toBe(30);

    act(() => result.current.setQty('a', 20));
    await waitFor(() => expect(get(result, 'a').price).toBe(28));
    expect(get(result, 'a').priceSource).toBe('QUANTITY_TIER');
    expect(get(result, 'a').tierMinQuantity).toBe(20);
    expect(get(result, 'a').untieredPrice).toBe(30);

    act(() => result.current.setQty('a', 19));
    await waitFor(() => expect(get(result, 'a').price).toBe(30));
    expect(get(result, 'a').quantityTierId).toBeNull();
    expect(get(result, 'a').tierMinQuantity).toBeNull();
  });

  it('adds duplicate lines of a product together for the tier', async () => {
    const { result } = renderHook(() => useCart([line('a1', 'A', 10), line('a2', 'A', 10), line('b', 'B', 10)]));
    await waitFor(() => expect(get(result, 'a1').price).toBe(28));
    expect(get(result, 'a2').price).toBe(28);
    expect(get(result, 'b').price).toBe(30);
  });

  it('sends a hand-priced line along for its quantity but never changes its price', async () => {
    const { result } = renderHook(() => useCart([
      line('a1', 'A', 15),
      line('a2', 'A', 5, { price: 26.5, priceOverridden: true }),
    ]));
    await waitFor(() => expect(get(result, 'a1').price).toBe(28));
    expect(get(result, 'a2').price).toBe(26.5);
    const sent = resolvePrices.mock.calls.at(-1)[0].items;
    expect(sent.map((l) => l.quantity)).toEqual([15, 5]);
  });

  it('counts boxes in base units', async () => {
    const { result } = renderHook(() => useCart([line('box', 'A', 1, { unit: 'BOX', price: 360 }), line('pcs', 'A', 8)]));
    await waitFor(() => expect(get(result, 'box').price).toBe(336));
    expect(get(result, 'pcs').price).toBe(28);
  });

  it('re-prices on a unit change', async () => {
    const { result } = renderHook(() => useCart([line('a', 'A', 2)]));
    await waitFor(() => expect(get(result, 'a').price).toBe(30));
    act(() => result.current.setItems((prev) => prev.map((it) => ({ ...it, unit: 'BOX' }))));
    await waitFor(() => expect(get(result, 'a').price).toBe(336));
  });

  it('makes no request for a quantity change while the level has no tiers', async () => {
    const { result } = renderHook(() => useCart([line('a', 'A', 19, { priceLevelKey: 'default' })], { tierAware: false }));
    act(() => result.current.setQty('a', 25));
    await new Promise((r) => setTimeout(r, 20));
    expect(resolvePrices).not.toHaveBeenCalled();
    expect(get(result, 'a').price).toBe(30);
  });

  it('reports pending from the moment a quantity changes until its price arrives', async () => {
    let release;
    const { result } = renderHook(() => useCart([line('a', 'A', 19)]));
    await waitFor(() => expect(get(result, 'a').priceSource).toBe('BASE_PRICE'));
    expect(result.current.pricing.pending).toBe(false);

    resolvePrices.mockImplementationOnce((req) => new Promise((resolve) => { release = () => resolve(serverPrice(req)); }));
    act(() => result.current.setQty('a', 20));
    expect(result.current.pricing.pending).toBe(true);
    await waitFor(() => expect(release).toBeTypeOf('function'));
    await act(async () => { release(); });
    await waitFor(() => expect(result.current.pricing.pending).toBe(false));
    expect(get(result, 'a').price).toBe(28);
  });

  it('drops a slow answer that arrives after a newer request', async () => {
    const { result } = renderHook(() => useCart([line('a', 'A', 5)]));
    await waitFor(() => expect(get(result, 'a').priceSource).toBe('BASE_PRICE'));

    let releaseSlow;
    resolvePrices.mockImplementationOnce((req) => new Promise((resolve) => { releaseSlow = () => resolve(serverPrice(req)); }));
    act(() => result.current.setQty('a', 25));           // slow request: would give 28
    await waitFor(() => expect(releaseSlow).toBeTypeOf('function'));
    act(() => result.current.setQty('a', 6));            // newer request: 30
    await waitFor(() => expect(get(result, 'a').price).toBe(30));
    const before = priceHistory.length;
    await act(async () => { releaseSlow(); });
    await new Promise((r) => setTimeout(r, 30));
    expect(priceHistory.slice(before)).not.toContain(28);
    expect(get(result, 'a').price).toBe(30);
    expect(get(result, 'a').quantityTierId).toBeNull();
  });

  it('a customer change swaps the tier for the negotiated price and back', async () => {
    const { result } = renderHook(() => useCart([line('a', 'A', 30)]));
    await waitFor(() => expect(get(result, 'a').price).toBe(28));

    act(() => result.current.setCustomer('ABC'));
    await waitFor(() => expect(get(result, 'a').price).toBe(25));
    expect(get(result, 'a').priceSource).toBe('CUSTOMER_SPECIFIC');
    expect(get(result, 'a').quantityTierId).toBeNull();

    act(() => result.current.setCustomer(null));
    await waitFor(() => expect(get(result, 'a').price).toBe(28));
    expect(get(result, 'a').customerPriceId).toBeNull();
  });
});
