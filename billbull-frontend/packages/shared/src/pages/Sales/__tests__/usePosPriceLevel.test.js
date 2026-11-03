import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/pricingApi', () => ({
  listPriceLevels: vi.fn(),
  resolvePrices: vi.fn(),
  getCustomerPricingStatus: vi.fn(async () => ({ liveMappings: 0 })),
}));

import { listPriceLevels, resolvePrices } from '../../../api/pricingApi';
import { usePosPriceLevel } from '../POS/features/pricing/usePosPriceLevel';

// Pricing Phase 1 — the POS cart follows the sale's price level: customer switch, explicit choice,
// back to the default, manual overrides kept, checkout payload level.

const LEVELS = [
  { id: 1, name: 'Retail', systemDefault: true, active: true },
  { id: 2, name: 'Wholesale', systemDefault: false, active: true },
  { id: 3, name: 'VIP', systemDefault: false, active: true },
];
const PRICES = { 1: 100, 2: 80, 3: 90 };
const WALK_IN = { id: 'walk-in', name: 'Walk-in Customer' };
const TRADE = { id: '7', code: 'C7', name: 'Trade Co', priceLevelId: 2 };
const STAR = { id: '8', code: 'C8', name: 'Star', priceLevelId: 3 };

const recalc = (items, billDiscountAmount = 0) => ({ items, billDiscountAmount, total: items.reduce((s, i) => s + i.total, 0) });

function useHarness(initialCustomer) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [invoice, setInvoice] = useState(recalc([
    { id: 10, productId: 10, code: 'P10', quantity: 2, price: 100, discount: 0, total: 200 },
    { id: 11, productId: 11, code: 'P11', quantity: 1, price: 55, discount: 0, total: 55, priceOverridden: true },
  ]));
  const level = usePosPriceLevel({
    items: invoice.items, customer, sessionId: 46, setCurrentInvoice: setInvoice, recalculateInvoice: recalc,
  });
  return { level, invoice, setCustomer };
}

const priceOf = (result, id) => result.current.invoice.items.find((i) => i.id === id).price;

describe('usePosPriceLevel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPriceLevels.mockResolvedValue(LEVELS);
    // Server stand-in: price by the level the request resolves to (explicit → customer → default).
    resolvePrices.mockImplementation(async (req) => {
      const customerLevel = req.customerCode === 'C7' ? 2 : req.customerCode === 'C8' ? 3 : 1;
      const levelId = req.priceLevelId ?? customerLevel;
      return {
        level: LEVELS.find((l) => l.id === levelId),
        lines: req.items.map(() => ({ price: PRICES[levelId], basePrice: 100, source: levelId === 1 ? 'BASE_PRICE' : 'PRICE_LEVEL' })),
      };
    });
  });

  it('makes no pricing call for a walk-in at default prices', async () => {
    const { result } = renderHook(() => useHarness(WALK_IN));
    await waitFor(() => expect(result.current.level.hasCustomLevels).toBe(true));
    expect(resolvePrices).not.toHaveBeenCalled();
    expect(result.current.level.effective.level.name).toBe('Retail');
  });

  it("re-prices the cart to the customer's level when the customer changes, and back again", async () => {
    const { result } = renderHook(() => useHarness(WALK_IN));
    await waitFor(() => expect(result.current.level.hasCustomLevels).toBe(true));

    act(() => result.current.setCustomer(TRADE));
    await waitFor(() => expect(priceOf(result, 10)).toBe(80));
    expect(result.current.level.effective.source).toBe('CUSTOMER');
    expect(result.current.invoice.items.find((i) => i.id === 10).total).toBe(160);
    // The hand-edited line keeps its price.
    expect(priceOf(result, 11)).toBe(55);
    expect(resolvePrices).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'POS', sessionId: 46, customerCode: 'C7', priceLevelId: null }));

    act(() => result.current.setCustomer(STAR));
    await waitFor(() => expect(priceOf(result, 10)).toBe(90));

    act(() => result.current.setCustomer(WALK_IN));
    await waitFor(() => expect(priceOf(result, 10)).toBe(100));
  });

  it('an explicit level overrides the customer and is cleared when the customer changes', async () => {
    const { result } = renderHook(() => useHarness(TRADE));
    await waitFor(() => expect(priceOf(result, 10)).toBe(80));

    act(() => result.current.level.setExplicitPriceLevelId(3));
    await waitFor(() => expect(priceOf(result, 10)).toBe(90));
    expect(result.current.level.effective.source).toBe('TRANSACTION');
    expect(result.current.level.explicitPriceLevelId).toBe(3);

    act(() => result.current.setCustomer(STAR));
    expect(result.current.level.explicitPriceLevelId).toBeNull();
  });

  it('choosing the default level for a level customer returns to default prices', async () => {
    const { result } = renderHook(() => useHarness(TRADE));
    await waitFor(() => expect(priceOf(result, 10)).toBe(80));

    act(() => result.current.level.setExplicitPriceLevelId(1));
    await waitFor(() => expect(priceOf(result, 10)).toBe(100));
  });

  it('reports a failed resolution without looping', async () => {
    resolvePrices.mockRejectedValue({ response: { data: { message: "Price level 'X' is inactive and cannot be used." } } });
    const { result } = renderHook(() => useHarness(TRADE));
    await waitFor(() => expect(result.current.level.error).toMatch(/inactive/));
    const calls = resolvePrices.mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(resolvePrices.mock.calls.length).toBe(calls);
    expect(priceOf(result, 10)).toBe(100);
  });

  it('reset() drops the explicit choice (new sale)', async () => {
    const { result } = renderHook(() => useHarness(WALK_IN));
    await waitFor(() => expect(result.current.level.hasCustomLevels).toBe(true));
    act(() => result.current.level.setExplicitPriceLevelId(2));
    act(() => result.current.level.reset());
    expect(result.current.level.explicitPriceLevelId).toBeNull();
  });
});
