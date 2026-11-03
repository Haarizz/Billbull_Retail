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

// Pricing Phase 2 — back-office documents (Quotation, Sales Order, Pro-forma): lines added from the
// product master follow the customer's negotiated prices; loaded lines and manual prices are kept.

const LEVELS = [{ id: 1, name: 'Retail', systemDefault: true, active: true }];
const recalcRow = (it) => ({ ...it, total: (Number(it.qty) || 0) * (Number(it.price) || 0) });

function useHarness(initialCustomer, initialItems, documentDate = '2026-11-02') {
  const [customer, setCustomer] = useState(initialCustomer);
  const [items, setItems] = useState(initialItems);
  const [date, setDate] = useState(documentDate);
  const pricing = useDocumentPricing({ items, setItems, customer, documentDate: date, recalcRow });
  return { pricing, items, setItems, setCustomer, setDate };
}

const row = (code, price, extra = {}) => ({ id: code, productId: code.charCodeAt(0), code, qty: 2, price, total: 2 * price, ...extra });
const priceOf = (result, id) => result.current.items.find((i) => i.id === id).price;

describe('useDocumentPricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPriceLevels.mockResolvedValue(LEVELS);
    getCustomerPricingStatus.mockResolvedValue({ liveMappings: 1 });
    resolvePrices.mockImplementation(async (req) => ({
      level: LEVELS[0],
      lines: req.items.map(() => (req.customerCode === 'ABC'
        ? { price: 25, source: 'CUSTOMER_SPECIFIC', customerPriceId: 3, fallbackPrice: 30 }
        : { price: 30, source: 'BASE_PRICE' })),
    }));
  });

  it('prices master lines at the customer price, keeps loaded and hand-edited lines', async () => {
    const { result } = renderHook(() => useHarness({ code: 'ABC', name: 'ABC' }, [
      row('A', 30, { priceLevelAuto: true }),
      row('L', 40),                                                    // loaded from a source document
      row('M', 22, { priceLevelAuto: true, priceOverridden: true }),   // typed by the user
    ]));

    await waitFor(() => expect(priceOf(result, 'A')).toBe(25));
    expect(result.current.items.find((i) => i.id === 'A').total).toBe(50);
    expect(priceOf(result, 'L')).toBe(40);
    expect(priceOf(result, 'M')).toBe(22);
    expect(resolvePrices).toHaveBeenCalledWith(expect.objectContaining({ customerCode: 'ABC', pricingDate: '2026-11-02' }));
    expect(resolvePrices.mock.calls[0][0].items.map((i) => i.itemCode)).toEqual(['A']);
    await waitFor(() => expect(result.current.pricing.summary?.message).toBe('Customer price on 1 item'));
  });

  it('re-prices when the customer is removed, and when the document date changes', async () => {
    const { result } = renderHook(() => useHarness({ code: 'ABC' }, [row('A', 30, { priceLevelAuto: true })]));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(25));

    act(() => result.current.setDate('2026-12-01'));
    await waitFor(() => expect(resolvePrices).toHaveBeenLastCalledWith(expect.objectContaining({ pricingDate: '2026-12-01' })));

    act(() => result.current.setCustomer(null));
    await waitFor(() => expect(priceOf(result, 'A')).toBe(30));
  });

  it('treats the walk-in placeholder as no customer', async () => {
    const { result } = renderHook(() => useHarness({ id: 'WALKIN-ID', code: 'WALKIN' }, [row('A', 30, { priceLevelAuto: true })]));
    await waitFor(() => expect(listPriceLevels).toHaveBeenCalled());
    expect(result.current.pricing.summary).toBeNull();
    expect(getCustomerPricingStatus).not.toHaveBeenCalled();
  });

  it('surfaces a failed resolution and leaves prices alone', async () => {
    resolvePrices.mockRejectedValue({ response: { data: { message: 'Pricing down' } } });
    const { result } = renderHook(() => useHarness({ code: 'ABC' }, [row('A', 30, { priceLevelAuto: true })]));
    await waitFor(() => expect(result.current.pricing.error).toBe('Pricing down'));
    expect(priceOf(result, 'A')).toBe(30);
  });

  it('manualPricePatch marks typed prices and asks auto lines for a fresh unit price', () => {
    expect(manualPricePatch({ price: 30 }, 'price', 28)).toEqual({ priceOverridden: true });
    expect(manualPricePatch({ price: 30 }, 'price', 30)).toBeNull();
    expect(manualPricePatch({ priceLevelAuto: true, priceLevelKey: 'default|c:ABC' }, 'unit', 'BOX'))
      .toEqual({ priceLevelKey: '__unit_changed__' });
    expect(manualPricePatch({ priceLevelAuto: true, priceOverridden: true, priceLevelKey: 'x' }, 'unit', 'BOX')).toBeNull();
  });
});
