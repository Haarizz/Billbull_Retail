import { describe, expect, it, vi } from 'vitest';

import { createMultiTap } from '../posMultiTap';
import {
  CHECKOUT_QUICK_CASH, ENTER_TAP_INTENT, checkoutQuickCashRequest, resolveShortcutLine,
} from '../posShortcuts';

/** A clock and timer queue the test drives by hand. */
const fakeTimers = () => {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { id += 1; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer: (t) => { timers.delete(t); },
    advance: (ms) => {
      now += ms;
      for (const [t, { fn, at }] of [...timers]) {
        if (at <= now) { timers.delete(t); fn(); }
      }
    },
    pending: () => timers.size,
  };
};

const makeTap = (opts = {}) => {
  const clock = fakeTimers();
  const onResolve = vi.fn();
  const tap = createMultiTap({ thresholdMs: 300, onResolve, setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...opts });
  return { tap, clock, onResolve };
};

describe('createMultiTap', () => {
  it('a single tap resolves as 1, only after the threshold', () => {
    const { tap, clock, onResolve } = makeTap();
    tap.tap();
    clock.advance(299);
    expect(onResolve).not.toHaveBeenCalled();
    expect(tap.pending()).toBe(true);
    clock.advance(1);
    expect(onResolve.mock.calls).toEqual([[1]]);
    expect(tap.pending()).toBe(false);
  });

  it('two taps inside the threshold resolve once, as 2 — never as 1 first', () => {
    const { tap, clock, onResolve } = makeTap();
    tap.tap();
    clock.advance(200);
    tap.tap();
    clock.advance(299);
    expect(onResolve).not.toHaveBeenCalled();
    clock.advance(1);
    expect(onResolve.mock.calls).toEqual([[2]]);
  });

  it('the third tap resolves at once, as 3, with nothing pending after it', () => {
    const { tap, clock, onResolve } = makeTap();
    tap.tap();
    clock.advance(100);
    tap.tap();
    clock.advance(100);
    tap.tap();
    expect(onResolve.mock.calls).toEqual([[3]]);
    expect(clock.pending()).toBe(0);
    clock.advance(1000);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('taps further apart than the threshold are separate sequences', () => {
    const { tap, clock, onResolve } = makeTap();
    tap.tap();
    clock.advance(301);
    tap.tap();
    clock.advance(301);
    expect(onResolve.mock.calls).toEqual([[1], [1]]);
  });

  it('cancel drops the sequence without reporting it, and leaves no timer behind', () => {
    const { tap, clock, onResolve } = makeTap();
    tap.tap();
    tap.tap();
    tap.cancel();
    expect(clock.pending()).toBe(0);
    clock.advance(1000);
    expect(onResolve).not.toHaveBeenCalled();
    tap.tap();
    clock.advance(300);
    expect(onResolve.mock.calls).toEqual([[1]]);
  });

  it('the threshold is configurable', () => {
    const { tap, clock, onResolve } = makeTap({ thresholdMs: 500 });
    tap.tap();
    clock.advance(450);
    tap.tap();
    clock.advance(500);
    expect(onResolve.mock.calls).toEqual([[2]]);
  });
});

describe('Enter tap intents', () => {
  it('maps 1/2/3 taps to plain checkout, Cash modal, exact Cash allocation', () => {
    expect(ENTER_TAP_INTENT[1]).toBeNull();
    expect(ENTER_TAP_INTENT[2]).toBe(CHECKOUT_QUICK_CASH.MODAL);
    expect(ENTER_TAP_INTENT[3]).toBe(CHECKOUT_QUICK_CASH.ALLOCATE);
  });

  it('checkoutQuickCashRequest accepts only a known mode; a click event or nothing is a plain checkout', () => {
    expect(checkoutQuickCashRequest({ quickCash: 'modal' }, 4)).toEqual({ mode: 'modal', seq: 4 });
    expect(checkoutQuickCashRequest({ quickCash: 'allocate' }, 5)).toEqual({ mode: 'allocate', seq: 5 });
    expect(checkoutQuickCashRequest(undefined, 1)).toBeNull();
    expect(checkoutQuickCashRequest({ type: 'click', target: {} }, 1)).toBeNull();
    expect(checkoutQuickCashRequest({ quickCash: 'settle' }, 1)).toBeNull();
  });
});

describe('resolveShortcutLine', () => {
  const items = [
    { id: 'b', quantity: 1 }, // newest line on top
    { id: 'a', quantity: 3 },
    { id: 'v', quantity: 1, isVoided: true },
  ];

  it('prefers the selected line', () => {
    expect(resolveShortcutLine({ items, selectedId: 'a', lastEnteredId: 'b' }).id).toBe('a');
  });

  it('falls back to the last entered line, wherever it sits — not items[0]', () => {
    expect(resolveShortcutLine({ items, lastEnteredId: 'a' }).id).toBe('a');
  });

  it('skips a voided or vanished line, and returns null with no target', () => {
    expect(resolveShortcutLine({ items, selectedId: 'v', lastEnteredId: 'a' }).id).toBe('a');
    expect(resolveShortcutLine({ items, selectedId: 'gone', lastEnteredId: 'v' })).toBeNull();
    expect(resolveShortcutLine({ items })).toBeNull();
    expect(resolveShortcutLine({ items: [], lastEnteredId: 'a' })).toBeNull();
  });
});
