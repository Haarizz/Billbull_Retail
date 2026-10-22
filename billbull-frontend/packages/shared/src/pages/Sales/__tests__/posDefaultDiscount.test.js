import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  resolvePosEntry: vi.fn(),
}));

import { resolvePosEntry } from '../../../api/posApi';
import { mapPosProductAggregateItem, mapPosProductListItem } from '../POS/posUtils';
import { useCart } from '../POS/features/cart/useCart';
import { useProductEntry } from '../POS/features/products/useProductEntry';
import { INCLUSIVE_5 } from './fixtures/posCartFixtures';

/**
 * Which discount the till applies on add.
 *
 * The product master has two separate settings: "Maximum Discount %" (Product.maxDiscount, the
 * cap on what a cashier may give) and "POS Default Discount %" (ProductPricing.defaultDiscount,
 * applied automatically on add). The POS mappers used to put maxDiscount into defaultDiscount,
 * so a product priced 200 with a 190 minimum and a 10% cap went into the cart at 180 and asked
 * for a supervisor PIN on every scan. Both POS apps render the same POSSales, so these cover
 * the embedded and the standalone till alike.
 */

// /api/pos/resolve aggregate shaped like the scratch tenant's 0.5HP pump.
const aggregate = ({ defaultDiscount = 0, maxDiscount = 10, minPrice = 190, pricingKey = 'effectivePricing' } = {}) => ({
  product: { id: 1, code: '10672', name: 'Pump', barcode: 'GE-1', maxDiscount, isBatch: false },
  [pricingKey]: { retailPrice: 200, minPrice, maxPrice: 220, cost: 100, defaultDiscount },
  activeBranchPrice: { retailPrice: 200, minPrice, maxPrice: 220, cost: 100 },
  tax: { salesTax: 5 },
  stock: 25,
});

const GATED = { ...INCLUSIVE_5, requirePriceOverrideApproval: true };

const setup = () => {
  const requestApproval = vi.fn();
  const view = renderHook(() => {
    const cart = useCart({ posSettings: GATED });
    const entry = useProductEntry({
      posSettings: GATED,
      currentRenderCount: 1,
      setCurrentInvoice: cart.setCurrentInvoice,
      currentInvoiceRef: cart.currentInvoiceRef,
      recalculateInvoice: cart.recalculateInvoice,
      productCacheRef: { current: new Map() },
      showFeedback: vi.fn(),
      requestApproval,
      setBarcodeInput: vi.fn(),
      setSearchQuery: vi.fn(),
      setSelectedCustomer: vi.fn(),
      applyScannedVoucher: vi.fn(),
    });
    return { cart, entry };
  });
  return {
    requestApproval,
    items: () => view.result.current.cart.currentInvoice.items,
    scan: async (agg) => {
      resolvePosEntry.mockResolvedValueOnce({ type: 'PRODUCT', product: agg });
      await act(async () => { await view.result.current.entry.handleUnifiedEntry('GE-1'); });
    },
    add: async (...args) => {
      let out;
      await act(async () => { out = view.result.current.entry.addToInvoice(...args); });
      return out;
    },
  };
};

beforeEach(() => { resolvePosEntry.mockReset(); });

describe('POS product mapping — default discount vs maximum discount', () => {
  it('a scanned product does not receive its maximum discount', () => {
    expect(mapPosProductAggregateItem(aggregate()).defaultDiscount).toBe(0);
  });

  it('a scanned product carries its configured POS default discount', () => {
    expect(mapPosProductAggregateItem(aggregate({ defaultDiscount: 3 })).defaultDiscount).toBe(3);
  });

  it('reads the default from product pricing even when only the branch row has prices', () => {
    const agg = aggregate({ defaultDiscount: 4, pricingKey: 'pricing' });
    expect(mapPosProductAggregateItem(agg).defaultDiscount).toBe(4);
  });

  it('a list/grid row maps defaultDiscount, never maxDiscount', () => {
    const row = { id: 1, name: 'Pump', retailPrice: 200, minPrice: 190, maxDiscount: 10 };
    expect(mapPosProductListItem(row).defaultDiscount).toBe(0);
    expect(mapPosProductListItem({ ...row, defaultDiscount: '7.5' }).defaultDiscount).toBe(7.5);
  });
});

describe('POS add — the price-floor gate with the corrected discount', () => {
  it('scanning a product at its selling price adds it at full price without supervisor approval', async () => {
    const h = setup();
    await h.scan(aggregate());
    expect(h.requestApproval).not.toHaveBeenCalled();
    expect(h.items()).toHaveLength(1);
    expect(h.items()[0]).toMatchObject({ price: 200, discount: 0 });
  });

  it('a price equal to the minimum is accepted (the floor is strictly less-than)', async () => {
    const h = setup();
    const product = mapPosProductAggregateItem(aggregate());
    expect(await h.add(product, 1, null, null, null, { price: 190 })).toEqual({ ok: true });
    expect(h.requestApproval).not.toHaveBeenCalled();
  });

  it('a manual discount that stays on the floor follows the normal add', async () => {
    const h = setup();
    const product = mapPosProductAggregateItem(aggregate());
    // 200 at 5% = 190, exactly the minimum.
    expect(await h.add(product, 1, null, null, null, { discount: 5 })).toEqual({ ok: true });
    expect(h.items()[0].discount).toBe(5);
  });

  it('an explicit discount below the minimum still asks for supervisor approval', async () => {
    const h = setup();
    const product = mapPosProductAggregateItem(aggregate());
    // 10% is within the product's cap but 180 is under the 190 minimum.
    const res = await h.add(product, 1, null, null, null, { discount: 10 });
    expect(res).toEqual({ ok: false, reason: 'supervisor-approval-required' });
    expect(h.requestApproval.mock.calls[0][0].priceOverride).toMatchObject({ minPrice: 190, attemptedPrice: 180 });
    expect(h.items()).toHaveLength(0);
  });

  it('an explicit price below the minimum still asks for supervisor approval', async () => {
    const h = setup();
    const product = mapPosProductAggregateItem(aggregate());
    const res = await h.add(product, 1, null, null, null, { price: 185 });
    expect(res).toEqual({ ok: false, reason: 'supervisor-approval-required' });
    expect(h.items()).toHaveLength(0);
  });

  it('a configured POS default discount is applied on scan', async () => {
    const h = setup();
    await h.scan(aggregate({ defaultDiscount: 3 })); // 194, above the floor
    expect(h.requestApproval).not.toHaveBeenCalled();
    expect(h.items()[0]).toMatchObject({ price: 200, discount: 3 });
  });

  it('a configured default discount that breaches the floor is still gated', async () => {
    const h = setup();
    await h.scan(aggregate({ defaultDiscount: 6 })); // 188 < 190
    expect(h.requestApproval).toHaveBeenCalledTimes(1);
    expect(h.requestApproval.mock.calls[0][0].priceOverride.attemptedPrice).toBeCloseTo(188, 6);
    expect(h.items()).toHaveLength(0);
  });
});
