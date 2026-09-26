import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCart } from '../POS/features/cart/useCart';
import { EXCLUSIVE_5, INCLUSIVE_5, line } from './fixtures/posCartFixtures';

/**
 * CHARACTERIZATION — the cart boundary.
 *
 * The cart state, its ref-sync effect and four operations were declared inline in
 * POSSales.jsx and unreachable from any test. The Phase 3 extraction moved them verbatim
 * into a hook whose only input is posSettings.
 *
 * SCOPE. The totals arithmetic — inclusive/exclusive VAT, mixed rates, discounts,
 * zero-rated, exempt, multi-unit, voided lines, the zero clamp, fractional quantities —
 * is already locked down by posCartTotals.characterization.test.js against
 * computePosCartTotals directly. That remains the oracle and is NOT duplicated here.
 * These tests cover the hook-level contract: state identity, the ref sync, the mutation
 * operations, and the payload projection.
 *
 * These describe CURRENT behaviour.
 */

const setup = (posSettings = EXCLUSIVE_5) => renderHook(({ s }) => useCart({ posSettings: s }), {
  initialProps: { s: posSettings },
});

/** Seeds the cart with recalculated lines, the way every mutation path does. */
const seed = async (view, items, billDiscount = 0) => {
  await act(async () => {
    view.result.current.setCurrentInvoice(view.result.current.recalculateInvoice(items, billDiscount));
  });
};

const ITEMS = [
  line({ id: 'a', code: 'SKU-1', name: 'Widget', price: 200, quantity: 2, discount: 20, taxRate: 5 }),
  line({ id: 'b', code: 'SKU-2', name: 'Gadget', price: 50, quantity: 1, taxRate: 5 }),
];

describe('initial state', () => {
  it('starts as an empty cart with every total at zero', () => {
    expect(setup().result.current.currentInvoice).toEqual({
      items: [], subtotal: 0, totalDiscount: 0, tax: 0, total: 0, billDiscountAmount: 0,
    });
  });

  it('exposes the operations its consumers depend on', () => {
    const r = setup().result.current;
    ['setCurrentInvoice', 'recalculateInvoice', 'resetCartState',
      'removeFromInvoice', 'applyVoid', 'cartItemsToPayload',
    ].forEach((k) => expect(typeof r[k]).toBe('function'));
    expect(r.currentInvoiceRef).toHaveProperty('current');
  });

  it('CHARACTERIZED BEHAVIOUR: the ref starts null and only syncs after the first effect', () => {
    const { result } = setup();
    // The effect has run by the time renderHook returns, so it mirrors the initial cart.
    expect(result.current.currentInvoiceRef.current).toEqual(result.current.currentInvoice);
  });
});

describe('currentInvoiceRef — the sync effect', () => {
  it('mirrors the live cart after every change', async () => {
    const { result } = setup();
    await seed({ result }, ITEMS);

    await waitFor(() => {
      expect(result.current.currentInvoiceRef.current).toBe(result.current.currentInvoice);
    });
    expect(result.current.currentInvoiceRef.current.items).toHaveLength(2);
  });

  it('holds the identical object, not a copy', async () => {
    const { result } = setup();
    await seed({ result }, ITEMS);
    await waitFor(() => expect(result.current.currentInvoiceRef.current).toBe(result.current.currentInvoice));
  });
});

