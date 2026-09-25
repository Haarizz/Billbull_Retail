import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({ getDeliveryOrders: vi.fn() }));
vi.mock('../../../api/employeeApi', () => ({ getDeliveryPersons: vi.fn() }));
vi.mock('../../../api/customerledgerApi', () => ({ addCustomerSavedAddress: vi.fn() }));

import { getDeliveryOrders } from '../../../api/posApi';
import { getDeliveryPersons } from '../../../api/employeeApi';
import { addCustomerSavedAddress } from '../../../api/customerledgerApi';
import { useDelivery } from '../POS/features/delivery/useDelivery';
import { WALK_IN_CUSTOMER } from '../POS/posConstants';

/**
 * CHARACTERIZATION — delivery orders, persons, saved addresses and the settle list.
 *
 * This was 28 useState calls, two loaders, two effects, a memo and three handlers inside
 * POSSales.jsx, and therefore unreachable from any test. The Phase 3 extraction moved
 * them verbatim into a hook.
 *
 * OUT OF SCOPE HERE, and deliberately not extracted: handleOutForDelivery and the
 * settlement handler. Both are print-coupled and stay in POSSales, so their behaviour is
 * not characterized in this file — printing has its own extraction phase.
 *
 * These tests describe CURRENT behaviour.
 */

const TERMINAL = { branchId: 7, terminalId: 'TERM-01' };
const CART = { items: [{ code: 'SKU-1', quantity: 1, price: 50 }] };

const setup = (over = {}) => {
  const setPosCustomers = vi.fn();
  const clearDeliverySettleLines = vi.fn();
  const args = {
    currentTerminal: TERMINAL,
    currentInvoice: CART,
    selectedCustomerData: { id: 'c1', name: 'Fatima Hassan', address: '12 Jumeirah Rd' },
    setPosCustomers,
    clearDeliverySettleLines,
    ...over,
  };
  const view = renderHook(() => useDelivery(args));
  return { view, args, setPosCustomers, clearDeliverySettleLines };
};

/** A delivery order as GET /delivery-orders returns it. */
const order = (o = {}) => ({
  id: 1, customerName: 'Fatima Hassan', invoiceNumber: 'INV-0001',
  posDriverName: 'Omar', invoiceTotal: 220, deliveryCharge: 20, amountPaid: 50, ...o,
});

