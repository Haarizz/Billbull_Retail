import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/posApi', () => ({
  getPosSettings: vi.fn(),
  savePosSettings: vi.fn(),
}));

import { getPosSettings, savePosSettings } from '../../../api/posApi';
import { usePosBehaviourSettings } from '../POS/features/settings/usePosBehaviourSettings';

/**
 * CHARACTERIZATION — Console -> Behavior tab settings editor.
 *
 * This was two handlers plus three useState calls inside POSSales.jsx and therefore
 * unreachable from any test. The Phase 3 extraction moved them verbatim into a hook, so
 * the draft seeding, validation order, save payload and failure handling can now be
 * asserted. These tests describe the CURRENT behaviour.
 */

const setup = (posSettings = null) => {
  const setPosSettings = vi.fn();
  const refresh = vi.fn();
  const businessDayRefreshRef = { current: refresh };
  const view = renderHook(() => usePosBehaviourSettings({
    posSettings, setPosSettings, businessDayRefreshRef,
  }));
  return { view, setPosSettings, refresh, businessDayRefreshRef };
};

let alertSpy;
beforeEach(() => {
  vi.clearAllMocks();
  getPosSettings.mockResolvedValue(null);
  savePosSettings.mockResolvedValue({});
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('initial state', () => {
  it('starts with no draft and nothing in flight', () => {
    const { view } = setup();
    expect(view.result.current.settingsDraft).toBe(null);
    expect(view.result.current.settingsSaving).toBe(false);
    expect(view.result.current.settingsSavedFlash).toBe(false);
  });

  it('exposes the setters POSConsole reuses for its own template/layout saves', () => {
    const { view } = setup();
    ['setSettingsDraft', 'setSettingsSaving', 'setSettingsSavedFlash',
      'beginEditSettings', 'handleSaveSettings'].forEach((key) => {
      expect(typeof view.result.current[key]).toBe('function');
    });
  });
});

describe('beginEditSettings — draft seeding', () => {
  it('applies the documented defaults when nothing is stored', () => {
    const { view } = setup(null);
    act(() => view.result.current.beginEditSettings());

    expect(view.result.current.settingsDraft).toEqual({
      requireSupervisorForVoid: false,
      requireSupervisorForDayClose: false,
      supervisorApprovalMode: 'PIN',
      requirePriceOverrideApproval: false,
      supervisorPin: '',
      voidMode: 'VOID',
      productEntryMode: 'DIRECT_ADD',
      cartViewMode: 'MINIMAL',
      cartShowBarcode: true,
      cartShowProductCode: true,
      cartShowBatchNumber: true,
      cartShowSerialNumber: false,
      cartShowExpiryDate: false,
      cashDrawerTriggers: 'CASH_PAYMENT,CHANGE_RETURN,CASH_DROP,CASH_OUT,MANUAL_OPEN',
      operatingHoursEnabled: false,
      operatingStartTime: '',
      operatingEndTime: '',
      businessDayExtensionMinutes: 0,
    });
  });

  it('seeds from the stored settings when they exist', () => {
    const { view } = setup({
      requireSupervisorForVoid: true,
      supervisorApprovalMode: 'PASSWORD',
      voidMode: 'DELETE',
      productEntryMode: 'MODAL',
      cartViewMode: 'DETAILED',
      cartShowBarcode: false,
      cartShowSerialNumber: true,
      cashDrawerTriggers: 'MANUAL_OPEN',
      operatingHoursEnabled: true,
      operatingStartTime: '08:00',
      operatingEndTime: '22:00',
      businessDayExtensionMinutes: 30,
    });
    act(() => view.result.current.beginEditSettings());
    const d = view.result.current.settingsDraft;

    expect(d.requireSupervisorForVoid).toBe(true);
    expect(d.supervisorApprovalMode).toBe('PASSWORD');
    expect(d.voidMode).toBe('DELETE');
    expect(d.productEntryMode).toBe('MODAL');
    expect(d.cartViewMode).toBe('DETAILED');
    expect(d.cartShowBarcode).toBe(false);
    expect(d.cartShowSerialNumber).toBe(true);
    expect(d.cashDrawerTriggers).toBe('MANUAL_OPEN');
    expect(d.businessDayExtensionMinutes).toBe(30);
  });

  it('coerces the enum fields to their allowed values only', () => {
    const { view } = setup({
      supervisorApprovalMode: 'NONSENSE', voidMode: 'NONSENSE', cartViewMode: 'NONSENSE',
    });
    act(() => view.result.current.beginEditSettings());
    const d = view.result.current.settingsDraft;

    expect(d.supervisorApprovalMode).toBe('PIN');
    expect(d.voidMode).toBe('VOID');
    expect(d.cartViewMode).toBe('MINIMAL');
  });

  it('CHARACTERIZED BEHAVIOUR: productEntryMode is NOT enum-coerced', () => {
    // Unlike its three neighbours, this field passes through whatever was stored.
    const { view } = setup({ productEntryMode: 'ANYTHING' });
    act(() => view.result.current.beginEditSettings());
    expect(view.result.current.settingsDraft.productEntryMode).toBe('ANYTHING');
  });

  it('never seeds the supervisor PIN — it is write-only', () => {
    const { view } = setup({ supervisorPin: 'SHOULD-NOT-LEAK', supervisorPinSet: true });
    act(() => view.result.current.beginEditSettings());
    expect(view.result.current.settingsDraft.supervisorPin).toBe('');
  });

  it('CHARACTERIZED BEHAVIOUR: a stored 0 extension survives, null becomes 0', () => {
    const zero = setup({ businessDayExtensionMinutes: 0 });
    act(() => zero.view.result.current.beginEditSettings());
    expect(zero.view.result.current.settingsDraft.businessDayExtensionMinutes).toBe(0);

    const nulled = setup({ businessDayExtensionMinutes: null });
    act(() => nulled.view.result.current.beginEditSettings());
    expect(nulled.view.result.current.settingsDraft.businessDayExtensionMinutes).toBe(0);
  });

  it('re-fetches settings alongside opening the editor, merging the fresh copy', async () => {
    getPosSettings.mockResolvedValue({ businessDayScheduleLocked: true });
    const { view, setPosSettings } = setup({ voidMode: 'VOID' });

    act(() => view.result.current.beginEditSettings());
    expect(getPosSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(setPosSettings).toHaveBeenCalled());
    // Merged through mergeSavedPosSettings, not assigned directly.
    expect(typeof setPosSettings.mock.calls[0][0]).toBe('function');
  });

  it('does not merge when the refresh returns nothing', async () => {
    getPosSettings.mockResolvedValue(null);
    const { view, setPosSettings } = setup({});
    act(() => view.result.current.beginEditSettings());
    await waitFor(() => expect(getPosSettings).toHaveBeenCalled());
    expect(setPosSettings).not.toHaveBeenCalled();
  });

  it('still opens the editor when the refresh fails', async () => {
    getPosSettings.mockRejectedValue(new Error('offline'));
    const { view } = setup({});
    act(() => view.result.current.beginEditSettings());
    expect(view.result.current.settingsDraft).not.toBe(null);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
  });
});

describe('handleSaveSettings — validation', () => {
  it('does nothing at all when there is no draft', async () => {
    const { view } = setup({});
    await act(async () => { await view.result.current.handleSaveSettings(); });
    expect(savePosSettings).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('blocks an enabled business-day window with no start or end time', async () => {
    const { view } = setup({});
    act(() => view.result.current.beginEditSettings());
    act(() => view.result.current.setSettingsDraft((d) => ({ ...d, operatingHoursEnabled: true })));

    await act(async () => { await view.result.current.handleSaveSettings(); });

    expect(alertSpy).toHaveBeenCalledWith(
      'Business Day Start Time and End Time are required when the Business Day Window is enabled.');
    expect(savePosSettings).not.toHaveBeenCalled();
    // The draft is kept so the admin can correct it.
    expect(view.result.current.settingsDraft).not.toBe(null);
    expect(view.result.current.settingsSaving).toBe(false);
  });

  it('blocks a MANUAL voucher expiry with no date', async () => {
    const { view } = setup({});
    act(() => view.result.current.beginEditSettings());
    act(() => view.result.current.setSettingsDraft((d) => ({
      ...d, creditVoucherExpiryMode: 'MANUAL', creditVoucherExpiryDate: '',
    })));

    await act(async () => { await view.result.current.handleSaveSettings(); });

    expect(alertSpy).toHaveBeenCalledWith('Choose the date credit vouchers should expire on.');
    expect(savePosSettings).not.toHaveBeenCalled();
  });
});

describe('handleSaveSettings — successful save', () => {
  const saveWith = async (stored, patch) => {
    const ctx = setup(stored);
    act(() => ctx.view.result.current.beginEditSettings());
    if (patch) act(() => ctx.view.result.current.setSettingsDraft((d) => ({ ...d, ...patch })));
    await act(async () => { await ctx.view.result.current.handleSaveSettings(); });
    return ctx;
  };

  it('posts stored settings overlaid with the draft', async () => {
    await saveWith({ someStoredField: 'keep', voidMode: 'VOID' }, { voidMode: 'DELETE' });

    const payload = savePosSettings.mock.calls[0][0];
    expect(payload.someStoredField).toBe('keep');   // stored fields survive
    expect(payload.voidMode).toBe('DELETE');        // draft wins
  });

  it('normalises cleared number/date inputs from empty string to null', async () => {
    await saveWith({}, { creditVoucherExpiryMonths: '', creditVoucherExpiryDate: '' });

    const payload = savePosSettings.mock.calls[0][0];
    expect(payload.creditVoucherExpiryMonths).toBe(null);
    expect(payload.creditVoucherExpiryDate).toBe(null);
  });

  it('clears the draft, flashes saved and re-polls the business day', async () => {
    const ctx = await saveWith({}, null);

    expect(ctx.view.result.current.settingsDraft).toBe(null);
    expect(ctx.view.result.current.settingsSavedFlash).toBe(true);
    expect(ctx.view.result.current.settingsSaving).toBe(false);
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });

  it('merges the server response rather than assigning it', async () => {
    savePosSettings.mockResolvedValue({ voidMode: 'DELETE' });
    const ctx = await saveWith({}, null);
    expect(typeof ctx.setPosSettings.mock.calls.at(-1)[0]).toBe('function');
  });

  it('falls back to the sent payload when the server returns nothing', async () => {
    savePosSettings.mockResolvedValue(null);
    const ctx = await saveWith({}, null);
    expect(ctx.setPosSettings).toHaveBeenCalled();
    expect(ctx.view.result.current.settingsDraft).toBe(null);
  });

  it('survives a missing business-day refresh function', async () => {
    const ctx = setup({});
    ctx.businessDayRefreshRef.current = null;
    act(() => ctx.view.result.current.beginEditSettings());
    await act(async () => { await ctx.view.result.current.handleSaveSettings(); });
    expect(ctx.view.result.current.settingsDraft).toBe(null);
  });
});

describe('handleSaveSettings — failed save', () => {
  const failWith = async (error) => {
    savePosSettings.mockRejectedValue(error);
    const ctx = setup({});
    act(() => ctx.view.result.current.beginEditSettings());
    await act(async () => { await ctx.view.result.current.handleSaveSettings(); });
    return ctx;
  };

  it('surfaces the server message and drops the draft — never optimistic', async () => {
    const ctx = await failWith({ response: { data: { message: 'Sessions still open' } } });

    expect(alertSpy).toHaveBeenCalledWith('Sessions still open');
    expect(ctx.view.result.current.settingsDraft).toBe(null);
    expect(ctx.setPosSettings).not.toHaveBeenCalled();   // stored values stay authoritative
    expect(ctx.view.result.current.settingsSavedFlash).toBe(false);
    expect(ctx.refresh).not.toHaveBeenCalled();
  });

  it('falls back to the error field when there is no message', async () => {
    await failWith({ response: { data: { error: 'Conflict' } } });
    expect(alertSpy).toHaveBeenCalledWith('Conflict');
  });

  it('falls back to a generic message for a bare error', async () => {
    await failWith(new Error('network down'));
    expect(alertSpy).toHaveBeenCalledWith('Could not save POS settings. Please try again.');
  });

  it('always clears the saving flag', async () => {
    const ctx = await failWith(new Error('boom'));
    expect(ctx.view.result.current.settingsSaving).toBe(false);
  });
});
