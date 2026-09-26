import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  getLayaways: vi.fn(),
  createLayaway: vi.fn(),
  cancelLayaway: vi.fn(),
}));

import { cancelLayaway, createLayaway, getLayaways } from '../../../api/posApi';
import { useHeldSales } from '../POS/features/heldSales/useHeldSales';
import { WALK_IN_CUSTOMER } from '../POS/posConstants';

/**
 * CHARACTERIZATION — held sales (Hold / recall / delete of a parked bill).
 *
 * This was two useState calls, a useCallback, an effect and three handlers inside
 * POSSales.jsx, and therefore unreachable from any test. The Phase 3 extraction moved
 * them verbatim into a hook, so the layaway filter, the createLayaway payload and the
 * error paths can now be asserted.
 *
 * A "Hold" is a zero-deposit layaway (hold=true) reusing the layaway reservation
 * workflow — every call goes to the layaway endpoints. That is the existing contract.
 * These tests describe CURRENT behaviour.
 */

const CART = {
  items: [{ code: 'SKU-1', name: 'Widget', quantity: 2, price: 50 }],
  billDiscountAmount: 10,
};
const SESSION = { id: 42, branchId: 7, branchName: 'Main', status: 'OPEN' };
const TERMINAL = { branchId: 7, branchName: 'Main Branch', branchCode: 'MB', terminalId: 'TERM-01', counterName: 'Counter 1' };
const CUSTOMER = { id: 'CUST-1', code: 'CUST-1', name: 'Fatima Hassan', phone: '+971 50 123 4567' };

const setup = (over = {}) => {
  const cartItemsToPayload = vi.fn((items) => items.map((i) => ({ itemCode: i.code, quantity: i.quantity })));
  const clearInvoice = vi.fn();
  const setConfirmAction = vi.fn();
  const syncPosData = vi.fn();
  const startLayawayConversion = vi.fn().mockResolvedValue(undefined);
  const args = {
    sessionId: 42,
    currentSession: SESSION,
    currentTerminal: TERMINAL,
    currentInvoice: CART,
    selectedCustomerData: CUSTOMER,
    posSettings: { taxInclusive: true },
    cartItemsToPayload,
    clearInvoice,
    setConfirmAction,
    syncPosDataRef: { current: syncPosData },
    startLayawayConversion,
    ...over,
  };
  const view = renderHook(() => useHeldSales(args));
  return { view, args, cartItemsToPayload, clearInvoice, setConfirmAction, syncPosData, startLayawayConversion };
};

/** A raw layaway row as GET /layaways returns it. */
const layaway = (o = {}) => ({
  id: 1, layawayNumber: 'LAY-0001', saleTotal: 110, items: [{}, {}],
  customerName: 'Fatima Hassan', hold: true, posSessionId: 42, ...o,
});