let alertSpy;
beforeEach(() => {
  vi.clearAllMocks();
  getDeliveryOrders.mockResolvedValue([]);
  getDeliveryPersons.mockResolvedValue([]);
  addCustomerSavedAddress.mockResolvedValue([]);
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('initial state', () => {
  it('starts with empty order fields and both modals closed', () => {
    const r = setup().view.result.current;

    expect(r.deliveryAddress).toBe('');
    expect(r.deliveryNotes).toBe('');
    expect(r.deliveryDriver).toBe('');
    expect(r.deliveryCharge).toBe('');
    expect(r.showDeliveryModal).toBe(false);
    expect(r.showDeliverySettleModal).toBe(false);
    expect(r.deliveryModalTab).toBe('existing');
  });

  it('starts with an empty roster, list and validation state', () => {
    const r = setup().view.result.current;

    expect(r.deliveryPersons).toEqual([]);
    expect(r.deliveryPersonsLoading).toBe(false);
    expect(r.deliveryOrders).toEqual([]);
    expect(r.deliveryOrdersLoading).toBe(false);
    expect(r.deliveryValidationErrors).toEqual({});
    expect(r.selectedDeliveryPerson).toBe(null);
    expect(r.deliverySettlePersonFilter).toBe('All Persons');
    expect(r.deliverySettleSelected).toBe(null);
    expect(r.deliveryOutLoading).toBe(false);
    expect(r.deliverySettleLoading).toBe(false);
  });

  it('seeds the new-address draft with UAE as the country', () => {
    expect(setup().view.result.current.deliveryNewAddress).toEqual({
      name: '', address1: '', city: '', country: 'UAE', contactName: '', contactPhone: '',
    });
  });

  it('fetches nothing until a modal opens', () => {
    setup();
    expect(getDeliveryOrders).not.toHaveBeenCalled();
    expect(getDeliveryPersons).not.toHaveBeenCalled();
  });
});

describe('loadDeliveryOrders', () => {
  it('fetches with the terminal branch', async () => {
    const { view } = setup();
    await act(async () => { await view.result.current.loadDeliveryOrders(); });
    expect(getDeliveryOrders).toHaveBeenCalledWith(7);
  });

  it('CHARACTERIZED BEHAVIOUR: it reads only the TERMINAL branch, never the session', async () => {
    // Unlike useHeldSales/useLayaway, which fall back to currentSession.branchId, this
    // loader passes null when no terminal is registered.
    const { view } = setup({ currentTerminal: null });
    await act(async () => { await view.result.current.loadDeliveryOrders(); });
    expect(getDeliveryOrders).toHaveBeenCalledWith(null);
  });

  it('projects each order onto the settle-row shape', async () => {
    getDeliveryOrders.mockResolvedValue([order()]);
    const { view } = setup();
    await act(async () => { await view.result.current.loadDeliveryOrders(); });

    expect(view.result.current.deliveryOrders[0]).toEqual({
      id: 1,
      customer: 'Fatima Hassan',
      invoice: 'INV-0001',
      mobile: '',
      person: 'Omar',
      invoiceAmt: 200,        // invoiceTotal 220 - deliveryCharge 20
      deliveryCharge: 20,
      paidAmt: 50,
    });
  });

  it('CHARACTERIZED QUIRK: the mobile column is hard-coded empty', async () => {
    // The settle modal filters on o.mobile, so a mobile-number search can never match.
    getDeliveryOrders.mockResolvedValue([order({ customerMobile: '+971 50 123 4567' })]);
    const { view } = setup();
    await act(async () => { await view.result.current.loadDeliveryOrders(); });
    expect(view.result.current.deliveryOrders[0].mobile).toBe('');
  });

  it('defaults an unnamed customer and an unassigned driver', async () => {
    getDeliveryOrders.mockResolvedValue([order({ customerName: null, posDriverName: null })]);
    const { view } = setup();
    await act(async () => { await view.result.current.loadDeliveryOrders(); });

    expect(view.result.current.deliveryOrders[0].customer).toBe('Walk-in Customer');
    expect(view.result.current.deliveryOrders[0].person).toBe('');
  });

  it('coerces missing amounts to zero', async () => {
    getDeliveryOrders.mockResolvedValue([
      order({ invoiceTotal: null, deliveryCharge: undefined, amountPaid: null }),
    ]);
    const { view } = setup();
    await act(async () => { await view.result.current.loadDeliveryOrders(); });

    expect(view.result.current.deliveryOrders[0]).toMatchObject({
      invoiceAmt: 0, deliveryCharge: 0, paidAmt: 0,
    });
  });

  it('treats a non-array response as an empty list', async () => {
    getDeliveryOrders.mockResolvedValue(null);
    const { view } = setup();
    await act(async () => { await view.result.current.loadDeliveryOrders(); });
    expect(view.result.current.deliveryOrders).toEqual([]);
  });

  it('warns and empties the list on failure — no error state is exposed', async () => {
    getDeliveryOrders.mockRejectedValue(new Error('offline'));
    const { view } = setup();
    await act(async () => { await view.result.current.loadDeliveryOrders(); });

    expect(console.warn).toHaveBeenCalledWith('Failed to load delivery orders', expect.any(Error));
    expect(view.result.current.deliveryOrders).toEqual([]);
    expect(view.result.current.deliveryOrdersLoading).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('settle modal open', () => {
  it('resets the filters, selection and payment lines, then loads', async () => {
    const ctx = setup();
    act(() => {
      ctx.view.result.current.setDeliverySettleSearch('abc');
      ctx.view.result.current.setDeliverySettlePersonFilter('Omar');
      ctx.view.result.current.setDeliverySettleSelected({ id: 1 });
    });
    act(() => ctx.view.result.current.setShowDeliverySettleModal(true));

    await waitFor(() => expect(getDeliveryOrders).toHaveBeenCalledTimes(1));
    expect(ctx.view.result.current.deliverySettleSearch).toBe('');
    expect(ctx.view.result.current.deliverySettlePersonFilter).toBe('All Persons');
    expect(ctx.view.result.current.deliverySettleSelected).toBe(null);
    expect(ctx.clearDeliverySettleLines).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the modal closes', async () => {
    const ctx = setup();
    act(() => ctx.view.result.current.setShowDeliverySettleModal(true));
    await waitFor(() => expect(getDeliveryOrders).toHaveBeenCalledTimes(1));

    act(() => ctx.view.result.current.setShowDeliverySettleModal(false));
    expect(getDeliveryOrders).toHaveBeenCalledTimes(1);
  });
});

describe('delivery persons', () => {
  it('loads the roster and clears validation when the order modal opens', async () => {
    getDeliveryPersons.mockResolvedValue([{ employeeCode: 'E1', name: 'Omar' }]);
    const { view } = setup();
    act(() => view.result.current.setDeliveryValidationErrors({ address: 'required' }));
    act(() => view.result.current.setShowDeliveryModal(true));

    await waitFor(() => expect(view.result.current.deliveryPersons).toHaveLength(1));
    expect(view.result.current.deliveryValidationErrors).toEqual({});
    expect(view.result.current.deliveryPersonsLoading).toBe(false);
  });

  it('warns and empties the roster on failure', async () => {
    getDeliveryPersons.mockRejectedValue(new Error('offline'));
    const { view } = setup();
    act(() => view.result.current.setShowDeliveryModal(true));

    await waitFor(() => expect(console.warn)
      .toHaveBeenCalledWith('Failed to load delivery persons', expect.any(Error)));
    expect(view.result.current.deliveryPersons).toEqual([]);
  });

  it('treats a non-array roster as empty', async () => {
    getDeliveryPersons.mockResolvedValue({ nope: true });
    const { view } = setup();
    act(() => view.result.current.setShowDeliveryModal(true));
    await waitFor(() => expect(getDeliveryPersons).toHaveBeenCalled());
    expect(view.result.current.deliveryPersons).toEqual([]);
  });

  it('resolves the selected person by employee code, comparing as strings', async () => {
    getDeliveryPersons.mockResolvedValue([
      { employeeCode: 101, name: 'Omar' }, { employeeCode: 'E2', name: 'Aisha' },
    ]);
    const { view } = setup();
    act(() => view.result.current.setShowDeliveryModal(true));
    await waitFor(() => expect(view.result.current.deliveryPersons).toHaveLength(2));

    act(() => view.result.current.setDeliveryDriver('101'));   // string vs numeric code
    await waitFor(() => expect(view.result.current.selectedDeliveryPerson?.name).toBe('Omar'));

    act(() => view.result.current.setDeliveryDriver('NOBODY'));
    await waitFor(() => expect(view.result.current.selectedDeliveryPerson).toBe(null));
  });
});

describe('validateDeliveryOrder', () => {
  /** Fills every required field, then applies overrides. */
  const validated = async (patch = {}, over = {}) => {
    const ctx = setup(over);
    act(() => {
      ctx.view.result.current.setDeliveryCustomerId('c1');
      ctx.view.result.current.setDeliveryAddress('12 Jumeirah Rd');
      ctx.view.result.current.setDeliveryDate('2026-09-10');
      ctx.view.result.current.setDeliveryTimeSlot('10:00-12:00');
      ctx.view.result.current.setDeliveryDriver('E1');
    });
    act(() => {
      Object.entries(patch).forEach(([k, v]) => ctx.view.result.current[k](v));
    });
    let ok;
    act(() => { ok = ctx.view.result.current.validateDeliveryOrder(); });
    return { ctx, ok };
  };

  it('passes and clears errors when everything is filled', async () => {
    const { ctx, ok } = await validated();
    expect(ok).toBe(true);
    expect(ctx.view.result.current.deliveryValidationErrors).toEqual({});
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('reports every missing field at once, with one alert', async () => {
    const ctx = setup({ currentInvoice: { items: [] } });
    let ok;
    act(() => { ok = ctx.view.result.current.validateDeliveryOrder(); });

    expect(ok).toBe(false);
    expect(ctx.view.result.current.deliveryValidationErrors).toEqual({
      items: 'Add at least one item before dispatching.',
      customer: 'Customer is required.',
      address: 'Delivery address is required.',
      date: 'Delivery date is required.',
      timeSlot: 'Time slot is required.',
      deliveryDriver: 'Assign a delivery person.',
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Please complete the required delivery details before sending the order out for delivery.');
  });

  it('treats a whitespace-only address as missing', async () => {
    const { ctx, ok } = await validated({ setDeliveryAddress: '   ' });
    expect(ok).toBe(false);
    expect(ctx.view.result.current.deliveryValidationErrors.address).toBe('Delivery address is required.');
  });

  it('requires an item in the cart', async () => {
    const { ok, ctx } = await validated({}, { currentInvoice: { items: [] } });
    expect(ok).toBe(false);
    expect(ctx.view.result.current.deliveryValidationErrors.items).toBeDefined();
  });
});

describe('openDeliveryModal', () => {
  it('seeds the customer and address from the selected bill customer', () => {
    const { view } = setup();
    act(() => view.result.current.openDeliveryModal());

    expect(view.result.current.showDeliveryModal).toBe(true);
    expect(view.result.current.deliveryModalTab).toBe('existing');
    expect(view.result.current.deliveryCustomerId).toBe('c1');
    expect(view.result.current.deliveryAddress).toBe('12 Jumeirah Rd');
  });

  it('never overwrites an address the cashier already typed', () => {
    const { view } = setup();
    act(() => view.result.current.setDeliveryAddress('Typed by hand'));
    act(() => view.result.current.openDeliveryModal());
    expect(view.result.current.deliveryAddress).toBe('Typed by hand');
  });

  it('seeds nothing for a walk-in', () => {
    const { view } = setup({ selectedCustomerData: { id: WALK_IN_CUSTOMER.id, name: 'Walk-in' } });
    act(() => view.result.current.openDeliveryModal());

    expect(view.result.current.deliveryCustomerId).toBe('');
    expect(view.result.current.deliveryAddress).toBe('');
    expect(view.result.current.showDeliveryModal).toBe(true);
  });

  it('seeds nothing when no customer is selected at all', () => {
    const { view } = setup({ selectedCustomerData: null });
    act(() => view.result.current.openDeliveryModal());
    expect(view.result.current.deliveryCustomerId).toBe('');
  });

  it('leaves the address blank when the customer has none on file', () => {
    const { view } = setup({ selectedCustomerData: { id: 'c1', name: 'F' } });
    act(() => view.result.current.openDeliveryModal());
    expect(view.result.current.deliveryCustomerId).toBe('c1');
    expect(view.result.current.deliveryAddress).toBe('');
  });
});

describe('handleSaveDeliveryNewAddress', () => {
  const withDraft = (draft, customerId = 'c1') => {
    const ctx = setup();
    act(() => {
      ctx.view.result.current.setDeliveryCustomerId(customerId);
      ctx.view.result.current.setDeliveryNewAddress({
        name: 'Home', address1: '12 Jumeirah Rd', city: 'Dubai', country: 'UAE',
        contactName: 'Fatima', contactPhone: '+971 50 123 4567', ...draft,
      });
    });
    return ctx;
  };

  it('does nothing without a selected customer', async () => {
    const ctx = withDraft({}, '');
    await act(async () => { await ctx.view.result.current.handleSaveDeliveryNewAddress(); });
    expect(addCustomerSavedAddress).not.toHaveBeenCalled();
  });

  it('requires a label and an address line', async () => {
    const ctx = withDraft({ name: '  ' });
    await act(async () => { await ctx.view.result.current.handleSaveDeliveryNewAddress(); });

    expect(addCustomerSavedAddress).not.toHaveBeenCalled();
    expect(ctx.view.result.current.deliveryAddressError).toBe('Address label and address are required');
  });

  it('posts the trimmed address, packing contact details into address2', async () => {
    addCustomerSavedAddress.mockResolvedValue([]);
    const ctx = withDraft({ name: '  Home  ', address1: '  12 Jumeirah Rd  ' });
    await act(async () => { await ctx.view.result.current.handleSaveDeliveryNewAddress(); });

    expect(addCustomerSavedAddress).toHaveBeenCalledWith('c1', {
      name: 'Home',
      address1: '12 Jumeirah Rd',
      city: 'Dubai',
      country: 'UAE',
      address2: 'Fatima · +971 50 123 4567',
    });
  });

  it('omits a blank contact half from address2', async () => {
    const ctx = withDraft({ contactPhone: '   ' });
    await act(async () => { await ctx.view.result.current.handleSaveDeliveryNewAddress(); });
    expect(addCustomerSavedAddress.mock.calls[0][1].address2).toBe('Fatima');
  });

  it('selects the newly added address and clears the draft', async () => {
    addCustomerSavedAddress.mockResolvedValue([
      { address1: 'Old', city: 'AUH', country: 'UAE' },
      { address1: '12 Jumeirah Rd', address2: 'Fatima', city: 'Dubai', country: 'UAE' },
    ]);
    const ctx = withDraft({});
    act(() => ctx.view.result.current.setDeliveryValidationErrors({ address: 'required', date: 'required' }));
    await act(async () => { await ctx.view.result.current.handleSaveDeliveryNewAddress(); });

    // The LAST returned address is treated as the new one.
    expect(ctx.view.result.current.deliveryAddress).toBe('12 Jumeirah Rd, Fatima, Dubai, UAE');
    expect(ctx.view.result.current.deliveryNewAddress.name).toBe('');
    expect(ctx.view.result.current.deliveryNewAddress.country).toBe('UAE');
    expect(ctx.view.result.current.deliveryShowAddAddressModal).toBe(false);
    expect(ctx.view.result.current.deliveryAddressSaving).toBe(false);
    // Only the address error is cleared; the others survive.
    expect(ctx.view.result.current.deliveryValidationErrors).toEqual({ address: '', date: 'required' });
  });

  it('patches the saved addresses onto the matching POS customer', async () => {
    const updated = [{ address1: 'X', city: 'Dubai', country: 'UAE' }];
    addCustomerSavedAddress.mockResolvedValue(updated);
    const ctx = withDraft({});
    await act(async () => { await ctx.view.result.current.handleSaveDeliveryNewAddress(); });

    const updater = ctx.setPosCustomers.mock.calls[0][0];
    expect(updater([{ id: 'c1', name: 'F' }, { id: 'c2', name: 'A' }])).toEqual([
      { id: 'c1', name: 'F', savedAddresses: updated },
      { id: 'c2', name: 'A' },
    ]);
  });

  it('CHARACTERIZED BEHAVIOUR: an empty response leaves the address untouched', async () => {
    addCustomerSavedAddress.mockResolvedValue([]);
    const ctx = withDraft({});
    act(() => ctx.view.result.current.setDeliveryAddress('Existing'));
    await act(async () => { await ctx.view.result.current.handleSaveDeliveryNewAddress(); });

    // No "added" row to select, so the field keeps whatever was there — and the modal
    // still closes and the draft still resets.
    expect(ctx.view.result.current.deliveryAddress).toBe('Existing');
    expect(ctx.view.result.current.deliveryShowAddAddressModal).toBe(false);
  });

  it('reports a failure without closing the modal', async () => {
    addCustomerSavedAddress.mockRejectedValue(new Error('boom'));
    const ctx = withDraft({});
    act(() => ctx.view.result.current.setDeliveryShowAddAddressModal(true));
    await act(async () => { await ctx.view.result.current.handleSaveDeliveryNewAddress(); });

    expect(ctx.view.result.current.deliveryAddressError).toBe('Failed to save address. Please try again.');
    expect(ctx.view.result.current.deliveryShowAddAddressModal).toBe(true);
    expect(ctx.view.result.current.deliveryAddressSaving).toBe(false);
    expect(ctx.setPosCustomers).not.toHaveBeenCalled();
  });
});
