import fs from 'node:fs';
import path from 'node:path';
import { useCallback, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CHARACTERIZATION — the POS feedback toaster (`showFeedback`).
 *
 * showFeedback used to be redefined on every POSSales render and late-bound through
 * `showFeedbackRef` for the voucher handlers declared above it and for useProductEntry.
 * It only ever touched the `setBarcodeScanFeedback` setter and `setTimeout`, so it is now a
 * stable `useCallback(..., [])` declared right under that state and handed to every
 * consumer directly.
 *
 * POSSales.jsx is not rendered by this project's test setup, so the declaration is pulled
 * out of the real source and executed as-is inside a hook next to the same useState —
 * the behaviour assertions below run POSSales' own code, not a copy of it. The wiring is
 * asserted against the source, as usePosSession.characterization does.
 *
 * The timer quirk is characterized, not endorsed: every call schedules its own clear and
 * none is cancelled, so an earlier message's timer clears a later message early.
 */

// EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = read('../POSSales.jsx');
const PRODUCT_ENTRY = read('../POS/features/products/useProductEntry.js');

const DECL_START = 'const showFeedback = useCallback(';
const extractDeclaration = () => {
  const start = POS_SALES.indexOf(DECL_START);
  const end = POS_SALES.indexOf('}, []);', start);
  expect(start, 'showFeedback declaration').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return POS_SALES.slice(start, end + '}, []);'.length);
};

/** Runs POSSales' showFeedback declaration verbatim against a real barcodeScanFeedback state. */
const renderToaster = () => {
  const declare = new Function('useCallback', 'setBarcodeScanFeedback', `${extractDeclaration()}\nreturn showFeedback;`);
  return renderHook(() => {
    const [barcodeScanFeedback, setBarcodeScanFeedback] = useState(null);
    const showFeedback = declare(useCallback, setBarcodeScanFeedback);
    return { barcodeScanFeedback, showFeedback };
  });
};

describe('showFeedback behaviour (POSSales source, executed)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sets barcodeScanFeedback to exactly { type, message }', () => {
    const view = renderToaster();
    act(() => { view.result.current.showFeedback('error', 'No product found: X'); });
    expect(view.result.current.barcodeScanFeedback).toEqual({ type: 'error', message: 'No product found: X' });
  });

  it('passes arguments through untouched, including the swapped (message, type) call sites', () => {
    const view = renderToaster();
    act(() => { view.result.current.showFeedback('Selected existing customer!', 'success'); });
    expect(view.result.current.barcodeScanFeedback).toEqual({ type: 'Selected existing customer!', message: 'success' });
  });

  it('clears the message after exactly 2500ms', () => {
    const view = renderToaster();
    act(() => { view.result.current.showFeedback('success', 'Widget added'); });
    act(() => { vi.advanceTimersByTime(2499); });
    expect(view.result.current.barcodeScanFeedback).toEqual({ type: 'success', message: 'Widget added' });
    act(() => { vi.advanceTimersByTime(1); });
    expect(view.result.current.barcodeScanFeedback).toBeNull();
  });

  it('schedules one uncancelled clear per call (current behaviour: an earlier timer clears a later message early)', () => {
    const view = renderToaster();
    act(() => { view.result.current.showFeedback('error', 'first'); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { view.result.current.showFeedback('success', 'second'); });
    expect(vi.getTimerCount()).toBe(2);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(view.result.current.barcodeScanFeedback).toBeNull();
  });

  it('is the same function on every render', () => {
    const view = renderToaster();
    const first = view.result.current.showFeedback;
    act(() => { first('success', 'a'); });
    view.rerender();
    expect(view.result.current.showFeedback).toBe(first);
  });
});

describe('showFeedback wiring (POSSales source)', () => {
  const at = (needle, from = 0) => {
    const i = POS_SALES.indexOf(needle, from);
    expect(i, `missing: ${needle}`).toBeGreaterThan(-1);
    return i;
  };

  it('is a stable callback over only the setter and the 2.5s timeout', () => {
    expect(extractDeclaration()).toBe([
      'const showFeedback = useCallback((type, message) => {',
      '    setBarcodeScanFeedback({ type, message });',
      '    setTimeout(() => setBarcodeScanFeedback(null), 2500);',
      '  }, []);',
    ].join('\n'));
  });

  it('has one declaration, one feedback state and no late-binding ref', () => {
    expect(POS_SALES).not.toContain('showFeedbackRef');
    expect(POS_SALES.match(/const showFeedback\b/g)).toHaveLength(1);
    expect(POS_SALES.match(/const \[barcodeScanFeedback, setBarcodeScanFeedback\] = useState\(/g)).toHaveLength(1);
  });

  it('is declared under its state and above every caller, including useProductEntry', () => {
    const state = at('const [barcodeScanFeedback, setBarcodeScanFeedback] = useState(');
    const decl = at(DECL_START);
    expect(decl).toBeGreaterThan(state);
    const firstUse = POS_SALES.search(/showFeedback(\?\.)?\(/);
    expect(firstUse).toBeGreaterThan(decl);
    expect(at('applyScannedVoucher, showFeedback,\n  });')).toBeGreaterThan(decl);
  });

  it('the voucher re-cap effect and removeAppliedVoucher list it as a dependency', () => {
    expect(POS_SALES).toContain('}, [removeCheckoutLine, showFeedback]);');
    expect(POS_SALES).toContain('}, [checkoutEffectiveDue, removeCheckoutLine, updateCheckoutLine, showFeedback]);');
  });

  it('useProductEntry takes showFeedback directly and keeps no ref or wrapper of its own', () => {
    expect(PRODUCT_ENTRY).not.toContain('showFeedbackRef');
    expect(PRODUCT_ENTRY).not.toMatch(/const showFeedback\b/);
    expect(PRODUCT_ENTRY).toMatch(/\n {2}showFeedback,\n\}\) \{/);
  });
});
