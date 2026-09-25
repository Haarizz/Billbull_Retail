import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  resolvePosEntry: vi.fn(),
}));

import { resolvePosEntry } from '../../../api/posApi';
import { useCart } from '../POS/features/cart/useCart';
import { useProductEntry } from '../POS/features/products/useProductEntry';
import { EXCLUSIVE_5 } from './fixtures/posCartFixtures';

/**
 * CHARACTERIZATION — the product-entry boundary.
 *
 * `addToInvoice` (~190 lines) and `handleUnifiedEntry` (~180 lines) lived inline in
 * POSSales.jsx, reachable only through the whole screen, and were the single most
 * business-critical uncovered path in the POS: everything a cashier scans, types or taps
 * becomes a cart line through them. The Phase 3 extraction moved them verbatim, together
 * with handleProductSelection and the Item Entry dialog state, into useProductEntry.
 *
 * SCOPE. The cart ARITHMETIC is already the oracle of posCartTotals.characterization and
 * useCart.characterization; the tax-mode resolution is posBarcodeTaxMode's; the floor
 * predicate itself is getCartPriceWarning's. None of those are duplicated here. What
 * these tests establish is the ENTRY contract:
 *
 *   - the resolution routing (cache / PRODUCT / CUSTOMER / VOUCHER / BLOCKED / no match)
 *   - the quantity-prefix parser
 *   - the one-batch-one-unit rules and the pinned-line identity
 *   - the price-floor gate, what it enqueues, and the approved retry
 *   - the Product Entry Mode decision and its `deferred` contract
 *   - the exact cart line addToInvoice writes, and that it writes it through useCart
 *
 * The hook is driven against a REAL useCart in most tests, so "the cart stays the one
 * authoritative object" is asserted rather than assumed.
 *
 * These describe CURRENT behaviour. Several assertions below lock in quirks
 * (`isAbsoluteQuantity` being a no-op on a fresh line, an expired grid re-add message,
 * a cart line carrying no unit at all). They are characterized, not endorsed.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A /api/pos/resolve product aggregate, the shape mapPosProductAggregateItem eats. */
const aggregate = ({ id = 'p1', code = 'SKU-1', name = 'Widget', barcode = 'BC-1',
  retailPrice = 100, minPrice = null, cost = null, maxDiscount = 0, salesTax = null,
  isBatch = false, isSerial = false, availableInPos = true } = {}) => ({
  product: { id, code, name, barcode, maxDiscount, isBatch, isSerial, availableInPos },
  effectivePricing: { retailPrice, minPrice, cost },
  tax: { salesTax },
});

/** A product already mapped into the in-memory cache shape (mapPosProductListItem output). */
const cached = (over = {}) => ({
  id: 'c1', code: 'SKU-C', name: 'Cached', nameAr: '', barcode: 'BC-C',
  price: 50, minPrice: null, maxPrice: null, retailPrice: 50, cost: null,
  stock: 10, image: null, departmentId: null, departmentName: '', productType: '',
  salesTax: null, defaultDiscount: 0,
  isBatch: false, isSerial: false, fefoEnabled: false, availableInPos: true,
  ...over,
});

// ── Harness ─────────────────────────────────────────────────────────────────

let events;
const log = (name) => (...args) => { events.push([name, ...args]); return undefined; };

/**
 * Renders useProductEntry on top of a real useCart, exactly as POSSales composes them.
 * Every non-cart input is a spy so the boundary is observable.
 */
const setup = ({ posSettings = EXCLUSIVE_5, productEntryMode, cacheSeed = [], voucherOutcome } = {}) => {
  events = [];
  const settings = productEntryMode ? { ...posSettings, productEntryMode } : posSettings;

  const productCacheRef = { current: new Map(cacheSeed.map((p) => [String(p.barcode).toLowerCase(), p])) };
  const showFeedback = vi.fn((type, message) => { events.push(['feedback', type, message]); });
  const spies = {
    // The approval queue moved to useSupervisorApproval: entry now enqueues through one
    // requestApproval call instead of four individual setters. The setter sequence it used
    // to run inline is covered by useSupervisorApproval.characterization.test.js.
    requestApproval: vi.fn((r) => { events.push(['request-approval', r && r.priceOverride && r.priceOverride.type]); }),
    setBarcodeInput: vi.fn((v) => { events.push(['clear-barcode', v]); }),
    setSearchQuery: vi.fn((v) => { events.push(['clear-search', v]); }),
    setSelectedCustomer: vi.fn((v) => { events.push(['set-customer', v]); }),
    applyScannedVoucher: vi.fn((v) => {
      events.push(['apply-voucher', v && v.voucherCode]);
      return voucherOutcome ?? { ok: true, message: 'Voucher applied' };
    }),
  };

  const view = renderHook(({ s }) => {
    const cart = useCart({ posSettings: s });
    const entry = useProductEntry({
      posSettings: s,
      currentRenderCount: 1,
      setCurrentInvoice: cart.setCurrentInvoice,
      currentInvoiceRef: cart.currentInvoiceRef,
      recalculateInvoice: cart.recalculateInvoice,
      productCacheRef,
      showFeedback,
      ...spies,
    });
    return { cart, entry };
  }, { initialProps: { s: settings } });

  return { view, spies, productCacheRef, showFeedback, get cart() { return view.result.current.cart; }, get entry() { return view.result.current.entry; } };
};

const items = (h) => h.view.result.current.cart.currentInvoice.items;
const feedback = () => events.filter((e) => e[0] === 'feedback').map((e) => [e[1], e[2]]);

/** Drives handleUnifiedEntry and lets the ref-sync effects settle. */
const scan = async (h, raw, opts) => {
  await act(async () => { await h.entry.handleUnifiedEntry(raw, opts); });
};

const add = async (h, ...args) => {
  let out;
  await act(async () => { out = h.entry.addToInvoice(...args); });
  return out;
};

