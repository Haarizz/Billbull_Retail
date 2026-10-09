import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  getLayaways: vi.fn(),
  getLayaway: vi.fn(),
  cancelLayaway: vi.fn(),
}));

import { cancelLayaway, getLayaway, getLayaways } from '../../../api/posApi';
import { useLayaway } from '../POS/features/layaway/useLayaway';

/**
 * CHARACTERIZATION — layaway browsing, conversion and cancellation.
 *
 * This was twelve useState calls, a useCallback, two effects and three handlers inside
 * POSSales.jsx, and therefore unreachable from any test. The Phase 3 extraction moved
 * them verbatim into a hook, so the filter params, the convertible-status gate, the
 * cart projection and the error paths can now be asserted.
 *
 * saveCurrentLayaway deliberately stayed in POSSales (its dependency is the printing
 * subsystem, not layaway), so it is out of scope here.
 *
 * These tests describe CURRENT behaviour.
 */

const SESSION = { id: 42, branchId: 7 };
const TERMINAL = { branchId: 7, branchName: 'Main Branch' };
const CUSTOMERS = [
  { id: 'c1', code: 'CUST-1', name: 'Fatima Hassan' },
  { id: 'c2', code: 'CUST-2', name: 'Acme Trading' },
];

/** Mirrors POSSales' recalculateInvoice: computePosCartTotals with the live settings. */
const recalcSpy = vi.fn((items, billDiscountAmount = 0) => ({
  items,
  subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
  totalDiscount: 0,
  tax: 0,
  total: items.reduce((s, i) => s + i.price * i.quantity, 0) - billDiscountAmount,
  billDiscountAmount,
  taxInclusive: false,
}));

const setup = (over = {}) => {
  const setCurrentInvoice = vi.fn();
  const setSelectedCustomer = vi.fn();
  const setConfirmAction = vi.fn();
  const syncPosData = vi.fn();
  const args = {
    currentSession: SESSION,
    currentTerminal: TERMINAL,
    posSettings: { taxEnabled: true, branchDefaultVatRate: 5 },
    recalculateInvoice: recalcSpy,
    setCurrentInvoice,
    customerOptions: CUSTOMERS,
    setSelectedCustomer,
    setConfirmAction,
    syncPosDataRef: { current: syncPosData },
    ...over,
  };
  const view = renderHook(() => useLayaway(args));
  return { view, args, setCurrentInvoice, setSelectedCustomer, setConfirmAction, syncPosData };
};

/** A layaway list row as GET /layaways returns it. */
const row = (o = {}) => ({ id: 1, layawayNumber: 'LAY-0001', saleTotal: 500, ...o });

/** A layaway detail as GET /layaways/{id} returns it. */
const detail = (o = {}) => ({
  id: 1,
  status: 'ACTIVE',
  saleTotal: 200,
  billDiscountAmount: 0,
  depositAmount: 50,
  customerCode: 'CUST-1',
  items: [{
    itemCode: 'SKU-1', itemName: 'Widget', price: 100, quantity: 2,
    discount: 0, taxRate: 5, pinnedBatchNumber: null, serialNumber: null,
  }],
  ...o,
});

