import { useEffect, useLayoutEffect, useState } from 'react';

import { isEditableTarget, isFieldTarget } from '../../../../utils/editableTarget';
import {
  createBurstTracker,
  isPosScreenBlocked,
  markPosInputHandled,
  markScanHandled,
  SCANNER_BURST_GAP_MS,
} from '../device/scanner/scanGuard';
import { isPosFocusV2Enabled, isPosInputV2Enabled } from './posInputFlag';
import { createPosInputRegistry } from './posInputRegistry';
import { acceptsPaymentHotkeys, acceptsScanner, POS_SCOPES, resolvePosScope } from './posScope';
import { acceptsScannerInput } from './posScannerField';
import { usePosFocusController } from './usePosFocusController';

/**
 * How long a payment hotkey waits before it acts. Longer than the scanner inter-key gap, so if
 * the letter was the first character of a barcode ("D1234…") the next character arrives first
 * and cancels it. A person does not notice 50 ms; a scanner always beats it.
 */
export const HOTKEY_SETTLE_MS = SCANNER_BURST_GAP_MS + 15;
/** Idle time after which a partial wedge buffer is dropped (the P0 wedge value). */
export const WEDGE_IDLE_RESET_MS = 250;

/**
 * Puts a controlled field back to an earlier value. The native setter is required for React to
 * see the change; the event is the one React's onChange listens to for that element.
 */
const restoreFieldValue = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (!setter || el.value === value) return;
  setter.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
};

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
 *  5b. in PAYMENT scope (a payment modal) the amount keys wait the same settle window, so a
 *     person's key reaches the modal and a scanner burst, its Enter included, is dropped;
 *  5c. in either, a text field gets a scanner burst only if it opted in (posScannerField.js);
 *     a HUMAN_ONLY field keeps a person's typing and loses the burst, its Enter included;
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
  let pending = null; // { timer, at, fire } — a payment hotkey or amount key inside its settle window
  let droppedAt = 0; // when a scanner character was last dropped in PAYMENT scope
  // A HUMAN_ONLY field's value before the printable key just delivered to it. That key may turn
  // out to be the first character of a burst; if the next one follows at scanner speed, the
  // field is put back to this value. Lives for exactly one keystroke.
  let fieldSnapshot = null; // { el, value }

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

  /** An Enter that ends a burst: scanner-timed itself, or right behind dropped characters. */
  const isBurstEnter = (key, scanEnter) => key === 'Enter'
    && (scanEnter || (droppedAt > 0 && now() - droppedAt <= SCANNER_BURST_GAP_MS * 3));

  /**
   * Field-level scanner ownership (posScannerField.js) for a text field in a payment scope.
   * A SCANNER_ALLOWED field types everything itself, scan and Enter included. A HUMAN_ONLY
   * field gets a person's keys untouched; a scanner burst is dropped, its Enter too, and the
   * one character that reached the field before the burst was recognisable is taken back out.
   */
  const guardField = (event, { printable, follows, scanEnter }, snapshot) => {
    const el = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
    if (acceptsScannerInput(el)) return;
    const { key } = event;
    if ((printable && follows) || isBurstEnter(key, scanEnter)) {
      if (snapshot && snapshot.el === el) restoreFieldValue(el, snapshot.value);
      droppedAt = key === 'Enter' ? 0 : now();
      swallow(event);
      return;
    }
    droppedAt = 0;
    if (printable && typeof el?.value === 'string') fieldSnapshot = { el, value: el.value };
  };

  const handleEscape = (state, event) => {
    const top = state.overlay;
    if (!top || typeof top.onEscape !== 'function') return;
    markPosInputHandled(event);
    top.onEscape(event);
  };

  const handlePaymentKeys = (state, event, { printable, follows, scanEnter }, snapshot) => {
    // A field inside the payment screen (remarks, layaway due date, delivery search) owns a
    // person's typing; a scanner burst reaches it only if the field opted in.
    if (isEditableTarget(event.target)) {
      cancelPending();
      if (isFieldTarget(event.target)) guardField(event, { printable, follows, scanEnter }, snapshot);
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

  /**
   * PAYMENT scope: a payment modal keys the amount itself (digits, '.', C to clear, Enter to
   * confirm), so a scanner burst landing on it would become the amount and its Enter would
   * confirm the payment. A printable key on the modal is therefore held for the settle window,
   * as a payment hotkey is: a person's key is then delivered to the modal (overlay.onKey); a
   * scanner's next character arrives first, and the whole burst, its Enter included, is dropped.
   * Enter, Backspace, Tab and Space from a person reach the modal untouched.
   */
  const handlePaymentModalKeys = (state, event, { printable, follows, scanEnter }, snapshot) => {
    // A field of the modal (voucher code, card approval/reference, credit amount received) owns
    // a person's typing and Enter. Only the voucher code opted in to scanner input.
    if (isFieldTarget(event.target)) {
      cancelPending();
      guardField(event, { printable, follows, scanEnter }, snapshot);
      return;
    }
    const { key } = event;
    // An Enter right behind dropped characters ends that burst, however short the burst was.
    if ((printable && follows) || isBurstEnter(key, scanEnter)) {
      // The held first character, this one and the burst's Enter are all scanner output.
      cancelPending();
      droppedAt = key === 'Enter' ? 0 : now();
      swallow(event);
      return;
    }
    droppedAt = 0;
    // A person's held key lands before the key that just arrived (Enter confirms what it typed).
    flushPending();
    if (!printable || key === ' ') return;

    const ownerId = state.overlay?.id;
    if (typeof state.overlay?.onKey !== 'function') return;
    swallow(event);
    const fire = () => {
      // Deliver only if the same modal is still on top: it may have closed meanwhile.
      const current = resolve();
      if (current.scope !== POS_SCOPES.PAYMENT || current.overlay?.id !== ownerId) return;
      current.overlay.onKey?.(key);
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
    const snapshot = fieldSnapshot;
    fieldSnapshot = null;

    if (key === 'Escape') {
      cancelPending();
      handleEscape(state, event);
      return;
    }

    if (!acceptsScanner(state.scope) || state.scanBlocked) resetWedge();

    if (state.scope === POS_SCOPES.PAYMENT) {
      handlePaymentModalKeys(state, event, { printable, follows, scanEnter }, snapshot);
      return;
    }
    if (acceptsPaymentHotkeys(state.scope)) {
      handlePaymentKeys(state, event, { printable, follows, scanEnter }, snapshot);
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
    droppedAt = 0;
    fieldSnapshot = null;
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
 * It also runs the P2 focus controller (usePosFocusController) on the same registry when
 * posFocusV2 is on as well.
 *
 * @param overlays      { [POS_OVERLAY_IDS.*]: boolean } — which flag-driven overlays are open
 * @param enabled       force posInputV2 on/off (tests); null reads the flag
 * @param focusEnabled  force posFocusV2 on/off (tests); null reads the flag
 * @returns the registry
 */
export function usePosInputController({ overlays = {}, enabled = null, focusEnabled = null } = {}) {
  const [registry] = useState(() => createPosInputRegistry({
    v2: enabled == null ? isPosInputV2Enabled() : Boolean(enabled),
    focusV2: focusEnabled == null ? isPosFocusV2Enabled() : Boolean(focusEnabled),
  }));

  useLayoutEffect(() => {
    registry.syncDeclared(overlays);
  });

  // P2: the state-driven focus controller reads the same registry (inert with posFocusV2 off).
  usePosFocusController(registry);

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