beforeEach(() => { resolvePosEntry.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

// ── Hook surface ────────────────────────────────────────────────────────────

describe('hook surface', () => {
  it('exposes exactly the entry points POSSales consumes', () => {
    const h = setup();
    ['addToInvoice', 'handleUnifiedEntry', 'handleBarcodeScan', 'handleProductSelection',
      'handleEditItem', 'setLastScannedItem', 'closeItemEntry', 'handleItemEntryConfirm',
    ].forEach((k) => expect(typeof h.entry[k]).toBe('function'));
    expect(h.entry.lastScannedItem).toBeNull();
    expect(h.entry.isItemEntryOpen).toBe(false);
    expect(h.entry.itemEntryAction).toBe('add');
    expect(h.entry.itemEntryInitialValues).toEqual({ quantity: 1 });
  });

  it('CHARACTERIZED BEHAVIOUR: createInvoiceLine/updateInvoiceLine stay private, so no caller can bypass the Product Entry Mode decision', () => {
    const h = setup();
    expect(h.entry.createInvoiceLine).toBeUndefined();
    expect(h.entry.updateInvoiceLine).toBeUndefined();
  });

  it('handleBarcodeScan is the same function object as handleUnifiedEntry, not a wrapper', () => {
    const h = setup();
    expect(h.entry.handleBarcodeScan).toBe(h.entry.handleUnifiedEntry);
  });

  it('declares no cart state of its own — the cart it mutates is useCart\'s', async () => {
    const h = setup();
    await add(h, { id: 'p1', name: 'Widget', price: 10 });
    expect(h.cart.currentInvoice.items).toHaveLength(1);
    // The ref useCheckout / useHeldSales / useLayaway / useDelivery all read.
    await waitFor(() => expect(h.cart.currentInvoiceRef.current.items).toHaveLength(1));
    expect(h.cart.currentInvoiceRef.current).toBe(h.cart.currentInvoice);
    expect(h.entry.currentInvoice).toBeUndefined();
  });
});

// ── addToInvoice: the cart line it writes ───────────────────────────────────

describe('addToInvoice — line shape', () => {
  const PRODUCT = {
    id: 'p1', code: 'SKU-1', name: 'Widget', localName: 'ودجت', barcode: 'BC-1',
    price: 200, minPrice: 100, maxPrice: 300, retailPrice: 200, cost: 80,
    defaultDiscount: 10, salesTax: 5, image: null,
  };

  it('writes the full line and recalculates the cart in one setCurrentInvoice', async () => {
    const h = setup();
    expect(await add(h, PRODUCT, 2)).toEqual({ ok: true });

    expect(items(h)).toEqual([expect.objectContaining({
      id: 'p1', productId: 'p1', name: 'Widget', nameAr: 'ودجت',
      barcode: 'BC-1', code: 'SKU-1', image: null,
      price: 200, minPrice: 100, maxPrice: 300, retailPrice: 200, cost: 80,
      quantity: 2, discount: 10, taxRate: 5, notes: '',
      total: 360, // 200 * 2 * (1 - 10/100)
      pinnedBatchNumber: null, serialNumber: null, expiryDate: null,
      batchControlled: false,
    })]);
    // Totals came from the cart boundary, not from a second calculator.
    expect(h.cart.currentInvoice.subtotal).toBeCloseTo(400, 6);
    expect(h.cart.currentInvoice.totalDiscount).toBeCloseTo(40, 6);
  });

  it('CHARACTERIZED BEHAVIOUR: the cart line carries no unit at all — "Each" is hard-coded later, in cartItemsToPayload', async () => {
    const h = setup();
    await add(h, PRODUCT);
    expect(items(h)[0]).not.toHaveProperty('unit');
    expect(h.cart.cartItemsToPayload(items(h))[0].unit).toBe('Each');
  });

  it('prefers the Arabic name from localName and falls back to nameAr, then empty', async () => {
    const h = setup();
    await add(h, { id: 'a', name: 'A', price: 1, localName: 'L', nameAr: 'N' });
    await add(h, { id: 'b', name: 'B', price: 1, nameAr: 'N' });
    await add(h, { id: 'c', name: 'C', price: 1 });
    expect(items(h).map((i) => [i.id, i.nameAr])).toEqual([['c', ''], ['b', 'N'], ['a', 'L']]);
  });

  it('adds new lines to the TOP of the cart', async () => {
    const h = setup();
    await add(h, { id: 'p1', name: 'First', price: 1 });
    await add(h, { id: 'p2', name: 'Second', price: 1 });
    expect(items(h).map((i) => i.id)).toEqual(['p2', 'p1']);
  });

  it('falls back through barcode → code → id for the line barcode', async () => {
    const h = setup();
    await add(h, { id: 'p1', name: 'A', price: 1, code: 'C1' });
    await add(h, { id: 'p2', name: 'B', price: 1 });
    expect(items(h).map((i) => i.barcode)).toEqual(['p2', 'C1']);
  });
});

describe('addToInvoice — quantity, price, discount and tax resolution', () => {
  const P = { id: 'p1', name: 'Widget', price: 100 };

  it('defaults quantity to 1 and clamps zero / negative / NaN up to 1', async () => {
    for (const q of [undefined, 0, -3, NaN, 'abc', null]) {
      const h = setup();
      await add(h, P, q);
      expect(items(h)[0].quantity).toBe(1);
    }
  });

  it('accepts a numeric-string quantity', async () => {
    const h = setup();
    await add(h, P, '4');
    expect(items(h)[0].quantity).toBe(4);
  });

  it('takes price/discount/taxRate/notes from overrides when present, product otherwise', async () => {
    const h = setup();
    await add(h, { ...P, defaultDiscount: 7, salesTax: 5 }, 1, null, null, null,
      { price: 55, discount: 20, taxRate: 0, notes: 'hand priced' });
    expect(items(h)[0]).toMatchObject({ price: 55, discount: 20, taxRate: 0, notes: 'hand priced', total: 44 });
  });

  it('CHARACTERIZED BEHAVIOUR: an override price of 0 is honoured (=== undefined is the test, not falsiness)', async () => {
    const h = setup();
    await add(h, P, 1, null, null, null, { price: 0, discount: 0 });
    expect(items(h)[0]).toMatchObject({ price: 0, total: 0 });
  });

  it('resolves the line tax rate from salesTax, then the branch default, and 0 when tax is disabled', async () => {
    const own = setup();
    await add(own, { ...P, salesTax: 12 });
    expect(items(own)[0].taxRate).toBe(12);

    const dflt = setup();
    await add(dflt, P);
    expect(items(dflt)[0].taxRate).toBe(EXCLUSIVE_5.branchDefaultVatRate);

    const off = setup({ posSettings: { ...EXCLUSIVE_5, taxEnabled: false } });
    await add(off, { ...P, salesTax: 12 });
    expect(items(off)[0].taxRate).toBe(0);
  });

  it('CHARACTERIZED BEHAVIOUR: isAbsoluteQuantity is a no-op for a NEW line — both ternary branches are identical', async () => {
    const h = setup();
    await add(h, P, 3, null, null, null, { isAbsoluteQuantity: true });
    expect(items(h)[0].quantity).toBe(3);
  });

  it('CHARACTERIZED BEHAVIOUR: minPrice/maxPrice/retailPrice/cost of "" or null land on the line as null, not 0', async () => {
    const h = setup();
    await add(h, { ...P, minPrice: '', maxPrice: null, retailPrice: undefined, cost: '' });
    expect(items(h)[0]).toMatchObject({ minPrice: null, maxPrice: null, retailPrice: null, cost: null });
  });
});

describe('addToInvoice — merging an existing line', () => {
  const P = { id: 'p1', name: 'Widget', price: 100, defaultDiscount: 0, salesTax: 5 };

  it('a second plain add bumps the existing line rather than creating a duplicate', async () => {
    const h = setup();
    await add(h, P, 2);
    await add(h, P, 3);
    expect(items(h)).toHaveLength(1);
    expect(items(h)[0]).toMatchObject({ quantity: 5, total: 500 });
  });

  it('isAbsoluteQuantity REPLACES the merged quantity instead of adding to it', async () => {
    const h = setup();
    await add(h, P, 2);
    await add(h, P, 7, null, null, null, { isAbsoluteQuantity: true });
    expect(items(h)[0].quantity).toBe(7);
  });

  it('a merge keeps the existing price/discount/tax unless the override supplies one', async () => {
    const h = setup();
    await add(h, P, 1, null, null, null, { price: 90, discount: 10, taxRate: 0 });
    await add(h, P, 1);
    expect(items(h)[0]).toMatchObject({ quantity: 2, price: 90, discount: 10, taxRate: 0 });
    await add(h, P, 1, null, null, null, { price: 80 });
    expect(items(h)[0]).toMatchObject({ quantity: 3, price: 80, discount: 10, taxRate: 0 });
  });

  it('CHARACTERIZED BEHAVIOUR: a merge matches on item.id, so a pinned line is never merged into', async () => {
    const h = setup();
    await add(h, P, 1, 'BATCH-A');
    await add(h, P, 1);
    expect(items(h).map((i) => i.id)).toEqual(['p1', 'p1::BATCH-A']);
  });
});

describe('addToInvoice — batch / serial rules', () => {
  const BATCH = { id: 'b1', name: 'Vaccine', price: 100, isBatch: true };
  const SERIAL = { id: 's1', name: 'Phone', price: 900, isSerial: true };

  it('a pinned batch gets a composite id, carries the expiry and is quantity-locked in the cart UI', async () => {
    const h = setup();
    await add(h, BATCH, 1, 'BATCH-A', null, '2027-01-31');
    expect(items(h)[0]).toMatchObject({
      id: 'b1::BATCH-A', productId: 'b1', quantity: 1,
      pinnedBatchNumber: 'BATCH-A', serialNumber: null,
      expiryDate: '2027-01-31', batchControlled: true,
    });
  });

  it('CHARACTERIZED DEFECT (preserved): a pinned BATCH does not force qty 1 — only a pinned SERIAL does', async () => {
    // isPinned suppresses isBatchControlled, and the qty-1 clamp is keyed on
    // (pinnedSerialNumber || isBatchControlled). So addToInvoice(product, 5, 'BATCH-A')
    // writes a five-unit line against a single physical batch unit. Nothing hits this in
    // production because handleUnifiedEntry computes effectiveQty = 1 for a pinned batch
    // before calling in — the guard lives at the caller, not here. Left exactly as found.
    const h = setup();
    await add(h, BATCH, 5, 'BATCH-A');
    expect(items(h)[0].quantity).toBe(5);
    // The serial pin, by contrast, clamps inside addToInvoice itself.
    const s = setup();
    await add(s, SERIAL, 5, null, 'SN-9');
    expect(items(s)[0].quantity).toBe(1);
  });

  it('a pinned serial keys the line S:<serial> and is always qty 1', async () => {
    const h = setup();
    await add(h, SERIAL, 4, null, 'SN-9');
    expect(items(h)[0]).toMatchObject({ id: 's1::S:SN-9', quantity: 1, serialNumber: 'SN-9', batchControlled: true });
  });

  it('a serial pin wins over a batch pin when building the composite key', async () => {
    const h = setup();
    await add(h, SERIAL, 1, 'BATCH-A', 'SN-9');
    expect(items(h)[0].id).toBe('s1::S:SN-9');
  });

  it('two distinct scanned batches of one product are two separate lines', async () => {
    const h = setup();
    await add(h, BATCH, 1, 'BATCH-A');
    await add(h, BATCH, 1, 'BATCH-B');
    expect(items(h).map((i) => i.id)).toEqual(['b1::BATCH-B', 'b1::BATCH-A']);
  });

  it('an UNPINNED batch-controlled add is forced to qty 1 and locked', async () => {
    const h = setup();
    await add(h, BATCH, 9);
    expect(items(h)[0]).toMatchObject({ id: 'b1', quantity: 1, pinnedBatchNumber: null, batchControlled: true });
  });

  it('refuses an unpinned re-add of a batch-controlled product, naming the product, and leaves the cart untouched', async () => {
    const h = setup();
    await add(h, BATCH, 1);
    expect(await add(h, BATCH, 1)).toEqual({
      ok: false, reason: 'Vaccine is batch-tracked — scan a specific batch to add another unit.',
    });
    expect(items(h)).toHaveLength(1);
  });

  it('CHARACTERIZED BEHAVIOUR: the re-add guard matches productId OR id, so it also blocks after a PINNED line exists', async () => {
    const h = setup();
    await add(h, BATCH, 1, 'BATCH-A');
    await waitFor(() => expect(h.cart.currentInvoiceRef.current.items).toHaveLength(1));
    expect(await add(h, BATCH, 1)).toMatchObject({ ok: false });
  });

  it('CHARACTERIZED BEHAVIOUR: the re-add guard reads currentInvoiceRef, which lags a synchronous double-add within one tick', async () => {
    const h = setup();
    let a; let b;
    await act(async () => {
      a = h.entry.addToInvoice(BATCH, 1);
      b = h.entry.addToInvoice(BATCH, 1);
    });
    // Both passed the guard because the ref had not been re-synced between them; the
    // no-merge rule then meant the second replaced nothing and two lines exist.
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(items(h)).toHaveLength(2);
  });
});

// ── The price-floor / supervisor gate ───────────────────────────────────────

describe('addToInvoice — price-floor supervisor gate', () => {
  const FLOORED = { id: 'p1', name: 'Widget', price: 50, minPrice: 80, cost: 40 };
  const GATED = { ...EXCLUSIVE_5, requirePriceOverrideApproval: true };

  it('is inert when the admin has not enabled Price Override approval', async () => {
    const h = setup();
    expect(await add(h, FLOORED)).toEqual({ ok: true });
    expect(items(h)).toHaveLength(1);
    expect(h.spies.requestApproval).not.toHaveBeenCalled();
  });

  it('enqueues the whole request, opens the PIN dialog and adds NOTHING when below floor', async () => {
    const h = setup({ posSettings: GATED });
    const res = await add(h, FLOORED, 3, 'BATCH-A', null, '2027-01-01', { notes: 'n' });

    expect(res).toEqual({ ok: false, reason: 'supervisor-approval-required' });
    expect(items(h)).toHaveLength(0);
    expect(h.spies.requestApproval).toHaveBeenCalledWith({
      priceOverride: {
        type: 'ADD_ITEM',
        product: FLOORED, quantity: 3, batch: 'BATCH-A', serial: null, expiry: '2027-01-01',
        overrides: { notes: 'n' }, itemName: 'Widget', minPrice: 80, attemptedPrice: 50,
      },
    });
    expect(events.map((e) => e[0])).toEqual(['request-approval']);
  });

  it('applies the line discount BEFORE comparing to the floor, mirroring the backend gate', async () => {
    const h = setup({ posSettings: GATED });
    // 100 at 30% off = 70, under the 80 floor, even though the list price clears it.
    const res = await add(h, { id: 'p1', name: 'W', price: 100, minPrice: 80 }, 1, null, null, null, { discount: 30 });
    expect(res).toMatchObject({ ok: false });
    expect(h.spies.requestApproval.mock.calls[0][0].priceOverride.attemptedPrice).toBeCloseTo(70, 6);
  });

  it('uses cost as the floor when minPrice is absent, and no floor at all when both are absent', async () => {
    const onCost = setup({ posSettings: GATED });
    await add(onCost, { id: 'p1', name: 'W', price: 10, cost: 40 });
    expect(items(onCost)).toHaveLength(0);
    expect(onCost.spies.requestApproval.mock.calls[0][0].priceOverride.minPrice).toBe(40);

    const noFloor = setup({ posSettings: GATED });
    expect(await add(noFloor, { id: 'p2', name: 'W', price: 10 })).toEqual({ ok: true });
  });

  it('does not gate a price exactly ON the floor — the comparison is strictly less-than', async () => {
    const h = setup({ posSettings: GATED });
    expect(await add(h, { id: 'p1', name: 'W', price: 80, minPrice: 80 })).toEqual({ ok: true });
  });

  it('the approved retry adds the line and never re-gates (this is the successful-override path)', async () => {
    const h = setup({ posSettings: GATED });
    await add(h, FLOORED, 2);
    expect(items(h)).toHaveLength(0);

    const req = h.spies.requestApproval.mock.calls[0][0].priceOverride;
    // Exactly what the approval dispatcher sends back into this hook.
    const res = await add(h, req.product, req.quantity, req.batch, req.serial, req.expiry,
      { ...req.overrides, approved: true });

    expect(res).toEqual({ ok: true });
    expect(items(h)).toHaveLength(1);
    expect(items(h)[0]).toMatchObject({ id: 'p1', quantity: 2, price: 50 });
    expect(h.spies.requestApproval).toHaveBeenCalledTimes(1);
  });

  it('a cancelled/failed override leaves the cart empty — the hook itself never resumes', async () => {
    const h = setup({ posSettings: GATED });
    await add(h, FLOORED);
    // Nothing further happens inside this hook: dequeue lives in POSSales.
    expect(items(h)).toHaveLength(0);
    expect(h.cart.currentInvoice.total).toBe(0);
  });

  it('CHARACTERIZED BEHAVIOUR: the floor gate runs BEFORE the batch re-add guard, so a floored batch re-add reports approval, not the batch refusal', async () => {
    const h = setup({ posSettings: GATED });
    await add(h, { id: 'b1', name: 'V', price: 500, isBatch: true });
    const res = await add(h, { id: 'b1', name: 'V', price: 10, minPrice: 80, isBatch: true });
    expect(res).toEqual({ ok: false, reason: 'supervisor-approval-required' });
  });
});

// ── Product Entry Mode ──────────────────────────────────────────────────────

describe('handleProductSelection — the single Product Entry Mode decision', () => {
  const P = { id: 'p1', name: 'Widget', price: 100 };

  it('refuses a missing product', () => {
    const h = setup();
    expect(h.entry.handleProductSelection(null)).toEqual({ ok: false, reason: 'No product selected' });
    expect(h.entry.handleProductSelection(undefined)).toEqual({ ok: false, reason: 'No product selected' });
  });

  it('DIRECT_ADD is the default and passes addToInvoice\'s result straight through', async () => {
    const h = setup();
    let res;
    await act(async () => { res = h.entry.handleProductSelection(P, { quantity: 3 }); });
    expect(res).toEqual({ ok: true });
    expect(items(h)[0].quantity).toBe(3);

    let refusal;
    await act(async () => {
      h.entry.handleProductSelection({ id: 'b1', name: 'V', price: 1, isBatch: true });
    });
    await waitFor(() => expect(h.cart.currentInvoiceRef.current.items).toHaveLength(2));
    await act(async () => {
      refusal = h.entry.handleProductSelection({ id: 'b1', name: 'V', price: 1, isBatch: true });
    });
    expect(refusal).toMatchObject({ ok: false });
  });

  it('an unrecognised mode string still takes DIRECT_ADD — there is deliberately no dialog fallback', async () => {
    const h = setup({ productEntryMode: 'SOMETHING_ELSE' });
    await act(async () => { h.entry.handleProductSelection(P); });
    expect(items(h)).toHaveLength(1);
  });

  it('OPEN_ENTRY_DIALOG adds nothing, opens the dialog and returns the deferred contract', async () => {
    const h = setup({ productEntryMode: 'OPEN_ENTRY_DIALOG' });
    let res;
    await act(async () => { res = h.entry.handleProductSelection(P, { quantity: 4 }); });

    expect(res).toEqual({ ok: true, deferred: true });
    expect(items(h)).toHaveLength(0);
    expect(h.entry.isItemEntryOpen).toBe(true);
    expect(h.entry.itemEntryAction).toBe('add');
    expect(h.entry.selectedProductForEntry).toBe(P);
    expect(h.entry.itemEntryContext).toEqual({
      batch: null, serial: null, expiry: null, quantity: 4, lockQuantity: false,
    });
    expect(h.entry.itemEntryInitialValues).toEqual({ quantity: 4 });
  });

  it('OPEN_ENTRY_DIALOG locks quantity at 1 for any controlled unit — scanned batch, scanned serial, or a flagged product', async () => {
    for (const [opts, product] of [
      [{ quantity: 5, batch: 'B1' }, P],
      [{ quantity: 5, serial: 'S1' }, P],
      [{ quantity: 5 }, { ...P, isBatch: true }],
      [{ quantity: 5 }, { ...P, isSerial: true }],
    ]) {
      const h = setup({ productEntryMode: 'OPEN_ENTRY_DIALOG' });
      await act(async () => { h.entry.handleProductSelection(product, opts); });
      expect(h.entry.itemEntryContext).toMatchObject({ quantity: 1, lockQuantity: true });
    }
  });

  it('closeItemEntry clears the dialog state but leaves the action verb as it was', async () => {
    const h = setup({ productEntryMode: 'OPEN_ENTRY_DIALOG' });
    await act(async () => { h.entry.handleProductSelection(P); });
    await act(async () => { h.entry.closeItemEntry(); });
    expect(h.entry.isItemEntryOpen).toBe(false);
    expect(h.entry.selectedProductForEntry).toBeNull();
    expect(h.entry.itemEntryContext).toBeNull();
    expect(h.entry.itemEntryAction).toBe('add');
  });
});

describe('the Item Entry dialog confirm', () => {
  const P = { id: 'p1', name: 'Widget', price: 100, minPrice: 80 };

  const openFor = async (h, product = P, opts = {}) => {
    await act(async () => { h.entry.handleProductSelection(product, opts); });
  };

  it('re-attaches the scan-pinned unit and adds the confirmed line at the exact confirmed quantity', async () => {
    const h = setup({ productEntryMode: 'OPEN_ENTRY_DIALOG' });
    await openFor(h, P, { quantity: 1, batch: 'BATCH-A', expiry: '2027-01-01' });
    await act(async () => {
      h.entry.handleItemEntryConfirm({ product: P, quantity: 1, price: 120, discount: 5, notes: 'ok' });
    });
    expect(items(h)[0]).toMatchObject({
      id: 'p1::BATCH-A', quantity: 1, price: 120, discount: 5, notes: 'ok',
      pinnedBatchNumber: 'BATCH-A', expiryDate: '2027-01-01',
    });
    expect(h.entry.isItemEntryOpen).toBe(false);
  });

  it('refuses a payload with no product and surfaces it through the feedback toaster, keeping the dialog open', async () => {
    const h = setup({ productEntryMode: 'OPEN_ENTRY_DIALOG' });
    await openFor(h);
    await act(async () => { h.entry.handleItemEntryConfirm({ quantity: 1 }); });
    expect(feedback()).toContainEqual(['error', 'Missing product payload']);
    expect(h.entry.isItemEntryOpen).toBe(true);
  });

  it('hands off to the supervisor gate instead of stacking dialogs, closing itself without a toast', async () => {
    const h = setup({ productEntryMode: 'OPEN_ENTRY_DIALOG', posSettings: { ...EXCLUSIVE_5, requirePriceOverrideApproval: true } });
    await openFor(h);
    await act(async () => { h.entry.handleItemEntryConfirm({ product: P, quantity: 1, price: 10 }); });

    expect(items(h)).toHaveLength(0);
    expect(h.entry.isItemEntryOpen).toBe(false);
    expect(h.spies.requestApproval).toHaveBeenCalledTimes(1);
    expect(feedback()).toHaveLength(0);
  });

  it('handleEditItem opens the dialog on an existing cart row and confirm rewrites it in place', async () => {
    const h = setup();
    await add(h, { id: 'p1', name: 'Widget', price: 100, code: 'SKU-1' }, 2);
    await waitFor(() => expect(h.cart.currentInvoiceRef.current.items).toHaveLength(1));

    await act(async () => { h.entry.handleEditItem('p1'); });
    expect(h.entry.itemEntryAction).toBe('edit');
    expect(h.entry.selectedProductForEntry).toMatchObject({ id: 'p1', name: 'Widget' });
    expect(h.entry.itemEntryContext).toEqual({ lockQuantity: false });

    await act(async () => {
      h.entry.handleItemEntryConfirm({ invoiceLine: items(h)[0], quantity: 5, price: 90, discount: 0 });
    });
    expect(items(h)).toHaveLength(1);
    expect(items(h)[0]).toMatchObject({ quantity: 5, price: 90 });
    expect(h.entry.isItemEntryOpen).toBe(false);
  });

  it('handleEditItem on an unknown row does nothing at all', async () => {
    const h = setup();
    await act(async () => { h.entry.handleEditItem('nope'); });
    expect(h.entry.isItemEntryOpen).toBe(false);
    expect(h.entry.selectedProductForEntry).toBeNull();
  });

  it('handleEditItem locks quantity for a batch-controlled row', async () => {
    const h = setup();
    await add(h, { id: 'b1', name: 'V', price: 1, isBatch: true }, 1, 'BATCH-A');
    await waitFor(() => expect(h.cart.currentInvoiceRef.current.items).toHaveLength(1));
    await act(async () => { h.entry.handleEditItem('b1::BATCH-A'); });
    expect(h.entry.itemEntryContext).toEqual({ lockQuantity: true });
  });
});

// ── handleUnifiedEntry: parsing and routing ─────────────────────────────────

describe('handleUnifiedEntry — input parsing', () => {
  it('ignores empty, whitespace-only, null and undefined input without touching anything', async () => {
    const h = setup();
    for (const raw of ['', '   ', null, undefined]) {
      await scan(h, raw);
    }
    expect(resolvePosEntry).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it('trims the raw value before resolving', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'NONE' });
    await scan(h, '  BC-1  ');
    expect(resolvePosEntry).toHaveBeenCalledWith('BC-1');
  });

  it('parses an N*VALUE / NxVALUE / NX VALUE quantity prefix and resolves only the value part', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-C' })] });
    for (const raw of ['3*BC-C', '3xBC-C', '3XBC-C']) {
      await scan(h, raw);
    }
    expect(items(h)).toHaveLength(1);
    expect(items(h)[0].quantity).toBe(9);
    expect(resolvePosEntry).not.toHaveBeenCalled();
  });

  it('CHARACTERIZED BEHAVIOUR: a 0-prefix clamps to qty 1, and a non-numeric prefix is not a prefix at all', async () => {
    const zero = setup({ cacheSeed: [cached({ barcode: 'BC-C' })] });
    await scan(zero, '0*BC-C');
    expect(items(zero)[0].quantity).toBe(1);

    const notPrefix = setup();
    resolvePosEntry.mockResolvedValue({ type: 'NONE' });
    await scan(notPrefix, 'A*BC-C');
    expect(resolvePosEntry).toHaveBeenCalledWith('A*BC-C');
  });
});

