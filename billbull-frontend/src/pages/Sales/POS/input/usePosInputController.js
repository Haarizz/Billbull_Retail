import { useEffect, useLayoutEffect, useState } from 'react';

import { isEditableTarget } from '../../../../utils/editableTarget';
import {
  createBurstTracker,
  isPosScreenBlocked,
  markPosInputHandled,
  markScanHandled,
  SCANNER_BURST_GAP_MS,
} from '../device/scanner/scanGuard';
import { isPosInputV2Enabled } from './posInputFlag';
import { createPosInputRegistry } from './posInputRegistry';
import { acceptsPaymentHotkeys, acceptsScanner, resolvePosScope } from './posScope';

/**
 * How long a payment hotkey waits before it acts. Longer than the scanner inter-key gap, so if
 * the letter was the first character of a barcode ("D1234…") the next character arrives first
 * and cancels it. A person does not notice 50 ms; a scanner always beats it.
 */
export const HOTKEY_SETTLE_MS = SCANNER_BURST_GAP_MS + 15;
/** Idle time after which a partial wedge buffer is dropped (the P0 wedge value). */
export const WEDGE_IDLE_RESET_MS = 250;

const swallow = (event) => {
  event.preventDefault();
  event.stopPropagation();
  markPosInputHandled(event);
};

/**
 * The single POS keyboard pipeline. Every keydown is handled in this order:
 *
 *  1. modifier chords (Ctrl/Cmd/Alt) are never POS keys — the app-wide Ctrl/Cmd+X search and
 *     browser shortcuts pass through untouched;
 *  2. the keystroke is classified (scanner-speed burst or not) before anything acts on it;
 *  3. the scope is resolved from the registry;
 *  4. Escape goes to the top overlay if, and only if, that overlay owns Escape;
 *  5. in a payment-panel scope the C/D/O/R/B hotkeys go to exactly one panel, and a scanner
 *     burst is swallowed instead of reaching them;
 *  6. in SALE scope the template's scan surface gets the key (wedge buffer or redirect);
 *  7. anywhere else the controller does nothing and the focused element handles the key.
 */
