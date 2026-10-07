import { useCallback, useEffect, useRef } from 'react';

import { isPosInputHandled, isPosScreenBlocked } from '../device/scanner/scanGuard';
import { isEditableTarget } from '../../../../utils/editableTarget';
import { usePosInputV2, usePosScanSurface } from '../input/PosOverlayContext';

/**
 * useStickyScanFocus
 *
 * Keeps the caret in the Trade POS barcode/search box so a cashier can scan or type at any
 * moment without clicking first: on mount (session start), after every cart change, and after
 * a sale closes. The compact template previously had neither this nor the keyboard-wedge
 * capture POSTouchScreen carries, so focus was lost to whatever was clicked last and scans
 * went nowhere.
 *
 * Two mechanisms, deliberately both:
 *
 *  1. Trigger + bounded retry. A dependency change (cart edited, sale completed, customer
 *     assigned) asks for focus. If a modal owns the screen at that moment the attempt is
 *     retried on a short timer until the modal closes, then gives up — so "after the sale"
 *     lands in the search box once the receipt/payment dialog is gone, not before.
 *
 *  2. Type-anywhere redirect. A printable keystroke that lands on no text field is forwarded
 *     into the search box, character included. That is what makes a keyboard-wedge scanner
 *     work when focus has drifted, and it re-arms focus without stealing it from any field
 *     the cashier is actually using.
 *
 * Focus is never taken from another input, textarea, select or contenteditable, and never
 * while an overlay is open — every POS dialog in this codebase is a `fixed inset-0` layer,
 * and modals that must swallow scans additionally carry data-pos-scan-suppress.
 */

const RETRY_INTERVAL_MS = 300;
const MAX_RETRIES = 60; // ~18s — long enough to outlast a payment/receipt dialog.

const isTextEntryTarget = isEditableTarget;

// Any open POS dialog/overlay, or a modal that must never see a scan. Shared with the
// Classic/Cart Focus wedge listener so both templates agree on what "blocked" means.
const isScreenBlocked = isPosScreenBlocked;

export function useStickyScanFocus(barcodeInputRef, { enabled = true, triggers = [] } = {}) {
  const retryTimerRef = useRef(null);
  const retriesLeftRef = useRef(0);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retriesLeftRef.current = 0;
  }, []);

  /** Focus the search box when it is safe to do so. Returns whether focus was taken. */
  const focusSearch = useCallback(() => {
    const el = barcodeInputRef?.current;
    if (!el || typeof document === 'undefined') return false;
    if (document.activeElement === el) return true;
    if (isScreenBlocked()) return false;
    // Do not yank the caret out of a field the cashier is typing into.
    if (isTextEntryTarget(document.activeElement)) return false;
    el.focus();
    el.select?.();
    return document.activeElement === el;
  }, [barcodeInputRef]);

  /** Ask for focus now; if something is in the way, keep asking until it is not. */
  const requestFocus = useCallback(() => {
    if (!enabled) return;
    clearRetry();
    retriesLeftRef.current = MAX_RETRIES;
    const attempt = () => {
      retryTimerRef.current = null;
      if (focusSearch()) return;
      if (retriesLeftRef.current-- <= 0) return;
      retryTimerRef.current = window.setTimeout(attempt, RETRY_INTERVAL_MS);
    };
    // One frame of slack so the attempt runs after the DOM settles from this render.
    retryTimerRef.current = window.setTimeout(attempt, 0);
  }, [enabled, focusSearch, clearRetry]);

  // Mount + every declared trigger (cart changes, completed sale, customer assignment).
  useEffect(() => {
    requestFocus();
    return clearRetry;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, requestFocus, ...triggers]);

  // Type-anywhere redirect, including keyboard-wedge scanner bursts. With posInputV2 the
  // centralized POS input controller performs it for the registered 'redirect' surface and the
  // legacy window listener below stands down. Focus retries above are unchanged either way.
  const posInputV2 = usePosInputV2();
  usePosScanSurface({ kind: 'redirect', enabled, inputRef: barcodeInputRef });

  useEffect(() => {
    if (!enabled || posInputV2 || typeof document === 'undefined') return undefined;

    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isPosInputHandled(event)) return;
      const el = barcodeInputRef?.current;
      if (!el || document.activeElement === el) return;
      if (isScreenBlocked()) return;
      if (isTextEntryTarget(document.activeElement)) return;
      if (event.key.length !== 1) return; // printable characters only

      el.focus();
      // Deliver the keystroke that caused the focus — otherwise the first character of every
      // scan is silently dropped. The native setter is required for React controlled inputs.
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setValue) {
        setValue.call(el, `${el.value}${event.key}`);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, posInputV2, barcodeInputRef]);

  return { focusSearch, requestFocus };
}

export default useStickyScanFocus;
