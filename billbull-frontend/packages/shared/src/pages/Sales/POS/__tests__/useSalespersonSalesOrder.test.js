import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * POS → Orders: a Sales Order taken up at the till brings its salesperson with it. The order's
 * salesperson is verified through the same server lookup a badge scan uses, and is dropped when
 * the cart lets go of the order so it cannot attribute the next, unrelated sale.
 */

const lookupSalespersonByCode = vi.fn();
const getSalesSettings = vi.fn();
const getTargetReadiness = vi.fn();

vi.mock('../../../../api/employeeApi', () => ({
  lookupSalespersonByCode: (...a) => lookupSalespersonByCode(...a),
}));
vi.mock('../../../../api/salesSettingsApi', () => ({
  getSalesSettings: (...a) => getSalesSettings(...a),
}));
vi.mock('../../../../api/employeeTargetsApi', () => ({
  getTargetReadiness: (...a) => getTargetReadiness(...a),
}));

import useSalesperson from '../features/sales/useSalesperson';

const REP = { id: 44, employeeCode: 'EMP-44', name: 'Asha Nair', role: 'Salesperson', status: 'Active' };
const ORDER = { soNumber: 'SO-0120', salespersonEmployeeId: 44, salespersonEmployeeCode: 'EMP-44' };

const mount = async (initialOrder, required) => {
  const view = renderHook(({ order }) => useSalesperson({ activeSalesOrder: order }), {
    initialProps: { order: initialOrder },
  });
  await waitFor(() => expect(view.result.current.salespersonRequired).toBe(required));
  return view;
};

describe('useSalesperson — salesperson carried from a Sales Order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTargetReadiness.mockResolvedValue({ required: false, ready: true, missing: [] });
    lookupSalespersonByCode.mockResolvedValue(REP);
  });

  it('adopts the order salesperson once the server verifies them', async () => {
    getSalesSettings.mockResolvedValue({ salespersonRequiredAtPos: true });
    const view = await mount(ORDER, true);

    await waitFor(() => expect(view.result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: 44, salespersonEmployeeCode: 'EMP-44',
    }));
    expect(lookupSalespersonByCode).toHaveBeenCalledWith('EMP-44');
    expect(view.result.current.salespersonVerified).toBe(true);
  });

  it('drops the adopted salesperson when the cart lets go of the order', async () => {
    getSalesSettings.mockResolvedValue({ salespersonRequiredAtPos: true });
    const view = await mount(ORDER, true);
    await waitFor(() => expect(view.result.current.verifiedSalesperson?.id).toBe(44));

    view.rerender({ order: null });

    await waitFor(() => expect(view.result.current.verifiedSalesperson).toBeNull());
    expect(view.result.current.salespersonVerified).toBe(false);
  });

  it('adopts nothing when the order salesperson is no longer eligible', async () => {
    getSalesSettings.mockResolvedValue({ salespersonRequiredAtPos: true });
    lookupSalespersonByCode.mockRejectedValue({ response: { status: 400, data: { message: 'inactive' } } });
    const view = await mount(ORDER, true);

    await waitFor(() => expect(lookupSalespersonByCode).toHaveBeenCalled());
    expect(view.result.current.verifiedSalesperson).toBeNull();
    expect(view.result.current.verifyError).toBe('');
  });

  it('with POS verification off, nothing is looked up (the server inherits the order salesperson)', async () => {
    getSalesSettings.mockResolvedValue({ salespersonRequiredAtPos: false });
    const view = await mount(ORDER, false);

    expect(lookupSalespersonByCode).not.toHaveBeenCalled();
    expect(view.result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: null, salespersonEmployeeCode: null,
    });
  });
});