describe('handleUnifiedEntry — the in-memory cache fast path', () => {
  it('adds a cached product without any backend call, keyed case-insensitively', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-C', name: 'Cached', price: 50 })] });
    await scan(h, 'bc-c');
    expect(resolvePosEntry).not.toHaveBeenCalled();
    expect(items(h)[0]).toMatchObject({ id: 'c1', name: 'Cached', quantity: 1 });
  });

  it('records the scan banner and the success toast, then clears the barcode box', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-C' })] });
    await scan(h, '2*BC-C');
    expect(h.entry.lastScannedItem).toEqual({ name: 'Cached', nameAr: '', barcode: 'BC-C', qty: 2, total: 100 });
    expect(feedback()).toEqual([['success', 'Cached ×2 added']]);
    expect(h.spies.setBarcodeInput).toHaveBeenCalledWith('');
    expect(h.spies.setSearchQuery).not.toHaveBeenCalled();
  });

  it('says "added" without the multiplier at qty 1', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-C' })] });
    await scan(h, 'BC-C');
    expect(feedback()).toEqual([['success', 'Cached added']]);
  });

  it('also clears the grid search box when the entry came from the grid', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-C' })] });
    await scan(h, 'BC-C', { fromGrid: true });
    expect(h.spies.setSearchQuery).toHaveBeenCalledWith('');
  });

  it('refuses a cached product that is disabled for POS, with no cart change and no banner', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-C', availableInPos: false })] });
    await scan(h, 'BC-C');
    expect(items(h)).toHaveLength(0);
    expect(feedback()).toEqual([['error', 'This product is disabled for POS sales.']]);
    expect(h.entry.lastScannedItem).toBeNull();
  });

  it('CHARACTERIZED BEHAVIOUR: batch/serial-controlled products deliberately SKIP the cache so the backend can pin the unit', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-B', isBatch: true })] });
    resolvePosEntry.mockResolvedValue({ type: 'NONE' });
    await scan(h, 'BC-B');
    expect(resolvePosEntry).toHaveBeenCalledWith('BC-B');
  });

  it('surfaces a DIRECT_ADD refusal from the cache path and suppresses the banner', async () => {
    // The only refusal reachable from the cache path is the price-floor gate: a
    // batch/serial product never gets here, so the one-batch-one-unit refusal cannot fire.
    const h = setup({
      posSettings: { ...EXCLUSIVE_5, requirePriceOverrideApproval: true },
      cacheSeed: [cached({ barcode: 'BC-C', price: 10, minPrice: 80 })],
    });
    await scan(h, 'BC-C');

    expect(items(h)).toHaveLength(0);
    expect(h.entry.lastScannedItem).toBeNull();
    expect(feedback()).toEqual([['error', 'supervisor-approval-required']]);
    expect(h.spies.setBarcodeInput).toHaveBeenCalledWith('');
  });

  it('the OPEN_ENTRY_DIALOG deferral suppresses the banner and the toast', async () => {
    const h = setup({ productEntryMode: 'OPEN_ENTRY_DIALOG', cacheSeed: [cached({ barcode: 'BC-C' })] });
    await scan(h, 'BC-C');
    expect(h.entry.isItemEntryOpen).toBe(true);
    expect(h.entry.lastScannedItem).toBeNull();
    expect(feedback()).toHaveLength(0);
    expect(h.spies.setBarcodeInput).toHaveBeenCalledWith('');
  });
});