describe('recalculateInvoice', () => {
  it('produces the cart shape from lines, honouring the live VAT mode', async () => {
    const { result } = setup(EXCLUSIVE_5);
    const totals = result.current.recalculateInvoice(ITEMS, 0);

    expect(totals.subtotal).toBeCloseTo(450, 6);
    expect(totals.totalDiscount).toBeCloseTo(80, 6);
    expect(totals.tax).toBeCloseTo(18.5, 6);
    expect(totals.total).toBeCloseTo(388.5, 6);
    expect(totals.taxInclusive).toBe(false);
  });

  it('reads the CURRENT settings, never a mount-time snapshot', async () => {
    const view = renderHook(({ s }) => useCart({ posSettings: s }), { initialProps: { s: EXCLUSIVE_5 } });
    expect(view.result.current.recalculateInvoice(ITEMS, 0).taxInclusive).toBe(false);

    view.rerender({ s: INCLUSIVE_5 });
    expect(view.result.current.recalculateInvoice(ITEMS, 0).taxInclusive).toBe(true);
  });

  it('applies a bill discount', () => {
    const { result } = setup();
    const without = result.current.recalculateInvoice(ITEMS, 0);
    const with10 = result.current.recalculateInvoice(ITEMS, 10);
    expect(without.total - with10.total).toBeCloseTo(10, 6);
    expect(with10.billDiscountAmount).toBe(10);
  });

  it('returns zeroed totals for an empty line list', () => {
    const t = setup().result.current.recalculateInvoice([], 0);
    expect(t.subtotal).toBe(0);
    expect(t.total).toBe(0);
  });

  it('defaults the bill discount to zero', () => {
    const { result } = setup();
    expect(result.current.recalculateInvoice(ITEMS).billDiscountAmount).toBe(0);
  });
});

describe('resetCartState', () => {
  it('returns the cart to the empty shape', async () => {
    const { result } = setup();
    await seed({ result }, ITEMS, 25);
    expect(result.current.currentInvoice.items).toHaveLength(2);

    await act(async () => { result.current.resetCartState(); });

    expect(result.current.currentInvoice).toEqual({
      items: [], subtotal: 0, totalDiscount: 0, tax: 0, total: 0, billDiscountAmount: 0,
    });
  });

  it('CHARACTERIZED BOUNDARY: it resets only the cart', async () => {
    // POSSales' clearInvoice additionally zeroes the shipping charge and drops the
    // payment allocations. Those are not cart state, so they stay in that composite —
    // this operation is the cart half only.
    const { result } = setup();
    await seed({ result }, ITEMS);
    await act(async () => { result.current.resetCartState(); });
    expect(Object.keys(result.current.currentInvoice).sort())
      .toEqual(['billDiscountAmount', 'items', 'subtotal', 'tax', 'total', 'totalDiscount']);
  });

  it('produces a fresh object each time — the empty shape is never shared', async () => {
    const { result } = setup();
    await act(async () => { result.current.resetCartState(); });
    const first = result.current.currentInvoice;
    await seed({ result }, ITEMS);
    await act(async () => { result.current.resetCartState(); });
    expect(result.current.currentInvoice).toEqual(first);
    expect(result.current.currentInvoice).not.toBe(first);
  });
});

describe('removeFromInvoice', () => {
  it('drops the line and recalculates', async () => {
    const { result } = setup();
    await seed({ result }, ITEMS);

    await act(async () => { result.current.removeFromInvoice('a'); });

    expect(result.current.currentInvoice.items.map((i) => i.id)).toEqual(['b']);
    expect(result.current.currentInvoice.subtotal).toBeCloseTo(50, 6);
    expect(result.current.currentInvoice.tax).toBeCloseTo(2.5, 6);
  });

  it('CHARACTERIZED BEHAVIOUR: removing drops any bill discount', async () => {
    // recalculateInvoice is called with no second argument, so billDiscountAmount
    // defaults back to 0 rather than being carried across.
    const { result } = setup();
    await seed({ result }, ITEMS, 25);
    expect(result.current.currentInvoice.billDiscountAmount).toBe(25);

    await act(async () => { result.current.removeFromInvoice('a'); });
    expect(result.current.currentInvoice.billDiscountAmount).toBe(0);
  });

  it('is a no-op for an unknown id', async () => {
    const { result } = setup();
    await seed({ result }, ITEMS);
    await act(async () => { result.current.removeFromInvoice('nope'); });
    expect(result.current.currentInvoice.items).toHaveLength(2);
  });

  it('empties the cart when the last line goes', async () => {
    const { result } = setup();
    await seed({ result }, [ITEMS[0]]);
    await act(async () => { result.current.removeFromInvoice('a'); });
    expect(result.current.currentInvoice.items).toEqual([]);
    expect(result.current.currentInvoice.total).toBe(0);
  });
});

