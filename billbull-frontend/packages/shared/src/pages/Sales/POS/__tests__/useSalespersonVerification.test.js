import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Verification behaviour in useSalesperson.
 *
 * The load-bearing assertion is that ONLY A SERVER-RESOLVED BARCODE attributes a sale. There is no
 * preselection, no default and no roster to fall back on, because anything short of a scan would
 * be the bypass the business rule forbids — most obviously for a Cashier + Salesperson ringing up
 * their own sale.
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

const SALES_ONE = { id: 7, employeeCode: 'EMP9664', name: 'Manager One', role: 'Salesperson' };
const VERIFIED = { ...SALES_ONE, status: 'Active', targetAmount: '100000.00', commissionRate: '10.00' };

const settings = (over = {}) => ({
  salespersonRequiredAtPos: false,
  salespersonRequiredAtBackOffice: false,
  monthlyTargetRequired: false,
  ...over,
});

/** Settled once the tenant switches have been read — there is nothing else to load. */
const mount = async (required = false) => {
  const view = renderHook(() => useSalesperson());
  await waitFor(() => expect(view.result.current.salespersonRequired).toBe(required));
  return view;
};

describe('useSalesperson — barcode verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalesSettings.mockResolvedValue(settings());
    getTargetReadiness.mockResolvedValue({ required: false, ready: true, missing: [] });
    lookupSalespersonByCode.mockResolvedValue(VERIFIED);
  });

  // ── feature OFF: the POS is exactly what it was before the feature ─────

  it('with POS verification off, nothing is attributed and no roster is even fetched', async () => {
    const view = await mount(false);

    // Not "unassigned pending a choice" — there is no choice to make. The checkout posts the
    // same body it posted before this feature existed.
    expect(view.result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: null, salespersonEmployeeCode: null,
    });
    // Nothing to block on either: the sale proceeds without a salesperson.
    expect(view.result.current.salespersonVerified).toBe(true);
    expect(view.result.current.effectiveSalesperson).toBeNull();
  });

  it('switching the feature off drops a verification already taken', async () => {
    // An admin turning the switch off mid-sale must not leave an attribution on the cart that the
    // tenant has stopped collecting — and turning it back on must not resurrect one.
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const view = await mount(true);
    await act(async () => { await view.result.current.verifyByCode('EMP9664'); });
    expect(view.result.current.salespersonPayload.salespersonEmployeeId).toBe(7);

    getSalesSettings.mockResolvedValue(settings());
    const off = await mount(false);
    expect(off.result.current.verifiedSalesperson).toBeNull();
    expect(off.result.current.salespersonPayload.salespersonEmployeeId).toBeNull();
  });

  // ── feature ON: only a scan counts ─────────────────────────────────────

  it('with POS verification on, a sale starts unverified with nothing preselected', async () => {
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const view = await mount(true);

    // No default, not even the caller's own linked employee: a preselection is not a
    // verification, and treating one as such is exactly how a Cashier + Salesperson would
    // never have to scan anything.
    expect(view.result.current.verifiedSalesperson).toBeNull();
    expect(view.result.current.effectiveSalesperson).toBeNull();
    expect(view.result.current.salespersonVerified).toBe(false);
    expect(view.result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: null, salespersonEmployeeCode: null,
    });
  });

  it('a successful scan becomes the verified salesperson and the payload', async () => {
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const view = await mount();
    await waitFor(() => expect(view.result.current.salespersonRequired).toBe(true));

    await act(async () => { await view.result.current.verifyByCode('EMP9664'); });

    expect(lookupSalespersonByCode).toHaveBeenCalledWith('EMP9664');
    expect(view.result.current.verifiedSalesperson).toMatchObject({ employeeCode: 'EMP9664' });
    expect(view.result.current.salespersonVerified).toBe(true);
    expect(view.result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: 7, salespersonEmployeeCode: 'EMP9664',
    });
  });

  it('surfaces the server reason for an ineligible employee and stays unverified', async () => {
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    lookupSalespersonByCode.mockRejectedValue({
      response: { status: 400, data: { message: 'Employee is not an eligible salesperson.' } },
    });
    const view = await mount();

    let result;
    await act(async () => { result = await view.result.current.verifyByCode('EMP0005'); });

    expect(result).toBeNull();
    expect(view.result.current.verifyError).toBe('Employee is not an eligible salesperson.');
    expect(view.result.current.verifiedSalesperson).toBeNull();
    expect(view.result.current.salespersonPayload.salespersonEmployeeId).toBeNull();
  });

  it('surfaces the server reason for an inactive employee', async () => {
    lookupSalespersonByCode.mockRejectedValue({
      response: { status: 400, data: { message: 'Selected salesperson must be an active employee.' } },
    });
    const view = await mount();
    await act(async () => { await view.result.current.verifyByCode('EMP0009'); });
    expect(view.result.current.verifyError).toBe('Selected salesperson must be an active employee.');
  });

  it('rejects an empty code without calling the server', async () => {
    const view = await mount();
    let result;
    await act(async () => { result = await view.result.current.verifyByCode('   '); });
    expect(result).toBeNull();
    expect(lookupSalespersonByCode).not.toHaveBeenCalled();
    expect(view.result.current.verifyError).toBe('Scan or enter an employee barcode.');
  });

  it('replaces the verified salesperson on a second scan', async () => {
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const view = await mount(true);
    await act(async () => { await view.result.current.verifyByCode('EMP9664'); });

    lookupSalespersonByCode.mockResolvedValue({ ...VERIFIED, id: 9, employeeCode: 'EMP0009', name: 'Sales Two' });
    await act(async () => { await view.result.current.verifyByCode('EMP0009'); });

    expect(view.result.current.verifiedSalesperson).toMatchObject({ id: 9 });
    expect(view.result.current.salespersonPayload.salespersonEmployeeCode).toBe('EMP0009');
  });

  it('clearVerifiedSalesperson drops the verification (the Scan New path)', async () => {
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const view = await mount();
    await act(async () => { await view.result.current.verifyByCode('EMP9664'); });
    act(() => view.result.current.clearVerifiedSalesperson());

    expect(view.result.current.verifiedSalesperson).toBeNull();
    expect(view.result.current.salespersonVerified).toBe(false);
  });

  it('resets the verification after a completed sale — it never carries over', async () => {
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const view = await mount();
    await act(async () => { await view.result.current.verifyByCode('EMP9664'); });
    expect(view.result.current.salespersonVerified).toBe(true);

    act(() => view.result.current.resetSalesperson());

    // The next customer may be served by someone else; an inherited verification would be an
    // un-scanned attribution.
    expect(view.result.current.verifiedSalesperson).toBeNull();
    expect(view.result.current.salespersonVerified).toBe(false);
  });

  // ── readiness ──────────────────────────────────────────────────────────

  it('does not fetch readiness when target enforcement is off', async () => {
    await mount();
    await waitFor(() => expect(getSalesSettings).toHaveBeenCalled());
    expect(getTargetReadiness).not.toHaveBeenCalled();
  });

  it('fetches readiness when target enforcement is on and reports not-ready', async () => {
    getSalesSettings.mockResolvedValue(settings({ monthlyTargetRequired: true }));
    getTargetReadiness.mockResolvedValue({
      required: true, ready: false, month: '2026-09-01',
      missing: [{ employeeId: 3, employeeCode: 'EMP-003', employeeName: 'Sales B', role: 'Salesperson', missingTarget: true, missingCommission: false }],
    });
    const view = await mount();

    await waitFor(() => expect(view.result.current.targetReady).toBe(false));
    expect(view.result.current.readiness.missing).toHaveLength(1);
  });

  it('a failed readiness read does not block the UI — the server still gates', async () => {
    getSalesSettings.mockResolvedValue(settings({ monthlyTargetRequired: true }));
    getTargetReadiness.mockRejectedValue(new Error('offline'));
    const view = await mount();

    await waitFor(() => expect(getTargetReadiness).toHaveBeenCalled());
    expect(view.result.current.targetReady).toBe(true);
  });

  it('a failed settings read leaves both switches off and the POS pre-Phase-2', async () => {
    getSalesSettings.mockRejectedValue(new Error('offline'));
    const view = await mount();
    expect(view.result.current.salespersonRequired).toBe(false);
    expect(view.result.current.targetRequired).toBe(false);
  });

  // ── modal plumbing ─────────────────────────────────────────────────────

  it('owns the scan-modal open state', async () => {
    const view = await mount();
    expect(view.result.current.scanModalOpen).toBe(false);
    act(() => view.result.current.openScanModal());
    expect(view.result.current.scanModalOpen).toBe(true);
    act(() => view.result.current.closeScanModal());
    expect(view.result.current.scanModalOpen).toBe(false);
  });

  it('shows the server refusal payload in the readiness warning', async () => {
    const view = await mount();
    const refusal = { required: true, ready: false, month: '2026-09-01', missing: [{ employeeId: 3 }] };
    act(() => view.result.current.openReadinessWarning(refusal));

    expect(view.result.current.showReadinessWarning).toBe(true);
    expect(view.result.current.readinessBlock).toEqual(refusal);
  });
});