describe('handleUnifiedEntry — backend resolution routing', () => {
  it('PRODUCT: maps the aggregate, caches it, adds it and records the banner', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ retailPrice: 100 }) });
    await scan(h, '2*BC-1');

    expect(items(h)[0]).toMatchObject({ id: 'p1', name: 'Widget', price: 100, quantity: 2 });
    expect(h.entry.lastScannedItem).toEqual({ name: 'Widget', nameAr: '', barcode: 'BC-1', qty: 2, total: 200 });
    expect(feedback()).toEqual([['success', 'Widget ×2 added']]);
    // Cached under id / code / barcode / name, so the next scan takes the fast path.
    expect([...h.productCacheRef.current.keys()].sort()).toEqual(['bc-1', 'p1', 'sku-1', 'widget']);
  });

  it('CHARACTERIZED BEHAVIOUR: the scanned value overrides the product\'s own barcode when mapping', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ barcode: 'BC-1' }) });
    await scan(h, 'ALT-CODE');
    expect(items(h)[0].barcode).toBe('ALT-CODE');
  });

  it('PRODUCT with a pinned batch: forces qty 1 regardless of the scanned multiplier', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({
      type: 'PRODUCT', product: aggregate({ isBatch: true }),
      pinnedBatchNumber: 'BATCH-A', pinnedExpiry: '2027-01-01',
    });
    await scan(h, '5*BATCH-A');
    expect(items(h)[0]).toMatchObject({ id: 'p1::BATCH-A', quantity: 1, expiryDate: '2027-01-01' });
    expect(h.entry.lastScannedItem).toMatchObject({ barcode: 'BATCH-A', qty: 1, total: 100 });
    expect(feedback()).toEqual([['success', 'Widget — batch BATCH-A']]);
  });

  it('PRODUCT with a pinned batch already in the cart is refused before it reaches the cart', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ isBatch: true }), pinnedBatchNumber: 'BATCH-A' });
    await scan(h, 'BATCH-A');
    await waitFor(() => expect(h.cart.currentInvoiceRef.current.items).toHaveLength(1));
    await scan(h, 'BATCH-A');

    expect(items(h)).toHaveLength(1);
    expect(feedback().at(-1)).toEqual(['error', 'Batch BATCH-A already exists in cart']);
  });

  it('PRODUCT with a pinned serial: qty 1, its own line, and its own toast', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ isSerial: true }), pinnedSerialNumber: 'SN-9' });
    await scan(h, '4*SN-9');
    expect(items(h)[0]).toMatchObject({ id: 'p1::S:SN-9', quantity: 1, serialNumber: 'SN-9' });
    expect(h.entry.lastScannedItem).toEqual({ name: 'Widget', nameAr: '', barcode: 'SN-9', qty: 1, total: 100 });
    expect(feedback()).toEqual([['success', 'Widget — serial SN-9']]);
  });

  it('the same serial is never sold twice on one bill', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ isSerial: true }), pinnedSerialNumber: 'SN-9' });
    await scan(h, 'SN-9');
    await waitFor(() => expect(h.cart.currentInvoiceRef.current.items).toHaveLength(1));
    await scan(h, 'SN-9');

    expect(items(h)).toHaveLength(1);
    expect(feedback().at(-1)).toEqual(['error', 'Serial number SN-9 already exists in cart']);
  });

  it('an UNPINNED batch product resolved by code surfaces addToInvoice\'s one-batch-one-unit refusal', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ name: 'Vaccine', isBatch: true }) });
    await scan(h, 'SKU-1');
    await waitFor(() => expect(h.cart.currentInvoiceRef.current.items).toHaveLength(1));
    await scan(h, 'SKU-1');

    expect(items(h)).toHaveLength(1);
    expect(feedback().at(-1)).toEqual(['error', 'Vaccine is batch-tracked — scan a specific batch to add another unit.']);
  });

  it('CUSTOMER: sets the customer as a string id, never touching the cart', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'CUSTOMER', customer: { id: 77, name: 'Acme', code: 'C-77' } });
    await scan(h, '0501234567');
    expect(h.spies.setSelectedCustomer).toHaveBeenCalledWith('77');
    expect(items(h)).toHaveLength(0);
    expect(feedback()).toEqual([['customer', 'Customer set: Acme']]);
  });

  it('CUSTOMER falls back to the code for both the id and the label', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'CUSTOMER', customer: { code: 'C-77' } });
    await scan(h, 'C-77');
    expect(h.spies.setSelectedCustomer).toHaveBeenCalledWith('C-77');
    expect(feedback()).toEqual([['customer', 'Customer set: C-77']]);
  });

  it('VOUCHER: routes to the payment allocation, never to a cart line, and speaks about the voucher', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'VOUCHER', voucher: { voucherCode: 'V-1', voucherNumber: 'CV-1' } });
    await scan(h, 'V-1');
    expect(h.spies.applyScannedVoucher).toHaveBeenCalledWith({ voucherCode: 'V-1', voucherNumber: 'CV-1' });
    expect(items(h)).toHaveLength(0);
    expect(feedback()).toEqual([['success', 'Voucher applied']]);
  });

  it('VOUCHER: a refusal is reported as a voucher problem, never as "no product found"', async () => {
    const h = setup({ voucherOutcome: { ok: false, message: 'Voucher already spent' } });
    resolvePosEntry.mockResolvedValue({ type: 'VOUCHER', voucher: { voucherCode: 'V-1' } });
    await scan(h, 'V-1');
    expect(feedback()).toEqual([['error', 'Voucher already spent']]);
  });

  it('BLOCKED: surfaces the backend reason, clears the barcode box, and never falls through to the grid filter', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'BLOCKED', message: 'Unit already sold.' });
    await scan(h, 'SN-9', { fromGrid: true });
    expect(feedback()).toEqual([['error', 'Unit already sold.']]);
    expect(h.spies.setBarcodeInput).toHaveBeenCalledWith('');
    expect(h.spies.setSearchQuery).not.toHaveBeenCalled();
    expect(items(h)).toHaveLength(0);
  });

  it('BLOCKED without a message falls back to a generic one', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'BLOCKED' });
    await scan(h, 'SN-9');
    expect(feedback()).toEqual([['error', 'This unit is not available for sale.']]);
  });

  it('a lookup failure is reported and, unlike every other branch, leaves BOTH inputs untouched', async () => {
    const h = setup();
    resolvePosEntry.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await scan(h, 'BC-1');
    expect(feedback()).toEqual([['error', 'Lookup failed: BC-1']]);
    expect(h.spies.setBarcodeInput).not.toHaveBeenCalled();
    expect(h.spies.setSearchQuery).not.toHaveBeenCalled();
  });

  it('no match from a scan clears the barcode box and says "No product found"', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'NONE' });
    await scan(h, 'ZZZ');
    expect(feedback()).toEqual([['error', 'No product found: ZZZ']]);
    expect(h.spies.setBarcodeInput).toHaveBeenCalledWith('');
  });

  it('no match from the GRID keeps the typed text so the grid keeps filtering', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'NONE' });
    await scan(h, 'ZZZ', { fromGrid: true });
    expect(feedback()).toEqual([['error', 'No exact match — showing results for "ZZZ"']]);
    expect(h.spies.setBarcodeInput).not.toHaveBeenCalled();
    expect(h.spies.setSearchQuery).not.toHaveBeenCalled();
  });

  it('CHARACTERIZED BEHAVIOUR: the no-match message reports the VALUE, with the quantity prefix already stripped', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'NONE' });
    await scan(h, '3*ZZZ');
    expect(feedback()).toEqual([['error', 'No product found: ZZZ']]);
  });

  it('CHARACTERIZED BEHAVIOUR: a PRODUCT result with no product falls through to the no-match branch', async () => {
    const h = setup();
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT' });
    await scan(h, 'BC-1');
    expect(feedback()).toEqual([['error', 'No product found: BC-1']]);
  });

  it('a below-floor scan is diverted to the supervisor gate with no cart change and no "added" toast', async () => {
    const h = setup({ posSettings: { ...EXCLUSIVE_5, requirePriceOverrideApproval: true } });
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ retailPrice: 10, minPrice: 80 }) });
    await scan(h, 'BC-1');

    expect(items(h)).toHaveLength(0);
    expect(h.entry.lastScannedItem).toBeNull();
    expect(h.spies.requestApproval).toHaveBeenCalledTimes(1);
    expect(feedback()).toEqual([['error', 'supervisor-approval-required']]);
  });
});

