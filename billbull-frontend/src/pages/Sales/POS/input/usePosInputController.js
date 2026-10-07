import { useEffect, useLayoutEffect, useState } from 'react';

import { isEditableTarget, isFieldTarget } from '../../../../utils/editableTarget';
import {
  createBurstTracker,
  isPosScreenBlocked,
  markPosInputHandled,
  markScanHandled,
  SCANNER_BURST_GAP_MS,
} from '../device/scanner/scanGuard';
import { PAYMENT_TYPES } from '../payments/paymentModel';
import { isPosFocusV2Enabled, isPosInputV2Enabled } from './posInputFlag';
import { createPosInputRegistry } from './posInputRegistry';
import { acceptsPaymentHotkeys, acceptsScanner, POS_SCOPES, resolvePosScope } from './posScope';
import { acceptsScannerInput } from './posScannerField';
import { findFocusElement, POS_FOCUS_TARGETS, requestFocusTarget } from './posFocus';
import { createMultiTap } from './posMultiTap';
import {
  BURST_TAIL_MS,
  CASH_DOUBLE_TAP_MS,
  ENTER_MULTI_TAP_MS,
  ENTER_TAP_INTENT,
  SALE_FUNCTION_KEYS,
  SALE_LINE_KEYS,
} from './posShortcuts';
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

const elementOf = (target) => (target?.nodeType === 3 ? target.parentElement : target) || null;

/** Controls whose own Enter/Space activation a shortcut must not take over. */
const CONTROL_SELECTOR = 'button, a[href], select, summary, [role="button"], [role="link"], '
  + '[role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"]';
const controlOf = (target) => {
  const el = elementOf(target);
  return typeof el?.closest === 'function' ? el.closest(CONTROL_SELECTOR) : null;
};

/**
 * The single POS keyboard pipeline. Every keydown is handled in this order:
 *
 *  1. modifier chords (Ctrl/Cmd/Alt) are never POS keys — the app-wide Ctrl/Cmd+X search and
 *     browser shortcuts pass through untouched. The one exception is Ctrl+Enter, which settles
 *     checkout (step 4b) and is left alone everywhere else;
 *  2. the keystroke is classified (scanner-speed burst or not) before anything acts on it;
 *  3. the scope is resolved from the registry;
 *  4. Escape goes to the top overlay if, and only if, that overlay owns Escape; in CHECKOUT it
 *     cancels checkout;
 *  4b. Ctrl+Enter in CHECKOUT settles, through the checkout's own guarded Settle;
 *  5. in a payment-panel scope the C/D/O/R/B hotkeys go to exactly one panel, and a scanner
 *     burst is swallowed instead of reaching them. Cash twice in checkout allocates the exact
 *     remaining amount;
 *  5b. in PAYMENT scope (a payment modal) the amount keys wait the same settle window, so a
 *     person's key reaches the modal and a scanner burst, its Enter included, is dropped;
 *  5c. in either, a text field gets a scanner burst only if it opted in (posScannerField.js);
 *     a HUMAN_ONLY field keeps a person's typing and loses the burst, its Enter included;
 *  5d. in COMPLETE a person's Enter starts the new sale; a scanner burst, its Enter included,
 *     is dropped;
 *  6. in SALE scope the keyboard shortcuts (posShortcuts.js) act first: Enter taps on an empty
 *     search, F2–F10, and +, − and Delete when no text is being edited. Everything else, and
 *     every scanner burst, goes to the template's scan surface (wedge buffer or redirect);
 *  7. anywhere else the controller does nothing and the focused element handles the key.
 */
