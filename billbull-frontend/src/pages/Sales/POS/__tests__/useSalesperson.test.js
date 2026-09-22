import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/employeeApi', () => ({ getSalespersons: vi.fn() }));

import { getSalespersons } from '../../../../api/employeeApi';
import useSalesperson from '../features/sales/useSalesperson';

const OPTIONS = [
  { id: 1, employeeCode: 'EMP-001', name: 'Cashier One' },
  { id: 2, employeeCode: 'EMP-002', name: 'Manager One' },
];

describe('useSalesperson', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('preselects the caller\'s own linked employee when the backend supplies one', async () => {
    getSalespersons.mockResolvedValue({ options: OPTIONS, defaultEmployeeId: 2 });

    const { result } = renderHook(() => useSalesperson());

    await waitFor(() => expect(result.current.salespersonEmployeeId).toBe(2));
    expect(result.current.selectedSalesperson.name).toBe('Manager One');
    expect(result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: 2,
      salespersonEmployeeCode: 'EMP-002',
    });
  });

  it('starts Unassigned when the user has no linked employee — it never guesses', async () => {
    getSalespersons.mockResolvedValue({ options: OPTIONS, defaultEmployeeId: null });

    const { result } = renderHook(() => useSalesperson());

    await waitFor(() => expect(result.current.salespersonLoading).toBe(false));
    expect(result.current.salespersonEmployeeId).toBeNull();
    expect(result.current.salespersonPayload).toEqual({
      salespersonEmployeeId: null,
      salespersonEmployeeCode: null,
    });
  });

  it('ignores a default that is not in the roster', async () => {
    getSalespersons.mockResolvedValue({ options: OPTIONS, defaultEmployeeId: 999 });

    const { result } = renderHook(() => useSalesperson());

    await waitFor(() => expect(result.current.salespersonLoading).toBe(false));
    expect(result.current.salespersonEmployeeId).toBeNull();
  });

  it('lets the cashier change the salesperson away from the default', async () => {
    getSalespersons.mockResolvedValue({ options: OPTIONS, defaultEmployeeId: 1 });

    const { result } = renderHook(() => useSalesperson());
    await waitFor(() => expect(result.current.salespersonEmployeeId).toBe(1));

    act(() => { result.current.setSalespersonEmployeeId(2); });

    // Cashier 1 logged in, sale attributed to Manager One.
    expect(result.current.salespersonPayload.salespersonEmployeeId).toBe(2);
    expect(result.current.salespersonPayload.salespersonEmployeeCode).toBe('EMP-002');
  });

  it('lets the cashier clear the attribution back to Unassigned', async () => {
    getSalespersons.mockResolvedValue({ options: OPTIONS, defaultEmployeeId: 1 });

    const { result } = renderHook(() => useSalesperson());
    await waitFor(() => expect(result.current.salespersonEmployeeId).toBe(1));

    act(() => { result.current.setSalespersonEmployeeId(null); });

    expect(result.current.salespersonPayload.salespersonEmployeeId).toBeNull();
  });

  it('returns to the session default after a completed sale', async () => {
    getSalespersons.mockResolvedValue({ options: OPTIONS, defaultEmployeeId: 1 });

    const { result } = renderHook(() => useSalesperson());
    await waitFor(() => expect(result.current.salespersonEmployeeId).toBe(1));

    act(() => { result.current.setSalespersonEmployeeId(2); });
    act(() => { result.current.resetSalesperson(); });

    expect(result.current.salespersonEmployeeId).toBe(1);
  });

  it('resets to Unassigned after a sale when there is no default', async () => {
    getSalespersons.mockResolvedValue({ options: OPTIONS, defaultEmployeeId: null });

    const { result } = renderHook(() => useSalesperson());
    await waitFor(() => expect(result.current.salespersonLoading).toBe(false));

    act(() => { result.current.setSalespersonEmployeeId(2); });
    act(() => { result.current.resetSalesperson(); });

    expect(result.current.salespersonEmployeeId).toBeNull();
  });

  it('degrades to Unassigned without throwing when the roster cannot be loaded', async () => {
    // Attribution is optional — a failed lookup must never block selling.
    getSalespersons.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useSalesperson());

    await waitFor(() => expect(result.current.salespersonLoading).toBe(false));
    expect(result.current.salespersonOptions).toEqual([]);
    expect(result.current.salespersonError).toBe('Could not load salespersons');
    expect(result.current.salespersonPayload.salespersonEmployeeId).toBeNull();
  });

  it('tolerates a malformed response shape', async () => {
    getSalespersons.mockResolvedValue({});

    const { result } = renderHook(() => useSalesperson());

    await waitFor(() => expect(result.current.salespersonLoading).toBe(false));
    expect(result.current.salespersonOptions).toEqual([]);
    expect(result.current.salespersonEmployeeId).toBeNull();
  });

  it('loads the roster exactly once per POS mount', async () => {
    getSalespersons.mockResolvedValue({ options: OPTIONS, defaultEmployeeId: 1 });

    const { result, rerender } = renderHook(() => useSalesperson());
    await waitFor(() => expect(result.current.salespersonEmployeeId).toBe(1));
    rerender();

    expect(getSalespersons).toHaveBeenCalledTimes(1);
  });
});
