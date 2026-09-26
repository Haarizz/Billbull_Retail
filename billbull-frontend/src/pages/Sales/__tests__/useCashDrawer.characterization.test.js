import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CASH_DRAWER_EVENT, useCashDrawer } from '../POS/device/cashDrawer/useCashDrawer';

/**
 * CHARACTERIZATION — cash drawer control.
 *
 * This was a pair of useCallbacks inside POSSales.jsx and therefore unreachable from any
 * test. The Phase 3 decomposition moved it verbatim into a device hook, so the trigger
 * vocabulary can now be asserted. No hardware is involved: the hook only dispatches a
 * window CustomEvent that a bridge/agent listens for.
 */

const settings = (cashDrawerTriggers) => ({ cashDrawerTriggers });
const drawer = (posSettings) => renderHook(() => useCashDrawer(posSettings)).result.current;

let fired;
const capture = (e) => fired.push(e.detail);

beforeEach(() => { fired = []; window.addEventListener(CASH_DRAWER_EVENT, capture); });
afterEach(() => { window.removeEventListener(CASH_DRAWER_EVENT, capture); vi.restoreAllMocks(); });

describe('isDrawerTriggerEnabled', () => {
  it('reads the comma-separated backend trigger vocabulary', () => {
    const { isDrawerTriggerEnabled } = drawer(settings('CASH_PAYMENT,CHANGE_RETURN'));
    expect(isDrawerTriggerEnabled('CASH_PAYMENT')).toBe(true);
    expect(isDrawerTriggerEnabled('CHANGE_RETURN')).toBe(true);
    expect(isDrawerTriggerEnabled('CASH_DROP')).toBe(false);
  });

  it('trims whitespace around each configured trigger', () => {
    const { isDrawerTriggerEnabled } = drawer(settings(' CASH_PAYMENT , RECEIPT_PRINT '));
    expect(isDrawerTriggerEnabled('CASH_PAYMENT')).toBe(true);
    expect(isDrawerTriggerEnabled('RECEIPT_PRINT')).toBe(true);
  });

  it('treats absent settings as nothing enabled', () => {
    expect(drawer(null).isDrawerTriggerEnabled('CASH_PAYMENT')).toBe(false);
    expect(drawer(undefined).isDrawerTriggerEnabled('CASH_PAYMENT')).toBe(false);
    expect(drawer(settings(null)).isDrawerTriggerEnabled('CASH_PAYMENT')).toBe(false);
    expect(drawer({}).isDrawerTriggerEnabled('CASH_PAYMENT')).toBe(false);
  });

  it('CHARACTERIZED QUIRK: an empty trigger string enables the empty trigger name', () => {
    // ''.split(',') is [''], so isDrawerTriggerEnabled('') is true while every real
    // trigger is false. Harmless in practice — no caller passes '' — but it means
    // "nothing configured" and "empty string configured" are not the same state.
    const { isDrawerTriggerEnabled } = drawer(settings(''));
    expect(isDrawerTriggerEnabled('')).toBe(true);
    expect(isDrawerTriggerEnabled('CASH_PAYMENT')).toBe(false);
  });

  it('matches exactly, never by prefix', () => {
    const { isDrawerTriggerEnabled } = drawer(settings('CASH_PAYMENT'));
    expect(isDrawerTriggerEnabled('CASH')).toBe(false);
    expect(isDrawerTriggerEnabled('CASH_PAYMENT_EXTRA')).toBe(false);
  });
});

describe('openCashDrawer', () => {
  it('dispatches the kick event for an enabled trigger', () => {
    drawer(settings('CASH_PAYMENT')).openCashDrawer('CASH_PAYMENT');
    expect(fired).toEqual([{ trigger: 'CASH_PAYMENT' }]);
  });

  it('stays silent for a trigger that is not enabled', () => {
    drawer(settings('CASH_PAYMENT')).openCashDrawer('CASH_DROP');
    expect(fired).toEqual([]);
  });

  it('always allows MANUAL_OPEN, whatever the configuration says', () => {
    drawer(settings('')).openCashDrawer('MANUAL_OPEN');
    drawer(null).openCashDrawer('MANUAL_OPEN');
    expect(fired).toEqual([{ trigger: 'MANUAL_OPEN' }, { trigger: 'MANUAL_OPEN' }]);
  });

  it('carries the trigger name in the event detail', () => {
    const all = 'CASH_PAYMENT,RECEIPT_PRINT,CHANGE_RETURN,CASH_SETTLEMENT,CASH_DROP,CASH_OUT';
    const { openCashDrawer } = drawer(settings(all));
    all.split(',').forEach(openCashDrawer);
    expect(fired.map((d) => d.trigger)).toEqual(all.split(','));
  });

  it('fires once per call, never coalescing repeats', () => {
    const { openCashDrawer } = drawer(settings('CASH_PAYMENT'));
    openCashDrawer('CASH_PAYMENT');
    openCashDrawer('CASH_PAYMENT');
    expect(fired).toHaveLength(2);
  });
});
