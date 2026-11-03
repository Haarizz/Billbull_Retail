import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/pricingApi', () => ({
  listPriceLevels: vi.fn(),
  resolvePrices: vi.fn(),
  getCustomerPricingStatus: vi.fn(),
}));

import { getCustomerPricingStatus, listPriceLevels, resolvePrices } from '../../api/pricingApi';
import useDocumentPricing, { manualPricePatch } from '../useDocumentPricing';

// Pricing Phase 3 — back-office documents (Quotation / Sales Order / Pro-forma) re-price master
// lines when a quantity crosses a tier, counting the document's loaded / carried lines too.

const LEVELS = [{ id: 1, name: 'Retail', systemDefault: true, active: true, quantityTierCount: 2 }];
const recalcRow = (it) => ({ ...it, total: (Number(it.qty) || 0) * (Number(it.price) || 0) });

function useDoc(initialItems) {
  const [items, setItems] = useState(initialItems);
  const pricing = useDocumentPricing({ items, setItems, customer: null, documentDate: '2026-11-02', recalcRow });
  const change = (id, field, value) => setItems((prev) => prev.map((it) => (it.id === id
    ? { ...it, [field]: value, ...(manualPricePatch(it, field, value) || {}) } : it)));
  return { items, pricing, change };
}

const row = (id, code, qty, price, extra = {}) => ({ id, code, qty, price, unit: 'PCS', total: qty * price, ...extra });
const get = (result, id) => result.current.items.find((i) => i.id === id);

describe('useDocumentPricing — quantity tiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPriceLevels.mockResolvedValue(LEVELS);
    getCustomerPricingStatus.mockResolvedValue(null);
    resolvePrices.mockImplementation(async (req) => {
      const total = req.items.reduce((s, l) => s + (l.itemCode === 'A' ? Number(l.quantity) || 0 : 0), 0);
      return {
        level: LEVELS[0],
        lines: req.items.map((l) => (l.itemCode === 'A' && total >= 20
          ? { price: 28, source: 'QUANTITY_TIER', quantityTierId: 5, tierMinQuantity: 20, eligibleQuantity: total, untieredPrice: 30 }
          : { price: 30, source: 'BASE_PRICE', untieredPrice: 30 })),
      };
    });
  });

  it('re-prices a master line when its quantity reaches a tier, and recalculates its total', async () => {
    const { result } = renderHook(() => useDoc([row('m', 'A', 10, 30, { priceLevelAuto: true })]));
    await waitFor(() => expect(get(result, 'm').priceSource).toBe('BASE_PRICE'));

    act(() => result.current.change('m', 'qty', 20));
    await waitFor(() => expect(get(result, 'm').price).toBe(28));
    expect(get(result, 'm').total).toBe(560);
    expect(result.current.pricing.pending).toBe(false);
  });

  it('counts a loaded line towards the tier but keeps its own price', async () => {
    const { result } = renderHook(() => useDoc([
      row('loaded', 'A', 15, 29),                                   // carried from the source document
      row('m', 'A', 5, 30, { priceLevelAuto: true }),
    ]));
    await waitFor(() => expect(get(result, 'm').price).toBe(28));
    expect(get(result, 'loaded').price).toBe(29);
    const sent = resolvePrices.mock.calls.at(-1)[0].items;
    expect(sent.map((l) => l.quantity)).toEqual([5, 15]);
  });

  it('keeps a hand-typed price when the quantity changes', async () => {
    const { result } = renderHook(() => useDoc([row('m', 'A', 10, 30, { priceLevelAuto: true })]));
    await waitFor(() => expect(get(result, 'm').priceSource).toBe('BASE_PRICE'));
    act(() => result.current.change('m', 'price', 27));
    act(() => result.current.change('m', 'qty', 50));
    await new Promise((r) => setTimeout(r, 20));
    expect(get(result, 'm').price).toBe(27);
    expect(get(result, 'm').priceOverridden).toBe(true);
  });
});