export function createPosKeyHandler({
  registry,
  now = () => Date.now(),
  isDomBlocked = isPosScreenBlocked,
  setTimer = (fn, ms) => window.setTimeout(fn, ms),
  clearTimer = (id) => window.clearTimeout(id),
  enterTapMs = ENTER_MULTI_TAP_MS,
  cashTapMs = CASH_DOUBLE_TAP_MS,
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
  // Shortcut state (P3).
  let lastPrintableAt = 0; // a printable key, human or scanner
  let lastScanEnterAt = 0; // the Enter that ended a scanner burst
  let enterCooldownUntil = 0; // after an Enter sequence acted: stray Enters are not another one
  let heldSaleKey = null; // { key, target, timer } — a + or − inside its settle window
  let cashTap = null; // { at, owner, target } — the last Cash hotkey in checkout

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

  /** The newest registered shortcut action `name` for `scope` (and the overlay on top), or null. */
  const shortcutAction = (scope, ownerId, name) => {
    const record = registry.newest('shortcut', (s) => s.enabled !== false && s.scope === scope
      && (s.owner == null || s.owner === ownerId) && typeof s.actions?.[name] === 'function');
    return record ? record.actions[name] : null;
  };

  // ── SALE shortcuts ────────────────────────────────────────────────────────────────────────

  /**
   * Enter taps on an empty sale search. Resolved once per sequence (posMultiTap): one tap opens
   * checkout, two also open the Cash modal, three also allocate the exact amount in Cash. The
   * screen is re-read when the sequence resolves; anything but the sale on screen drops it.
   */
  const enterTaps = createMultiTap({
    thresholdMs: enterTapMs,
    maxTaps: 3,
    setTimer,
    clearTimer,
    onResolve: (taps) => {
      enterCooldownUntil = now() + enterTapMs;
      if (resolve().scope !== POS_SCOPES.SALE) return;
      shortcutAction(POS_SCOPES.SALE, null, 'checkout')?.(ENTER_TAP_INTENT[taps] ?? null);
    },
  });
  const inEnterCooldown = () => now() < enterCooldownUntil;

  const saleSearch = () => surface()?.inputRef?.current || null;
  /** The sale search has the caret and nothing typed in it. */
  const onEmptySaleSearch = (target) => {
    const input = saleSearch();
    return Boolean(input) && elementOf(target) === input && !String(input.value || '').trim();
  };
  /** No text is being edited: the empty sale search, or nothing that takes typing. */
  const editsNoText = (target) => onEmptySaleSearch(target) || !isEditableTarget(target);

  const cancelHeldSaleKey = () => {
    if (!heldSaleKey) return;
    clearTimer(heldSaleKey.timer);
    heldSaleKey = null;
  };
  /** The held + / − acts now: a person pressed it. */
  const fireHeldSaleKey = () => {
    const held = heldSaleKey;
    cancelHeldSaleKey();
    if (!held || resolve().scope !== POS_SCOPES.SALE) return;
    const spec = SALE_LINE_KEYS[held.key];
    shortcutAction(POS_SCOPES.SALE, null, spec.action)?.(spec.arg);
  };
  /**
   * The held + / − was the first character of a scanner burst: hand it to the scan path ahead
   * of the character that just arrived, which then continues there as usual.
   */
  const replayHeldSaleKey = () => {
    const held = heldSaleKey;
    cancelHeldSaleKey();
    if (!held) return;
    const scan = surface();
    const input = scan?.inputRef?.current || null;
    if (scan?.kind === 'wedge' && elementOf(held.target) !== input) {
      wedgeBuffer += held.key;
      scheduleWedgeReset();
      return;
    }
    // Written into the search box without moving focus: if the caret is elsewhere, the redirect
    // of the next character focuses the box and appends that character after this one.
    if (input) restoreFieldValue(input, `${input.value}${held.key}`);
  };

  /** Drops every SALE sequence in progress (the screen changed, or another key arrived). */
  const cancelSaleSequences = () => {
    enterTaps.cancel();
    cancelHeldSaleKey();
  };

  /** SALE scope shortcuts. Returns true when the key was a shortcut and is consumed. */
  const handleSaleKeys = (event, { printable, follows, scanEnter }) => {
    const { key, target } = event;

    if (heldSaleKey) {
      if (follows || (key === 'Enter' && scanEnter)) replayHeldSaleKey();
      else fireHeldSaleKey();
    }
    if (key !== 'Enter') enterTaps.cancel();

    if (key === 'Enter') {
      // A scanner's Enter, or an Enter right behind scanner characters, ends a scan: never a tap.
      if (scanEnter || now() - lastPrintableAt <= BURST_TAIL_MS || now() - lastScanEnterAt <= BURST_TAIL_MS) {
        enterTaps.cancel();
        return false;
      }
      if (wedgeBuffer) return false; // the wedge buffer's Enter scans it
      const tapTarget = onEmptySaleSearch(target) || (!isEditableTarget(target) && !controlOf(target));
      if (!tapTarget || !shortcutAction(POS_SCOPES.SALE, null, 'checkout')) return false;
      swallow(event);
      if (event.repeat || inEnterCooldown()) return true;
      enterTaps.tap();
      return true;
    }

    const fn = SALE_FUNCTION_KEYS[key];
    if (fn) {
      if (fn.action === 'search') {
        // F3 works in every template: the SEARCH target is the one place to go.
        swallow(event);
        if (event.repeat) return true;
        shortcutAction(POS_SCOPES.SALE, null, 'search')?.();
        requestFocusTarget(registry, POS_FOCUS_TARGETS.SEARCH);
        return true;
      }
      const action = shortcutAction(POS_SCOPES.SALE, null, fn.action);
      if (!action) return false;
      swallow(event);
      if (event.repeat) return true;
      action(fn.arg);
      // F2: a customer search already on screen takes the caret now; one that opens takes it
      // from the focus controller on the transition.
      if (fn.action === 'customer') requestFocusTarget(registry, POS_FOCUS_TARGETS.CUSTOMER);
      return true;
    }

    const line = SALE_LINE_KEYS[key];
    if (line) {
      if (follows || !editsNoText(target)) return false;
      if (!shortcutAction(POS_SCOPES.SALE, null, line.action)) return false;
      swallow(event);
      if (event.repeat) return true;
      if (!line.printable) {
        shortcutAction(POS_SCOPES.SALE, null, line.action)(line.arg);
        return true;
      }
      // Printable: wait out the settle window, as a payment hotkey does. A scanner's next
      // character beats it, and the key is handed back to the scan path instead.
      heldSaleKey = { key, target, timer: setTimer(fireHeldSaleKey, HOTKEY_SETTLE_MS) };
      return true;
    }
    return false;
  };

  // ── CHECKOUT / COMPLETE shortcuts ─────────────────────────────────────────────────────────

  /** A live payment panel record that can allocate the exact remaining amount in Cash. */
  const quickCashTarget = () => {
    if (!cashTap || now() - cashTap.at > cashTapMs) return null;
    const live = registry.newest('payment', (p) => p === cashTap.target);
    return live && typeof live.onQuickCash === 'function' ? live : null;
  };
  const runQuickCash = (target) => {
    cashTap = null;
    const fire = () => {
      // Only into the same checkout, still open (its Cash modal may be on top), with the same
      // panel mounted.
      const { scope } = resolve();
      if (scope !== POS_SCOPES.CHECKOUT && scope !== POS_SCOPES.PAYMENT) return;
      if (!registry.list('overlay').some((o) => o.id === target.owner && o.open !== false)) return;
      if (!registry.newest('payment', (p) => p === target)) return;
      target.onQuickCash();
    };
    pending = { at: now(), fire, timer: setTimer(() => { pending = null; fire(); }, HOTKEY_SETTLE_MS) };
  };

  /** Ctrl+Enter: settle checkout through its own guarded Settle. Left alone in any other scope. */
  const handleSettleChord = (state, event, scanEnter) => {
    if (state.scope !== POS_SCOPES.CHECKOUT || isFieldTarget(event.target)) return;
    // Consumed even when it cannot settle, so it never falls through to a focused button.
    swallow(event);
    if (event.repeat || isBurstEnter('Enter', scanEnter)) return;
    flushPending();
    shortcutAction(POS_SCOPES.CHECKOUT, state.overlay?.id, 'settle')?.();
  };

  /**
   * COMPLETE: a person's Enter starts the new sale, wherever the caret is on that screen except
   * another of its controls or a field. A scanner burst — its characters and its Enter — is
   * dropped, so a scan can never start the next sale.
   */
  const handleCompleteKeys = (state, event, { printable, follows, scanEnter }) => {
    const { key, target } = event;
    // A field keeps its keys, as outside the payment scopes everywhere.
    if (isFieldTarget(target)) return;
    if ((printable && follows) || isBurstEnter(key, scanEnter)) {
      droppedAt = key === 'Enter' ? 0 : now();
      swallow(event);
      return;
    }
    droppedAt = 0;
    if (key !== 'Enter') return;
    if (event.repeat || inEnterCooldown()) {
      swallow(event);
      return;
    }
    const ownerId = state.overlay?.id ?? null;
    const newSale = findFocusElement(registry, POS_FOCUS_TARGETS.NEW_SALE, ownerId);
    const control = controlOf(target);
    if (control && control !== newSale) return;
    const dialog = elementOf(target)?.closest?.('[role="dialog"]');
    if (dialog && !(newSale && dialog.contains(newSale))) return;
    const action = shortcutAction(POS_SCOPES.COMPLETE, ownerId, 'newSale');
    if (!action) return;
    swallow(event);
    action();
  };

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
    if (top && typeof top.onEscape === 'function') {
      markPosInputHandled(event);
      top.onEscape(event);
      return;
    }
    // Checkout: Esc is the Cancel button. A field (remarks) keeps its own Escape.
    if (state.scope !== POS_SCOPES.CHECKOUT || isFieldTarget(event.target)) return;
    const cancel = shortcutAction(POS_SCOPES.CHECKOUT, top?.id ?? null, 'cancel');
    if (!cancel) return;
    event.preventDefault();
    markPosInputHandled(event);
    cancel();
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
    // Cash twice in checkout: the second press allocates the exact remaining amount in Cash
    // (the first has opened, or is about to open, the Cash modal).
    if (method.type === PAYMENT_TYPES.CASH && state.scope === POS_SCOPES.CHECKOUT) {
      const quick = quickCashTarget();
      if (quick && quick.owner === ownerId) {
        runQuickCash(quick);
        return;
      }
      cashTap = { at: now(), owner: ownerId, target };
    }
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

    // The Cash hotkey again, right behind the one that opened this Cash modal: allocate the
    // exact remaining amount instead of clearing the amount. Held like any modal key, so a
    // scanner burst starting with C is still dropped whole.
    if (key.toLowerCase() === 'c') {
      const quick = quickCashTarget();
      if (quick) {
        swallow(event);
        runQuickCash(quick);
        return;
      }
    }

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
    const { key } = event;
    if (typeof key !== 'string') return;
    const settleChord = key === 'Enter' && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (!settleChord && (event.ctrlKey || event.metaKey || event.altKey)) return;

    // Classify before acting: does this key continue a scanner-speed run?
    const printable = key.length === 1;
    const follows = printable && burst.follows();
    const scanEnter = key === 'Enter' && burst.isScanEnter();
    if (printable) {
      burst.key();
      lastPrintableAt = now();
    } else if (key === 'Enter') {
      burst.reset();
      if (scanEnter) lastScanEnterAt = now();
    }
    if (cashTap && key.toLowerCase() !== 'c') cashTap = null;

    const state = resolve();
    const snapshot = fieldSnapshot;
    fieldSnapshot = null;

    if (state.scope !== POS_SCOPES.SALE) cancelSaleSequences();

    if (settleChord) {
      handleSettleChord(state, event, scanEnter);
      return;
    }

    if (key === 'Escape') {
      cancelPending();
      cancelSaleSequences();
      handleEscape(state, event);
      return;
    }

    if (!acceptsScanner(state.scope) || state.scanBlocked) resetWedge();

    // Right after an Enter sequence opened checkout, a stray Enter is not a click on whatever
    // took the focus (the Cash modal's confirm, Settle).
    if (key === 'Enter' && inEnterCooldown() && !isFieldTarget(event.target)
        && (state.scope === POS_SCOPES.CHECKOUT || state.scope === POS_SCOPES.PAYMENT)) {
      swallow(event);
      return;
    }

    if (state.scope === POS_SCOPES.PAYMENT) {
      handlePaymentModalKeys(state, event, { printable, follows, scanEnter }, snapshot);
      return;
    }
    if (acceptsPaymentHotkeys(state.scope)) {
      handlePaymentKeys(state, event, { printable, follows, scanEnter }, snapshot);
      return;
    }
    cancelPending();

    if (state.scope === POS_SCOPES.COMPLETE) {
      handleCompleteKeys(state, event, { printable, follows, scanEnter });
      return;
    }

    if (!acceptsScanner(state.scope) || state.scanBlocked) return;
    if (handleSaleKeys(event, { printable, follows, scanEnter })) return;
    const scan = surface();
    if (!scan) return;
    if (scan.kind === 'wedge') handleWedge(scan, event, printable);
    else if (scan.kind === 'redirect') handleRedirect(scan, event, printable);
  };

  const dispose = () => {
    resetWedge();
    cancelPending();
    cancelSaleSequences();
    droppedAt = 0;
    fieldSnapshot = null;
    cashTap = null;
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
 * @param enterTapMs    Enter multi-tap threshold (posShortcuts.ENTER_MULTI_TAP_MS by default);
 *                      read when the listener attaches
 * @returns the registry
 */
export function usePosInputController({
  overlays = {}, enabled = null, focusEnabled = null, enterTapMs = ENTER_MULTI_TAP_MS,
} = {}) {
  const [registry] = useState(() => createPosInputRegistry({
    v2: enabled == null ? isPosInputV2Enabled() : Boolean(enabled),
    focusV2: focusEnabled == null ? isPosFocusV2Enabled() : Boolean(focusEnabled),
  }));
  const [enterTap] = useState(enterTapMs);

  useLayoutEffect(() => {
    registry.syncDeclared(overlays);
  });

  // P2: the state-driven focus controller reads the same registry (inert with posFocusV2 off).
  usePosFocusController(registry);

  useEffect(() => {
    if (!registry.v2 || typeof window === 'undefined') return undefined;
    const handler = createPosKeyHandler({ registry, enterTapMs: enterTap });
    window.addEventListener('keydown', handler.onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handler.onKeyDown, true);
      handler.dispose();
    };
  }, [registry, enterTap]);

  return registry;
}

export default usePosInputController;