export function createPosKeyHandler({
  registry,
  now = () => Date.now(),
  isDomBlocked = isPosScreenBlocked,
  setTimer = (fn, ms) => window.setTimeout(fn, ms),
  clearTimer = (id) => window.clearTimeout(id),
}) {
  const burst = createBurstTracker(now);
  let wedgeBuffer = '';
  let wedgeTimer = null;
  let pending = null; // { timer, at, fire } — a payment hotkey inside its settle window

  const resetWedge = () => {
    wedgeBuffer = '';
    if (wedgeTimer) {
      clearTimer(wedgeTimer);
      wedgeTimer = null;
    }
  };
  const scheduleWedgeReset = () => {
    if (wedgeTimer) clearTimer(wedgeTimer);
    wedgeTimer = setTimer(() => {
      wedgeBuffer = '';
      wedgeTimer = null;
    }, WEDGE_IDLE_RESET_MS);
  };

  const cancelPending = () => {
    if (!pending) return;
    clearTimer(pending.timer);
    pending = null;
  };
  /** A hotkey still in its settle window acts now, ahead of the key that just arrived. */
  const flushPending = () => {
    if (!pending) return;
    const { fire } = pending;
    cancelPending();
    fire();
  };

  const surface = () => registry.newest('surface', (s) => s.enabled !== false);
  const resolve = () => resolvePosScope({
    overlays: registry.list('overlay'),
    itemEntryActive: Boolean(surface()?.itemEntryActive),
    isDomBlocked,
  });
  const paymentTarget = (ownerId) => registry.newest('payment', (p) => p.owner === ownerId);

  const handleEscape = (state, event) => {
    const top = state.overlay;
    if (!top || typeof top.onEscape !== 'function') return;
    markPosInputHandled(event);
    top.onEscape(event);
  };

  const handlePaymentKeys = (state, event, { printable, follows, scanEnter }) => {
    // A field inside the payment screen (customer search, remarks) owns its own typing.
    if (isEditableTarget(event.target)) {
      cancelPending();
      return;
    }
    if (pending && (follows || (event.key === 'Enter' && scanEnter))) {
      // The hotkey letter was the first character of a scanner burst.
      cancelPending();
      swallow(event);
      return;
    }
    flushPending();
    if ((printable && follows) || (event.key === 'Enter' && scanEnter)) {
      // Mid-burst characters and the burst's Enter: never a hotkey, never a click on the
      // focused method button.
      swallow(event);
      return;
    }
    if (!printable) return;

    const target = paymentTarget(state.overlay?.id);
    if (!target || target.enabled === false) return;
    const method = (target.methods || []).find((m) => m.hotkey === event.key.toLowerCase());
    if (!method) return;

    swallow(event);
    const ownerId = state.overlay?.id;
    const fire = () => {
      // Act only if the same panel still owns the keys: the screen may have changed meanwhile.
      const current = resolve();
      if (current.overlay?.id !== ownerId) return;
      const live = paymentTarget(ownerId);
      if (live !== target || live.enabled === false) return;
      live.onSelect?.(method.type);
    };
    pending = { at: now(), fire, timer: setTimer(() => { pending = null; fire(); }, HOTKEY_SETTLE_MS) };
  };

  const handleWedge = (scan, event, printable) => {
    const input = scan.inputRef?.current || null;
    // The barcode box handles its own Enter, so it is the one scan path while it has focus.
    if (input && event.target === input) {
      resetWedge();
      return;
    }
    if (isEditableTarget(event.target)) return;

    if (event.key === 'Enter') {
      const value = wedgeBuffer.trim();
      if (!value) return;
      event.preventDefault();
      markScanHandled(event);
      markPosInputHandled(event);
      resetWedge();
      scan.setBarcodeInput?.(value);
      scan.onScan?.(value);
      return;
    }
    if (!printable) return;
    wedgeBuffer += event.key;
    scheduleWedgeReset();
  };

  const handleRedirect = (scan, event, printable) => {
    const input = scan.inputRef?.current || null;
    if (!input || typeof document === 'undefined' || document.activeElement === input) return;
    if (isEditableTarget(document.activeElement)) return;
    if (!printable) return;

    input.focus();
    // Deliver the keystroke that caused the focus, or the first character of every scan is
    // lost. The native setter is required for a React controlled input.
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) return;
    setValue.call(input, `${input.value}${event.key}`);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    event.preventDefault();
    markPosInputHandled(event);
  };

  const onKeyDown = (event) => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const { key } = event;
    if (typeof key !== 'string') return;

    // Classify before acting: does this key continue a scanner-speed run?
    const printable = key.length === 1;
    const follows = printable && burst.follows();
    const scanEnter = key === 'Enter' && burst.isScanEnter();
    if (printable) burst.key();
    else if (key === 'Enter') burst.reset();

    const state = resolve();

    if (key === 'Escape') {
      cancelPending();
      handleEscape(state, event);
      return;
    }

    if (!acceptsScanner(state.scope) || state.scanBlocked) resetWedge();

    if (acceptsPaymentHotkeys(state.scope)) {
      handlePaymentKeys(state, event, { printable, follows, scanEnter });
      return;
    }
    cancelPending();

    if (!acceptsScanner(state.scope) || state.scanBlocked) return;
    const scan = surface();
    if (!scan) return;
    if (scan.kind === 'wedge') handleWedge(scan, event, printable);
    else if (scan.kind === 'redirect') handleRedirect(scan, event, printable);
  };

  const dispose = () => {
    resetWedge();
    cancelPending();
  };

  return { onKeyDown, dispose };
}

/**
 * usePosInputController — owns POS keyboard processing for one POSSales instance.
 *
 * Creates the input registry (handed to PosOverlayProvider), keeps the POSSales-owned overlays
 * in it current, and — when posInputV2 is on — attaches the ONE capture-phase window keydown
 * listener the POS uses. With posInputV2 off nothing is attached and the registry reports v2
 * false, so every legacy listener stays live instead.
 *
 * @param overlays  { [POS_OVERLAY_IDS.*]: boolean } — which flag-driven overlays are open
 * @returns the registry
 */
export function usePosInputController({ overlays = {}, enabled = null } = {}) {
  const [registry] = useState(() => createPosInputRegistry({
    v2: enabled == null ? isPosInputV2Enabled() : Boolean(enabled),
  }));

  useLayoutEffect(() => {
    registry.syncDeclared(overlays);
  });

  useEffect(() => {
    if (!registry.v2 || typeof window === 'undefined') return undefined;
    const handler = createPosKeyHandler({ registry });
    window.addEventListener('keydown', handler.onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handler.onKeyDown, true);
      handler.dispose();
    };
  }, [registry]);

  return registry;
}

export default usePosInputController;