describe('applyVoid', () => {
  it('flags the line voided in VOID mode, keeping it in the cart', async () => {
    const { result } = setup({ ...EXCLUSIVE_5, voidMode: 'VOID' });
    await seed({ result }, ITEMS);

    await act(async () => { result.current.applyVoid('a'); });

    expect(result.current.currentInvoice.items).toHaveLength(2);
    expect(result.current.currentInvoice.items.find((i) => i.id === 'a').isVoided).toBe(true);
    // Excluded from the totals, disclosed separately.
    expect(result.current.currentInvoice.subtotal).toBeCloseTo(50, 6);
    expect(result.current.currentInvoice.voidedCount).toBe(1);
  });

  it('physically removes the line in DELETE mode', async () => {
    const { result } = setup({ ...EXCLUSIVE_5, voidMode: 'DELETE' });
    await seed({ result }, ITEMS);

    await act(async () => { result.current.applyVoid('a'); });

    expect(result.current.currentInvoice.items.map((i) => i.id)).toEqual(['b']);
  });

  it('defaults to VOID mode when no voidMode is configured', async () => {
    const { result } = setup({ ...EXCLUSIVE_5, voidMode: undefined });
    await seed({ result }, ITEMS);
    await act(async () => { result.current.applyVoid('a'); });
    expect(result.current.currentInvoice.items).toHaveLength(2);
  });

  it('CHARACTERIZED BEHAVIOUR: applyVoid does not un-void — it only sets the flag', async () => {
    // The toggle-back path lives in POSSales' voidFromInvoice, which is supervisor-gated.
    const { result } = setup();
    await seed({ result }, ITEMS);
    await act(async () => { result.current.applyVoid('a'); });
    await act(async () => { result.current.applyVoid('a'); });
    expect(result.current.currentInvoice.items.find((i) => i.id === 'a').isVoided).toBe(true);
  });

  it('is a no-op for an unknown id', async () => {
    const { result } = setup();
    await seed({ result }, ITEMS);
    await act(async () => { result.current.applyVoid('nope'); });
    expect(result.current.currentInvoice.items.every((i) => !i.isVoided)).toBe(true);
  });
});