// ── Ordering ────────────────────────────────────────────────────────────────

describe('the feedback toaster input', () => {
  it('memoized entry points call the showFeedback they were handed directly, across rerenders', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-C' })] });
    const frozenEntry = h.entry.handleUnifiedEntry;
    // A rerender with the same (stable) toaster leaves the [] -memoized entry point intact,
    // and that frozen closure still reaches the exact function POSSales passed in.
    h.view.rerender({ s: EXCLUSIVE_5 });
    expect(h.entry.handleUnifiedEntry).toBe(frozenEntry);
    await act(async () => { await frozenEntry('BC-C'); });
    expect(h.showFeedback).toHaveBeenCalledTimes(1);
    expect(h.showFeedback).toHaveBeenCalledWith('success', 'Cached added');
  });

  it('the Item Entry confirm refusal calls showFeedback directly with (type, message)', async () => {
    const h = setup({ productEntryMode: 'OPEN_ENTRY_DIALOG' });
    await act(async () => { h.entry.handleProductSelection({ id: 'p1', name: 'Widget', price: 100 }); });
    await act(async () => { h.entry.handleItemEntryConfirm({ quantity: 1 }); });
    expect(h.showFeedback).toHaveBeenCalledWith('error', 'Missing product payload');
  });
});

describe('sequence', () => {
  it('a successful scan runs resolve → cart mutation → banner → toast → input clear, in that order', async () => {
    const h = setup();
    resolvePosEntry.mockImplementation(async () => {
      events.push(['resolve']);
      return { type: 'PRODUCT', product: aggregate() };
    });
    let mutatedAt;
    await act(async () => {
      await h.entry.handleUnifiedEntry('BC-1');
      mutatedAt = events.length;
    });
    // setCurrentInvoice is not spied (it is the real cart), so it is pinned by position:
    // it happens between resolve and the feedback below.
    expect(events.map((e) => e[0])).toEqual(['resolve', 'feedback', 'clear-barcode']);
    expect(mutatedAt).toBe(3);
    expect(items(h)).toHaveLength(1);
  });

  it('the supervisor gate fires BEFORE any cart write, so an unapproved scan leaves no trace', async () => {
    const h = setup({ posSettings: { ...EXCLUSIVE_5, requirePriceOverrideApproval: true } });
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ retailPrice: 10, minPrice: 80 }) });
    await scan(h, 'BC-1');
    expect(events.map((e) => e[0])).toEqual([
      'request-approval', 'feedback', 'clear-barcode',
    ]);
    expect(h.cart.currentInvoice).toMatchObject({ items: [], total: 0 });
  });
});

