import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * useSalesperson's ON/OFF contract.
 *
 * `SalesPerson → POS` is a single switch with two whole behaviours behind it, and this file pins
 * both ends. OFF must be INDISTINGUISHABLE from the POS before the feature existed — that is a
 * stronger claim than "the UI is hidden", and it is the one tenants who never enable the feature
 * depend on. ON must refuse to attribute anything that was not scanned.
 *
 * Sibling file: useSalespersonVerification.test.js covers the scan/replace/readiness paths.
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

const VERIFIED = {
  id: 7, employeeCode: 'EMP9664', name: 'Manager One',
  role: 'Salesperson', status: 'Active', targetAmount: '25000.00', commissionRate: '10.00',
};

const settings = (over = {}) => ({
  salespersonRequiredAtPos: false,
  salespersonRequiredAtBackOffice: false,
  monthlyTargetRequired: false,
  ...over,
});

const mount = async (required = false) => {
  const view = renderHook(() => useSalesperson());
  await waitFor(() => expect(view.result.current.salespersonRequired).toBe(required));
  return view;
};

describe('useSalesperson — the POS salesperson switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalesSettings.mockResolvedValue(settings());
    getTargetReadiness.mockResolvedValue({ required: false, ready: true, missing: [] });
    lookupSalespersonByCode.mockResolvedValue(VERIFIED);
  });

  // ── OFF ────────────────────────────────────────────────────────────────

  it('exposes no attribution and no way to make one while the feature is off', async () => {
    const view = await mount(false);

    expect(view.result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: null, salespersonEmployeeCode: null,
    });
    expect(view.result.current.effectiveSalesperson).toBeNull();
    // Nothing to satisfy: the sale is "verified" in the sense that it is free to proceed.
    expect(view.result.current.salespersonVerified).toBe(true);
  });

  it('never offers a roster to pick from, in either mode', async () => {
    // The manual picker is gone, so there is no employee-list endpoint to call. If this ever
    // fails, a dropdown has crept back in — which is a bypass, not a convenience.
    const off = await mount(false);
    expect(off.result.current.salespersonOptions).toBeUndefined();
    expect(off.result.current.setSalespersonEmployeeId).toBeUndefined();

    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const on = await mount(true);
    expect(on.result.current.salespersonOptions).toBeUndefined();
    expect(on.result.current.setSalespersonEmployeeId).toBeUndefined();
  });

  it('does not fetch target readiness while target enforcement is off', async () => {
    await mount(false);
    await waitFor(() => expect(getSalesSettings).toHaveBeenCalled());
    // A tenant that never turns this on pays nothing for it — not even one request.
    expect(getTargetReadiness).not.toHaveBeenCalled();
  });

  // ── ON ─────────────────────────────────────────────────────────────────

  it('requires a scan before it will attribute a sale', async () => {
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const view = await mount(true);

    expect(view.result.current.salespersonVerified).toBe(false);
    expect(view.result.current.salespersonPayload.salespersonEmployeeId).toBeNull();

    await act(async () => { await view.result.current.verifyByCode('EMP9664'); });

    expect(view.result.current.salespersonVerified).toBe(true);
    expect(view.result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: 7, salespersonEmployeeCode: 'EMP9664',
    });
  });

  it('starts every sale unverified — a verification is per-sale, never inherited', async () => {
    getSalesSettings.mockResolvedValue(settings({ salespersonRequiredAtPos: true }));
    const view = await mount(true);
    await act(async () => { await view.result.current.verifyByCode('EMP9664'); });

    act(() => view.result.current.resetSalesperson());

    // The next customer may be served by someone else, and there is no default to fall back to:
    // the next sale has to be scanned.
    expect(view.result.current.verifiedSalesperson).toBeNull();
    expect(view.result.current.salespersonVerified).toBe(false);
    expect(view.result.current.salespersonPayload.salespersonEmployeeId).toBeNull();
  });

  it('falls back to the off behaviour when the settings read fails', async () => {
    // Failing closed would strand every till on a transient blip; the server enforces the rule
    // independently, so failing open here cannot actually let an unattributed sale through.
    getSalesSettings.mockRejectedValue(new Error('offline'));
    const view = await mount(false);
    expect(view.result.current.targetRequired).toBe(false);
  });
});