describe('cartItemsToPayload', () => {
  it('projects lines onto the backend item shape', () => {
    const rows = setup().result.current.cartItemsToPayload([
      line({ id: 'a', code: 'SKU-1', name: 'Widget', price: 200, quantity: 2, discount: 20, taxRate: 5,
        pinnedBatchNumber: 'B-1', serialNumber: 'S-1' }),
    ]);

    expect(rows).toEqual([{
      itemCode: 'SKU-1', itemName: 'Widget', quantity: 2, unit: 'Each',
      price: 200, discount: 20, taxRate: 5,
      batchNumber: 'B-1', serialNumber: 'S-1', voided: false,
    }]);
  });

  it('falls back itemCode through code -> productId -> id', () => {
    const p = setup().result.current.cartItemsToPayload;
    expect(p([line({ id: 'x', code: 'C', productId: 'P' })])[0].itemCode).toBe('C');
    expect(p([line({ id: 'x', productId: 'P' })])[0].itemCode).toBe('P');
    expect(p([line({ id: 'x' })])[0].itemCode).toBe('x');
  });

  it('CHARACTERIZED BEHAVIOUR: DELETE mode drops voided lines, VOID mode keeps them flagged', () => {
    const items = [line({ id: 'a', code: 'A' }), line({ id: 'b', code: 'B', isVoided: true })];

    const kept = setup({ ...EXCLUSIVE_5, voidMode: 'VOID' }).result.current.cartItemsToPayload(items);
    expect(kept).toHaveLength(2);
    expect(kept[1].voided).toBe(true);

    const dropped = setup({ ...EXCLUSIVE_5, voidMode: 'DELETE' }).result.current.cartItemsToPayload(items);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].itemCode).toBe('A');
  });

  it('strips batch and serial from a voided line that is kept', () => {
    const rows = setup().result.current.cartItemsToPayload([
      line({ id: 'b', code: 'B', isVoided: true, pinnedBatchNumber: 'B-9', serialNumber: 'S-9' }),
    ]);
    expect(rows[0].batchNumber).toBe(null);
    expect(rows[0].serialNumber).toBe(null);
    expect(rows[0].voided).toBe(true);
  });

  it('CHARACTERIZED QUIRK: a null line taxRate becomes 0%, not the branch default', () => {
    // toNumber is Number.isFinite-based and Number(null) === 0, so the branch-default
    // fallback is only reached for undefined/NaN. Same behaviour the totals have.
    const p = setup().result.current.cartItemsToPayload;
    expect(p([line({ id: 'x', code: 'C', taxRate: null })])[0].taxRate).toBe(0);
    expect(p([{ id: 'x', code: 'C', quantity: 1, price: 1 }])[0].taxRate).toBe(5);
  });

  it('zeroes the fallback rate when the branch tax switch is off', () => {
    const rows = setup({ ...EXCLUSIVE_5, taxEnabled: false })
      .result.current.cartItemsToPayload([{ id: 'x', code: 'C', quantity: 1, price: 1 }]);
    expect(rows[0].taxRate).toBe(0);
  });

  it('always reports unit as the literal "Each"', () => {
    const rows = setup().result.current.cartItemsToPayload([line({ id: 'x', code: 'C', price: 36, quantity: 2 })]);
    expect(rows[0].unit).toBe('Each');
  });

  it('normalises a missing discount and void flag', () => {
    const rows = setup().result.current.cartItemsToPayload([{ id: 'x', code: 'C', name: 'n', quantity: 1, price: 10 }]);
    expect(rows[0].discount).toBe(0);
    expect(rows[0].voided).toBe(false);
  });

  it('returns an empty array for an empty cart', () => {
    expect(setup().result.current.cartItemsToPayload([])).toEqual([]);
  });

  it('does not round price, quantity or discount', () => {
    const rows = setup().result.current.cartItemsToPayload([
      line({ id: 'w', code: 'C', price: 13.333, quantity: 0.375, discount: 7.5, taxRate: 5 }),
    ]);
    expect(rows[0].price).toBe(13.333);
    expect(rows[0].quantity).toBe(0.375);
    expect(rows[0].discount).toBe(7.5);
  });
});

describe('single authoritative cart', () => {
  it('every operation writes the same state object the consumers read', async () => {
    const { result } = setup();
    await seed({ result }, ITEMS);
    const afterSeed = result.current.currentInvoice;

    await act(async () => { result.current.removeFromInvoice('b'); });
    expect(result.current.currentInvoice).not.toBe(afterSeed);
    expect(result.current.currentInvoice.items).toHaveLength(1);

    // The ref tracks that same object — no mirror, no second copy.
    await waitFor(() => expect(result.current.currentInvoiceRef.current).toBe(result.current.currentInvoice));
  });

  it('setCurrentInvoice remains available for the gated mutations left in POSSales', async () => {
    // addToInvoice, updateQuantity, updateDiscount, updateItemPrice and voidFromInvoice
    // stay in POSSales because each is supervisor- or UI-gated; they mutate the cart
    // through this setter.
    const { result } = setup();
    await act(async () => {
      result.current.setCurrentInvoice((prev) => result.current.recalculateInvoice([...prev.items, ITEMS[0]], 0));
    });
    expect(result.current.currentInvoice.items).toHaveLength(1);
  });
});
