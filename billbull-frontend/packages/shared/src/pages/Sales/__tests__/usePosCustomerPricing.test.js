import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/pricingApi', () => ({
  listPriceLevels: vi.fn(),
  resolvePrices: vi.fn(),
  getCustomerPricingStatus: vi.fn(),
}));

import { getCustomerPricingStatus, listPriceLevels, resolvePrices } from '../../../api/pricingApi';
import { usePosPriceLevel } from '../POS/features/pricing/usePosPriceLevel';

// Pricing Phase 2 — the POS cart follows the selected customer's negotiated prices: customer
// selected / replaced / removed (scenario D), fallback to their level (scenario B), manual
// overrides kept, and checkout blocked while prices are being recalculated.

const LEVELS = [
  { id: 1, name: 'Retail', systemDefault: true, active: true },
  { id: 2, name: 'Wholesale', systemDefault: false, active: true },
];
// Retail / Wholesale / ABC / XYZ, as in the business example.
const PRICES = {
  A: { retail: 30, wholesale: 27, ABC: 25, XYZ: 26 },
  B: { retail: 50, wholesale: 45, XYZ: 44 },
  C: { retail: 100, wholesale: 90, ABC: 85, XYZ: 88 },
};
const WALK_IN = { id: 'walk-in', name: 'Walk-in Customer' };
const ABC = { id: '501', code: 'ABC', name: 'ABC Trading', priceLevelId: 2 };
const XYZ = { id: '502', code: 'XYZ', name: 'XYZ Stores', priceLevelId: 2 };

const recalc = (items, billDiscountAmount = 0) => ({ items, billDiscountAmount, total: items.reduce((s, i) => s + i.total, 0) });
const line = (code, price, extra = {}) => ({ id: code, productId: code.charCodeAt(0), code, quantity: 1, price, discount: 0, total: price, ...extra });

function useHarness(initialCustomer, items) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [invoice, setInvoice] = useState(recalc(items));
  const level = usePosPriceLevel({
    items: invoice.items, customer, sessionId: 46, setCurrentInvoice: setInvoice, recalculateInvoice: recalc,
  });
  return { level, invoice, setCustomer };
}

const priceOf = (result, id) => result.current.invoice.items.find((i) => i.id === id).price;
const itemOf = (result, id) => result.current.invoice.items.find((i) => i.id === id);

let release = null;

describe('usePosPriceLevel — customer-specific prices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    release = null;
    listPriceLevels.mockResolvedValue(LEVELS);
    getCustomerPricingStatus.mockImplementation(async ({ customerCode }) => ({ liveMappings: customerCode ? 3 : 0 }));
    // Server stand-in: negotiated price → customer level → retail.
    resolvePrices.mockImplementation(async (req) => {
      const lines = req.items.map((it) => {
        const p = PRICES[it.itemCode];
        if (req.customerCode && p[req.customerCode] != null) {
          return { price: p[req.customerCode], basePrice: p.retail, source: 'CUSTOMER_SPECIFIC', customerPriceId: 9, fallbackPrice: p.wholesale };
        }
        if (req.customerCode) return { price: p.wholesale, basePrice: p.retail, source: 'PRICE_LEVEL' };
        return { price: p.retail, basePrice: p.retail, source: 'BASE_PRICE' };
      });
      if (release) await new Promise((r) => { release.push(r); });
      return { level: LEVELS[req.customerCode ? 1 : 0], lines, customer: req.customerCode ? { liveMappings: 3 } : null };
    });
  });

  it('scenario A/B: selecting ABC applies its negotiated prices and falls back to its level', async () => {
    const { result } = renderHook(() => useHarness(WALK_IN, [line('A', 30), line('B', 50), line('C', 100)]));
    await waitFor(() => expect(result.current.level.hasCustomLevels).toBe(true));

    act(() => result.current.setCustomer(ABC));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(25));
    expect(priceOf(result, 'B')).toBe(45);
    expect(priceOf(result, 'C')).toBe(85);
    expect(itemOf(result, 'A')).toMatchObject({ priceSource: 'CUSTOMER_SPECIFIC', customerPrice: 25 });
    expect(itemOf(result, 'B')).toMatchObject({ priceSource: 'PRICE_LEVEL', customerPrice: null });
    expect(resolvePrices).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'POS', sessionId: 46, customerCode: 'ABC' }));
    await waitFor(() => expect(result.current.level.customerPricing?.message).toBe('Customer price on 2 items'));
  });

  it('scenario D: replacing ABC with XYZ leaves no stale ABC prices; removing the customer returns to retail', async () => {
    const { result } = renderHook(() => useHarness(ABC, [line('A', 30), line('B', 50), line('C', 100)]));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(25));

    act(() => result.current.setCustomer(XYZ));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(26));
    expect(priceOf(result, 'B')).toBe(44);
    expect(priceOf(result, 'C')).toBe(88);

    act(() => result.current.setCustomer(WALK_IN));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(30));
    expect(itemOf(result, 'A')).toMatchObject({ priceSource: 'BASE_PRICE', customerPrice: null });
    expect(result.current.level.customerPricing).toBeNull();
  });

  it('a hand-priced line keeps its price across a customer change and loses the old negotiated floor', async () => {
    const { result } = renderHook(() => useHarness(ABC, [
      line('A', 30),
      line('C', 80, { priceOverridden: true, customerPrice: 85, priceSource: 'CUSTOMER_SPECIFIC' }),
    ]));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(25));

    act(() => result.current.setCustomer(XYZ));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(26));
    expect(priceOf(result, 'C')).toBe(80);
    await waitFor(() => expect(itemOf(result, 'C').customerPrice).toBeNull());
    const requested = resolvePrices.mock.calls.flatMap(([req]) => req.items.map((i) => i.itemCode));
    expect(requested).not.toContain('C');
  });

  it('reports pending while the new customer is being priced (checkout waits on it)', async () => {
    const { result } = renderHook(() => useHarness(WALK_IN, [line('A', 30)]));
    await waitFor(() => expect(result.current.level.hasCustomLevels).toBe(true));
    release = [];

    act(() => result.current.setCustomer(ABC));
    await waitFor(() => expect(result.current.level.pending).toBe(true));
    expect(priceOf(result, 'A')).toBe(30);

    await act(async () => { release.forEach((r) => r()); });
    await waitFor(() => expect(result.current.level.pending).toBe(false));
    expect(priceOf(result, 'A')).toBe(25);
  });

  it('shows the pricing badge for a customer with negotiated prices even without custom levels', async () => {
    listPriceLevels.mockResolvedValue([LEVELS[0]]);
    const { result } = renderHook(() => useHarness(ABC, [line('A', 30)]));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(25));
    expect(result.current.level.hasCustomLevels).toBe(false);
    expect(result.current.level.showPricing).toBe(true);
  });

  it('says so when the customer has no negotiated prices at all', async () => {
    getCustomerPricingStatus.mockResolvedValue({ liveMappings: 0 });
    const { result } = renderHook(() => useHarness({ id: '503', code: 'NOPE', priceLevelId: 2 }, [line('B', 50)]));
    await waitFor(() => expect(result.current.level.customerPricing?.message).toBe('No negotiated prices for this customer'));
  });
});