let alertSpy;
beforeEach(() => {
  vi.clearAllMocks();
  getLayaways.mockResolvedValue([]);
  createLayaway.mockResolvedValue({});
  cancelLayaway.mockResolvedValue({});
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('initial state and load', () => {
  it('starts empty and not busy', async () => {
    const { view } = setup();
    expect(view.result.current.heldSales).toEqual([]);
    expect(view.result.current.holdBusy).toBe(false);
    await waitFor(() => expect(getLayaways).toHaveBeenCalled());
  });

  it('fetches on mount with the branch and ACTIVE status', async () => {
    setup();
    await waitFor(() => expect(getLayaways).toHaveBeenCalledWith({ branchId: 7, status: 'ACTIVE' }));
  });

  it('does not call the API at all without a session, and clears the list', async () => {
    const { view } = setup({ sessionId: null });
    await waitFor(() => expect(view.result.current.heldSales).toEqual([]));
    expect(getLayaways).not.toHaveBeenCalled();
  });

  it('prefers the terminal branch, falling back to the session branch', async () => {
    setup({ currentTerminal: null, currentSession: { ...SESSION, branchId: 99 } });
    await waitFor(() => expect(getLayaways).toHaveBeenCalledWith({ branchId: 99, status: 'ACTIVE' }));

    vi.clearAllMocks();
    getLayaways.mockResolvedValue([]);
    setup({ currentTerminal: null, currentSession: { id: 42 } });
    await waitFor(() => expect(getLayaways).toHaveBeenCalledWith({ branchId: null, status: 'ACTIVE' }));
  });
});

describe('load — filtering and projection', () => {
  it('keeps only hold=true rows belonging to THIS session', async () => {
    getLayaways.mockResolvedValue([
      layaway({ id: 1, layawayNumber: 'LAY-0001' }),
      layaway({ id: 2, layawayNumber: 'LAY-0002', hold: false }),          // a real layaway
      layaway({ id: 3, layawayNumber: 'LAY-0003', posSessionId: 99 }),     // another session
      layaway({ id: 4, layawayNumber: 'LAY-0004', hold: undefined }),      // not strictly true
    ]);
    const { view } = setup();
    await waitFor(() => expect(view.result.current.heldSales).toHaveLength(1));
    expect(view.result.current.heldSales[0].id).toBe(1);
  });

  it('projects each hold onto the recall-pill shape', async () => {
    getLayaways.mockResolvedValue([layaway()]);
    const { view } = setup();
    await waitFor(() => expect(view.result.current.heldSales).toHaveLength(1));

    expect(view.result.current.heldSales[0]).toEqual({
      id: 1,
      label: 'LAY-0001',
      total: 110,
      itemCount: 2,
      customerName: 'Fatima Hassan',
    });
  });

  it('defaults a missing total to 0 and missing items to an empty count', async () => {
    getLayaways.mockResolvedValue([layaway({ saleTotal: null, items: null })]);
    const { view } = setup();
    await waitFor(() => expect(view.result.current.heldSales).toHaveLength(1));
    expect(view.result.current.heldSales[0].total).toBe(0);
    expect(view.result.current.heldSales[0].itemCount).toBe(0);
  });

  it('treats a null response as an empty list', async () => {
    getLayaways.mockResolvedValue(null);
    const { view } = setup();
    await waitFor(() => expect(getLayaways).toHaveBeenCalled());
    expect(view.result.current.heldSales).toEqual([]);
  });

  it('CHARACTERIZED BEHAVIOUR: a failed load warns and leaves the previous list intact', async () => {
    getLayaways.mockResolvedValueOnce([layaway()]);
    const { view } = setup();
    await waitFor(() => expect(view.result.current.heldSales).toHaveLength(1));

    getLayaways.mockRejectedValue(new Error('offline'));
    await act(async () => { await view.result.current.loadHeldSales(); });

    // The catch only warns — it does not clear or flag an error, so the pills keep
    // showing the last successful result.
    expect(console.warn).toHaveBeenCalledWith('Held sales load failed', expect.any(Error));
    expect(view.result.current.heldSales).toHaveLength(1);
  });
});

describe('holdInvoice', () => {
  const hold = async (over = {}) => {
    const ctx = setup(over);
    await waitFor(() => expect(getLayaways).toHaveBeenCalled());
    await act(async () => { await ctx.view.result.current.holdInvoice(); });
    return ctx;
  };

  it('posts a zero-deposit, stock-reserving layaway from the live cart', async () => {
    const ctx = await hold();

    expect(createLayaway).toHaveBeenCalledTimes(1);
    expect(createLayaway.mock.calls[0][0]).toEqual({
      hold: true,
      customerCode: 'CUST-1',
      customerName: 'Fatima Hassan',
      customerPhone: '+971 50 123 4567',
      branchId: 7,
      branchName: 'Main Branch',
      branchCode: 'MB',
      sessionId: 42,
      terminalId: 'TERM-01',
      counterName: 'Counter 1',
      depositRequired: false,
      depositAmount: 0,
      reserveStockRequested: true,
      billDiscountAmount: 10,
      taxInclusive: true,
      items: [{ itemCode: 'SKU-1', quantity: 2 }],
    });
    expect(ctx.cartItemsToPayload).toHaveBeenCalledWith(CART.items);
  });

  it('records a walk-in when no customer is selected', async () => {
    await hold({ selectedCustomerData: null });
    const payload = createLayaway.mock.calls[0][0];
    expect(payload.customerCode).toBe('WALK-IN');
    expect(payload.customerName).toBe('Walk-in Customer');
    expect(payload.customerPhone).toBe(null);
  });

  it('treats the WALK_IN_CUSTOMER sentinel as a walk-in too', async () => {
    await hold({ selectedCustomerData: { id: WALK_IN_CUSTOMER.id, name: 'Walk-in Customer' } });
    expect(createLayaway.mock.calls[0][0].customerCode).toBe('WALK-IN');
  });

  it('falls back to the customer id when no code is stored', async () => {
    await hold({ selectedCustomerData: { id: 'CUST-9', name: 'No Code' } });
    expect(createLayaway.mock.calls[0][0].customerCode).toBe('CUST-9');
  });

  it('sends taxInclusive strictly as a boolean', async () => {
    await hold({ posSettings: null });
    expect(createLayaway.mock.calls[0][0].taxInclusive).toBe(false);
  });

  it('clears the cart, reloads the holds and re-syncs POS data, in that order', async () => {
    const ctx = await hold();
    expect(ctx.clearInvoice).toHaveBeenCalledTimes(1);
    expect(ctx.syncPosData).toHaveBeenCalledTimes(1);
    // The mount load plus the post-hold reload.
    expect(getLayaways).toHaveBeenCalledTimes(2);
    expect(ctx.view.result.current.holdBusy).toBe(false);
  });

  it('refuses an empty cart without calling the API', async () => {
    const ctx = await hold({ currentInvoice: { items: [], billDiscountAmount: 0 } });
    expect(createLayaway).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(ctx.clearInvoice).not.toHaveBeenCalled();
  });

  it('refuses without an open session and says so', async () => {
    // No session means loadHeldSales never reaches the API either, so this case cannot
    // use the `hold` helper (which waits for the mount fetch).
    const ctx = setup({ sessionId: null });
    await act(async () => { await ctx.view.result.current.holdInvoice(); });

    expect(createLayaway).not.toHaveBeenCalled();
    expect(getLayaways).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Open a POS session before holding a bill.');
    expect(ctx.clearInvoice).not.toHaveBeenCalled();
  });

  it('surfaces the server message on failure and leaves the cart alone', async () => {
    createLayaway.mockRejectedValue({ response: { data: { message: 'Stock unavailable' } } });
    const ctx = await hold();

    expect(alertSpy).toHaveBeenCalledWith('Stock unavailable');
    expect(ctx.clearInvoice).not.toHaveBeenCalled();
    expect(ctx.syncPosData).not.toHaveBeenCalled();
    expect(ctx.view.result.current.holdBusy).toBe(false);
  });

  it('falls back to a generic message when the server sends none', async () => {
    createLayaway.mockRejectedValue(new Error('network'));
    await hold();
    expect(alertSpy).toHaveBeenCalledWith('Failed to hold the bill.');
  });
});

describe('recallInvoice', () => {
  it('starts the layaway conversion then reloads the holds', async () => {
    const ctx = setup();
    await waitFor(() => expect(getLayaways).toHaveBeenCalledTimes(1));

    await act(async () => { await ctx.view.result.current.recallInvoice(7); });

    expect(ctx.startLayawayConversion).toHaveBeenCalledWith(7);
    expect(getLayaways).toHaveBeenCalledTimes(2);
  });

  it('surfaces the server message on failure', async () => {
    const ctx = setup({
      startLayawayConversion: vi.fn().mockRejectedValue(
        { response: { data: { message: 'Already converted' } } }),
    });
    await waitFor(() => expect(getLayaways).toHaveBeenCalled());

    await act(async () => { await ctx.view.result.current.recallInvoice(7); });
    expect(alertSpy).toHaveBeenCalledWith('Already converted');
  });

  it('falls back to a generic message', async () => {
    const ctx = setup({ startLayawayConversion: vi.fn().mockRejectedValue(new Error('boom')) });
    await waitFor(() => expect(getLayaways).toHaveBeenCalled());

    await act(async () => { await ctx.view.result.current.recallInvoice(7); });
    expect(alertSpy).toHaveBeenCalledWith('Failed to recall the held bill.');
  });

  it('CHARACTERIZED BEHAVIOUR: recall never re-syncs POS data', async () => {
    // Unlike hold and delete, which both call syncPosData.
    const ctx = setup();
    await waitFor(() => expect(getLayaways).toHaveBeenCalled());
    await act(async () => { await ctx.view.result.current.recallInvoice(7); });
    expect(ctx.syncPosData).not.toHaveBeenCalled();
  });
});

describe('deleteHeldBill', () => {
  /** Runs deleteHeldBill and returns the confirm-dialog descriptor it raised. */
  const openConfirm = async (id, over = {}) => {
    getLayaways.mockResolvedValue([layaway()]);
    const ctx = setup(over);
    await waitFor(() => expect(ctx.view.result.current.heldSales).toHaveLength(1));
    act(() => { ctx.view.result.current.deleteHeldBill(id); });
    return { ctx, descriptor: ctx.setConfirmAction.mock.calls[0][0] };
  };

  it('raises a confirm dialog naming the bill, and calls no API yet', async () => {
    const { descriptor } = await openConfirm(1);

    expect(descriptor.title).toBe('Delete Held Bill');
    expect(descriptor.message).toBe('Delete LAY-0001? Reserved stock will be released.');
    expect(typeof descriptor.onConfirm).toBe('function');
    expect(cancelLayaway).not.toHaveBeenCalled();
  });

  it('falls back to generic wording for an unknown id', async () => {
    const { descriptor } = await openConfirm(999);
    expect(descriptor.message).toBe('Delete this held bill? Reserved stock will be released.');
  });

  it('on confirm cancels the layaway with the session id, reloads and re-syncs', async () => {
    const { ctx, descriptor } = await openConfirm(1);
    await act(async () => { await descriptor.onConfirm(); });

    expect(cancelLayaway).toHaveBeenCalledWith(1, 42);
    expect(ctx.syncPosData).toHaveBeenCalledTimes(1);
    // Marks busy, then closes the dialog.
    expect(ctx.setConfirmAction).toHaveBeenLastCalledWith(null);
  });

  it('CHARACTERIZED BEHAVIOUR: the cancel session id comes from currentSession, not sessionId', () => {
    // cancelLayaway(id, currentSession?.id ?? null) — it reads the raw session object
    // rather than the validated numeric sessionId the rest of the hook uses. A session
    // whose id is not a number therefore still reaches the API here.
    return (async () => {
      const { descriptor } = await openConfirm(1, { currentSession: { id: 'not-a-number' } });
      await act(async () => { await descriptor.onConfirm(); });
      expect(cancelLayaway).toHaveBeenCalledWith(1, 'not-a-number');
    })();
  });

  it('reports a 403 as a supervisor-permission problem and keeps the dialog open', async () => {
    cancelLayaway.mockRejectedValue({ response: { status: 403 } });
    const { ctx, descriptor } = await openConfirm(1);
    await act(async () => { await descriptor.onConfirm(); });

    const updater = ctx.setConfirmAction.mock.calls.at(-1)[0];
    expect(typeof updater).toBe('function');
    expect(updater({ title: 'x' })).toEqual({
      title: 'x',
      busy: false,
      error: 'You do not have permission to delete a held bill (supervisor required).',
    });
    expect(ctx.syncPosData).not.toHaveBeenCalled();
  });

  it('reports any other failure with the server message, then a generic fallback', async () => {
    cancelLayaway.mockRejectedValue({ response: { status: 409, data: { message: 'Already cancelled' } } });
    const first = await openConfirm(1);
    await act(async () => { await first.descriptor.onConfirm(); });
    expect(first.ctx.setConfirmAction.mock.calls.at(-1)[0]({}).error).toBe('Already cancelled');

    vi.clearAllMocks();
    cancelLayaway.mockRejectedValue(new Error('network'));
    const second = await openConfirm(1);
    await act(async () => { await second.descriptor.onConfirm(); });
    expect(second.ctx.setConfirmAction.mock.calls.at(-1)[0]({}).error).toBe('Failed to delete held bill.');
  });
});