// ── Cross-hook: one authoritative cart ──────────────────────────────────────

describe('cross-hook cart authority', () => {
  it('every entry path lands in the same useCart object the other feature hooks read', async () => {
    const h = setup({ cacheSeed: [cached({ barcode: 'BC-C', price: 50 })] });
    resolvePosEntry.mockResolvedValue({ type: 'PRODUCT', product: aggregate({ retailPrice: 100 }) });

    await add(h, { id: 'm1', name: 'Manual', price: 10 });     // direct
    await scan(h, 'BC-C');                                      // cache fast path
    await scan(h, 'BC-1');                                      // backend resolve
    await act(async () => { h.entry.handleProductSelection({ id: 'g1', name: 'Grid', price: 20 }); }); // grid

    const cart = h.cart.currentInvoice;
    expect(cart.items.map((i) => i.id)).toEqual(['g1', 'p1', 'c1', 'm1']);
    await waitFor(() => expect(h.cart.currentInvoiceRef.current).toBe(h.view.result.current.cart.currentInvoice));

    // The projections the other hooks consume all see the same four lines.
    expect(h.cart.cartItemsToPayload(cart.items)).toHaveLength(4);
    expect(cart.subtotal).toBeCloseTo(20 + 100 + 50 + 10, 6);
  });

  it('cart operations that are NOT entry still see entry\'s lines', async () => {
    const h = setup();
    await add(h, { id: 'p1', name: 'Widget', price: 100 }, 2);
    await act(async () => { h.cart.applyVoid('p1'); });
    expect(items(h)[0].isVoided).toBe(true);
    await act(async () => { h.cart.removeFromInvoice('p1'); });
    expect(items(h)).toHaveLength(0);
  });
});