let alertSpy;
beforeEach(() => {
  vi.clearAllMocks();
  getLayaways.mockResolvedValue([]);
  getLayaway.mockResolvedValue(detail());
  cancelLayaway.mockResolvedValue({});
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('initial state', () => {
  it('starts with an empty, idle, unfiltered list', () => {
    const { view } = setup();
    const r = view.result.current;

    expect(r.layawaysList).toEqual([]);
    expect(r.layawaysLoading).toBe(false);
    expect(r.layawaysError).toBe(null);
    expect(r.showLayawaysList).toBe(false);
    expect(r.layawaysFilterStatus).toBe('All');
    expect(r.layawaysFilterCustomer).toBe('');
    expect(r.layawaysFilterNo).toBe('');
    expect(r.selectedLayawayId).toBe(null);
    expect(r.selectedLayawayDetail).toBe(null);
    expect(r.layawayBusyId).toBe(null);
  });

  it('starts with no active conversion', () => {
    const { view } = setup();
    expect(view.result.current.activeLayawayId).toBe(null);
    expect(view.result.current.activeLayawayDeposit).toBe(0);
  });

  it('does not fetch until the modal is opened', () => {
    setup();
    expect(getLayaways).not.toHaveBeenCalled();
  });
});

describe('loadLayaways', () => {
  it('fetches when the list modal opens', async () => {
    const { view } = setup();
    act(() => view.result.current.setShowLayawaysList(true));
    await waitFor(() => expect(getLayaways).toHaveBeenCalledTimes(1));
  });

  it('sends only the branch when nothing is filtered', async () => {
    const { view } = setup();
    await act(async () => { await view.result.current.loadLayaways(); });
    expect(getLayaways).toHaveBeenCalledWith({ branchId: 7 });
  });

  it('prefers the terminal branch, falling back to the session branch', async () => {
    const a = setup({ currentTerminal: null, currentSession: { id: 42, branchId: 99 } });
    await act(async () => { await a.view.result.current.loadLayaways(); });
    expect(getLayaways).toHaveBeenCalledWith({ branchId: 99 });

    vi.clearAllMocks();
    getLayaways.mockResolvedValue([]);
    const b = setup({ currentTerminal: null, currentSession: { id: 42 } });
    await act(async () => { await b.view.result.current.loadLayaways(); });
    // No branch at all -> the key is omitted entirely, not sent as null.
    expect(getLayaways).toHaveBeenCalledWith({});
  });

  it('maps a status label onto its backend enum', async () => {
    const { view } = setup();
    act(() => view.result.current.setLayawaysFilterStatus('Partially Paid'));
    await act(async () => { await view.result.current.loadLayaways(); });

    const params = getLayaways.mock.calls.at(-1)[0];
    expect(params.status).toBe('PARTIALLY_PAID');
  });

  it('passes an unmapped status label through unchanged', async () => {
    const { view } = setup();
    act(() => view.result.current.setLayawaysFilterStatus('SOMETHING_NEW'));
    await act(async () => { await view.result.current.loadLayaways(); });
    expect(getLayaways.mock.calls.at(-1)[0].status).toBe('SOMETHING_NEW');
  });

  it('omits the status entirely for "All"', async () => {
    const { view } = setup();
    await act(async () => { await view.result.current.loadLayaways(); });
    expect(getLayaways.mock.calls.at(-1)[0]).not.toHaveProperty('status');
  });

  it('trims the customer and number filters, omitting blank ones', async () => {
    const { view } = setup();
    act(() => {
      view.result.current.setLayawaysFilterCustomer('  Fatima  ');
      view.result.current.setLayawaysFilterNo('  LAY-0001  ');
    });
    await act(async () => { await view.result.current.loadLayaways(); });

    const params = getLayaways.mock.calls.at(-1)[0];
    expect(params.customer).toBe('Fatima');
    expect(params.number).toBe('LAY-0001');

    act(() => {
      view.result.current.setLayawaysFilterCustomer('   ');
      view.result.current.setLayawaysFilterNo('');
    });
    await act(async () => { await view.result.current.loadLayaways(); });
    const blank = getLayaways.mock.calls.at(-1)[0];
    expect(blank).not.toHaveProperty('customer');
    expect(blank).not.toHaveProperty('number');
  });

  it('stores the returned rows', async () => {
    getLayaways.mockResolvedValue([row(), row({ id: 2, layawayNumber: 'LAY-0002' })]);
    const { view } = setup();
    await act(async () => { await view.result.current.loadLayaways(); });
    expect(view.result.current.layawaysList).toHaveLength(2);
  });

  it('surfaces the server message and empties the list on failure', async () => {
    getLayaways.mockRejectedValue({ response: { data: { message: 'Branch not permitted' } } });
    const { view } = setup();
    await act(async () => { await view.result.current.loadLayaways(); });

    expect(view.result.current.layawaysError).toBe('Branch not permitted');
    expect(view.result.current.layawaysList).toEqual([]);
    expect(view.result.current.layawaysLoading).toBe(false);
  });

  it('falls back to a generic error message', async () => {
    getLayaways.mockRejectedValue(new Error('network'));
    const { view } = setup();
    await act(async () => { await view.result.current.loadLayaways(); });
    expect(view.result.current.layawaysError).toBe('Failed to load layaways.');
  });

  it('clears a previous error when a later load succeeds', async () => {
    getLayaways.mockRejectedValueOnce(new Error('network'));
    const { view } = setup();
    await act(async () => { await view.result.current.loadLayaways(); });
    expect(view.result.current.layawaysError).not.toBe(null);

    getLayaways.mockResolvedValue([row()]);
    await act(async () => { await view.result.current.loadLayaways(); });
    expect(view.result.current.layawaysError).toBe(null);
  });
});

describe('selected layaway detail', () => {
  it('fetches the detail when a row is selected', async () => {
    const { view } = setup();
    act(() => view.result.current.setSelectedLayawayId(1));
    await waitFor(() => expect(getLayaway).toHaveBeenCalledWith(1));
    await waitFor(() => expect(view.result.current.selectedLayawayDetail).not.toBe(null));
  });

  it('clears the detail when the selection is cleared, without fetching', async () => {
    const { view } = setup();
    act(() => view.result.current.setSelectedLayawayId(1));
    await waitFor(() => expect(view.result.current.selectedLayawayDetail).not.toBe(null));

    vi.clearAllMocks();
    act(() => view.result.current.setSelectedLayawayId(null));
    await waitFor(() => expect(view.result.current.selectedLayawayDetail).toBe(null));
    expect(getLayaway).not.toHaveBeenCalled();
  });

  it('clears the detail silently when the fetch fails — no error state, no alert', async () => {
    getLayaway.mockRejectedValue(new Error('gone'));
    const { view } = setup();
    act(() => view.result.current.setSelectedLayawayId(1));

    await waitFor(() => expect(getLayaway).toHaveBeenCalled());
    expect(view.result.current.selectedLayawayDetail).toBe(null);
    expect(view.result.current.layawaysError).toBe(null);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('startLayawayConversion', () => {
  const convert = async (detailOverride, over = {}) => {
    if (detailOverride) getLayaway.mockResolvedValue(detailOverride);
    const ctx = setup(over);
    await act(async () => { await ctx.view.result.current.startLayawayConversion(1); });
    return ctx;
  };

  it('accepts every convertible status', async () => {
    for (const status of ['ACTIVE', 'PARTIALLY_PAID', 'READY_TO_CONVERT', undefined]) {
      vi.clearAllMocks();
      const ctx = await convert(detail({ status }));
      expect(alertSpy).not.toHaveBeenCalled();
      expect(ctx.setCurrentInvoice).toHaveBeenCalled();
    }
  });

  it('refuses a non-convertible status with a humanised message', async () => {
    const ctx = await convert(detail({ status: 'FULLY_PAID' }));

    expect(alertSpy).toHaveBeenCalledWith('This layaway is fully paid and cannot be converted.');
    expect(ctx.setCurrentInvoice).not.toHaveBeenCalled();
    expect(ctx.view.result.current.activeLayawayId).toBe(null);
  });

  it('projects layaway items onto the cart line shape', async () => {
    const ctx = await convert(detail());
    const items = ctx.setCurrentInvoice.mock.calls[0][0].items;

    expect(items[0]).toEqual({
      id: 'SKU-1',
      productId: 'SKU-1',
      name: 'Widget',
      barcode: 'SKU-1',
      code: 'SKU-1',
      image: null,
      price: 100,
      quantity: 2,
      discount: 0,
      taxRate: 5,
      total: 200,
      pinnedBatchNumber: null,
      serialNumber: null,
      expiryDate: null,
      isVoided: false,
    });
  });

  it('composes a batch-qualified line id when a batch is pinned', async () => {
    const ctx = await convert(detail({
      items: [{ itemCode: 'SKU-1', itemName: 'W', price: 10, quantity: 1, pinnedBatchNumber: 'B-1' }],
    }));
    expect(ctx.setCurrentInvoice.mock.calls[0][0].items[0].id).toBe('SKU-1::B-1');
  });

  it('falls back to the branch default VAT rate when a line carries none', async () => {
    const ctx = await convert(detail({
      items: [{ itemCode: 'S', itemName: 'W', price: 10, quantity: 1, taxRate: null }],
    }));
    expect(ctx.setCurrentInvoice.mock.calls[0][0].items[0].taxRate).toBe(5);
  });

  it('uses 0% when the branch tax switch is off', async () => {
    const ctx = await convert(
      detail({ items: [{ itemCode: 'S', itemName: 'W', price: 10, quantity: 1, taxRate: null }] }),
      { posSettings: { taxEnabled: false, branchDefaultVatRate: 5 } },
    );
    expect(ctx.setCurrentInvoice.mock.calls[0][0].items[0].taxRate).toBe(0);
  });

  it('prefers the stored bill discount over a derived one', async () => {
    const ctx = await convert(detail({ billDiscountAmount: 25, saleTotal: 175 }));
    expect(recalcSpy).toHaveBeenLastCalledWith(expect.any(Array), 25);
    expect(ctx.setCurrentInvoice.mock.calls[0][0].billDiscountAmount).toBe(25);
  });

  it('derives a bill discount when none is stored and the total falls short', async () => {
    // Items total 200, saleTotal 180 -> a 20 discount is derived so the cart ties out.
    const ctx = await convert(detail({ billDiscountAmount: 0, saleTotal: 180 }));
    expect(ctx.setCurrentInvoice.mock.calls[0][0].billDiscountAmount).toBe(20);
  });

  it('never derives a negative bill discount', async () => {
    const ctx = await convert(detail({ billDiscountAmount: 0, saleTotal: 999 }));
    expect(ctx.setCurrentInvoice.mock.calls[0][0].billDiscountAmount).toBe(0);
  });

  it('selects the matching customer by code, then by id', async () => {
    const byCode = await convert(detail({ customerCode: 'CUST-2' }));
    expect(byCode.setSelectedCustomer).toHaveBeenCalledWith('c2');

    vi.clearAllMocks();
    const byId = await convert(detail({ customerCode: 'c1' }));
    expect(byId.setSelectedCustomer).toHaveBeenCalledWith('c1');
  });

  it('leaves the customer alone when no match is loaded', async () => {
    const ctx = await convert(detail({ customerCode: 'UNKNOWN' }));
    expect(ctx.setSelectedCustomer).not.toHaveBeenCalled();
  });

  it('tags the cart with the layaway and pre-credits its deposit', async () => {
    const ctx = await convert(detail({ id: 9, depositAmount: 50 }));
    expect(ctx.view.result.current.activeLayawayId).toBe(9);
    expect(ctx.view.result.current.activeLayawayDeposit).toBe(50);
  });

  it('treats a missing deposit as zero', async () => {
    const ctx = await convert(detail({ depositAmount: null }));
    expect(ctx.view.result.current.activeLayawayDeposit).toBe(0);
  });

  it('closes the list modal and clears the selection', async () => {
    getLayaway.mockResolvedValue(detail());
    const ctx = setup();
    act(() => {
      ctx.view.result.current.setShowLayawaysList(true);
      ctx.view.result.current.setSelectedLayawayId(1);
    });
    await act(async () => { await ctx.view.result.current.startLayawayConversion(1); });

    expect(ctx.view.result.current.showLayawaysList).toBe(false);
    expect(ctx.view.result.current.selectedLayawayId).toBe(null);
  });

  it('surfaces the server message on a failed fetch and changes nothing', async () => {
    getLayaway.mockRejectedValue({ response: { data: { message: 'Layaway locked' } } });
    const ctx = setup();
    await act(async () => { await ctx.view.result.current.startLayawayConversion(1); });

    expect(alertSpy).toHaveBeenCalledWith('Layaway locked');
    expect(ctx.setCurrentInvoice).not.toHaveBeenCalled();
    expect(ctx.view.result.current.activeLayawayId).toBe(null);
  });

  it('falls back to a generic message', async () => {
    getLayaway.mockRejectedValue(new Error('network'));
    const ctx = setup();
    await act(async () => { await ctx.view.result.current.startLayawayConversion(1); });
    expect(alertSpy).toHaveBeenCalledWith('Failed to load layaway for conversion.');
  });

  it('CHARACTERIZED BEHAVIOUR: conversion does not re-sync POS data', async () => {
    const ctx = await convert(detail());
    expect(ctx.syncPosData).not.toHaveBeenCalled();
  });
});

describe('handleCancelLayaway', () => {
  const openConfirm = async (id) => {
    getLayaways.mockResolvedValue([row({ id: 1, layawayNumber: 'LAY-0001' })]);
    const ctx = setup();
    await act(async () => { await ctx.view.result.current.loadLayaways(); });
    act(() => { ctx.view.result.current.handleCancelLayaway(id); });
    return { ctx, descriptor: ctx.setConfirmAction.mock.calls[0][0] };
  };

  it('raises a confirm dialog naming the layaway, calling no API yet', async () => {
    const { descriptor } = await openConfirm(1);

    expect(descriptor.title).toBe('Cancel Layaway');
    expect(descriptor.message).toBe('Cancel LAY-0001? Reserved stock will be released.');
    expect(cancelLayaway).not.toHaveBeenCalled();
  });

  it('falls back to generic wording for an unknown id', async () => {
    const { descriptor } = await openConfirm(999);
    expect(descriptor.message).toBe('Cancel this layaway? Reserved stock will be released.');
  });

  it('on confirm cancels with the session id, reloads and re-syncs', async () => {
    const { ctx, descriptor } = await openConfirm(1);
    await act(async () => { await descriptor.onConfirm(); });

    expect(cancelLayaway).toHaveBeenCalledWith(1, 42);
    expect(getLayaways).toHaveBeenCalledTimes(2);   // initial load + refresh
    expect(ctx.syncPosData).toHaveBeenCalledTimes(1);
    expect(ctx.setConfirmAction).toHaveBeenLastCalledWith(null);
    expect(ctx.view.result.current.layawayBusyId).toBe(null);
  });

  it('passes null for the session when there is none', async () => {
    getLayaways.mockResolvedValue([row()]);
    const ctx = setup({ currentSession: null });
    await act(async () => { await ctx.view.result.current.loadLayaways(); });
    act(() => { ctx.view.result.current.handleCancelLayaway(1); });

    await act(async () => { await ctx.setConfirmAction.mock.calls[0][0].onConfirm(); });
    expect(cancelLayaway).toHaveBeenCalledWith(1, null);
  });

  it('clears the selection when the cancelled layaway was selected', async () => {
    getLayaways.mockResolvedValue([row()]);
    const ctx = setup();
    await act(async () => { await ctx.view.result.current.loadLayaways(); });
    act(() => ctx.view.result.current.setSelectedLayawayId(1));
    await waitFor(() => expect(ctx.view.result.current.selectedLayawayId).toBe(1));

    act(() => { ctx.view.result.current.handleCancelLayaway(1); });
    await act(async () => { await ctx.setConfirmAction.mock.calls[0][0].onConfirm(); });
    expect(ctx.view.result.current.selectedLayawayId).toBe(null);
  });

  it('reports a 403 as a supervisor-permission problem and keeps the dialog open', async () => {
    cancelLayaway.mockRejectedValue({ response: { status: 403 } });
    const { ctx, descriptor } = await openConfirm(1);
    await act(async () => { await descriptor.onConfirm(); });

    const updater = ctx.setConfirmAction.mock.calls.at(-1)[0];
    expect(updater({ title: 'x' })).toEqual({
      title: 'x',
      busy: false,
      error: 'You do not have permission to cancel a layaway (supervisor required).',
    });
    expect(ctx.syncPosData).not.toHaveBeenCalled();
    expect(ctx.view.result.current.layawayBusyId).toBe(null);
  });

  it('reports any other failure with the server message, then a generic fallback', async () => {
    cancelLayaway.mockRejectedValue({ response: { status: 409, data: { message: 'Already converted' } } });
    const first = await openConfirm(1);
    await act(async () => { await first.descriptor.onConfirm(); });
    expect(first.ctx.setConfirmAction.mock.calls.at(-1)[0]({}).error).toBe('Already converted');

    vi.clearAllMocks();
    cancelLayaway.mockRejectedValue(new Error('network'));
    const second = await openConfirm(1);
    await act(async () => { await second.descriptor.onConfirm(); });
    expect(second.ctx.setConfirmAction.mock.calls.at(-1)[0]({}).error).toBe('Failed to cancel layaway.');
  });
});
