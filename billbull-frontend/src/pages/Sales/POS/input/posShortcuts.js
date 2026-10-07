/**
 * POS keyboard shortcuts (P3): which key does what, in which scope.
 *
 * Pure. The input controller (usePosInputController) is the only thing that reads keys; it
 * looks a key up here and runs the action registered for it (usePosShortcuts). Components
 * supply the actions — they know how their template edits a line or opens the customer search —
 * and never listen for keys themselves.
 *
 *   SALE      Enter ×1 checkout · ×2 checkout + Cash modal (exact amount keyed) · ×3 checkout +
 *             exact Cash allocated, Settle focused (not posted)
 *             F2 customer · F3 search · F4 qty · F8 discount · F9 price · F10 hold
 *             + / − quantity of the target line · Delete remove the target line
 *   CHECKOUT  C D O R B tenders (the payment panel's hotkeys) · C twice = exact Cash allocated
 *             Ctrl+Enter settle · Esc cancel checkout
 *   COMPLETE  Enter new sale
 *
 * Browser keys stay the browser's: F5, F11, F12, Ctrl+R/W/P and every other chord except
 * Ctrl+Enter pass through untouched.
 */
import { SCANNER_BURST_GAP_MS } from '../device/scanner/scanGuard';

/**
 * Taps of Enter closer together than this are one sequence (double/triple). The single-tap
 * action waits this long, and only for Enter on an empty sale search.
 */
export const ENTER_MULTI_TAP_MS = 300;
/** Two Cash hotkeys closer together than this allocate the exact remaining amount. */
export const CASH_DOUBLE_TAP_MS = 300;
/** An Enter this soon after a scanner burst is that burst's suffix, never a tap. */
export const BURST_TAIL_MS = SCANNER_BURST_GAP_MS * 3;

/** What an Enter sequence asks checkout to do once it opens. */
export const CHECKOUT_QUICK_CASH = Object.freeze({
  /** Double Enter: open the Cash modal; it keys the exact remaining amount itself. */
  MODAL: 'modal',
  /** Triple Enter: allocate the exact remaining amount in Cash; Settle takes the focus. */
  ALLOCATE: 'allocate',
});

const QUICK_CASH_MODES = new Set(Object.values(CHECKOUT_QUICK_CASH));

/**
 * handleCheckout's optional argument → the request the checkout payment panel acts on once, or
 * null. Anything else (no argument, a click event) is an ordinary checkout. `seq` makes each
 * request distinct, so the panel can tell a new one from the one it already handled.
 */
export function checkoutQuickCashRequest(opts, seq) {
  const mode = opts && typeof opts === 'object' ? opts.quickCash : null;
  return QUICK_CASH_MODES.has(mode) ? { mode, seq } : null;
}

/** Enter taps → checkout intent. */
export const ENTER_TAP_INTENT = Object.freeze({
  1: null,
  2: CHECKOUT_QUICK_CASH.MODAL,
  3: CHECKOUT_QUICK_CASH.ALLOCATE,
});

/** SALE keys that never type text: handled wherever the caret is in the sale screen. */
export const SALE_FUNCTION_KEYS = Object.freeze({
  F2: { action: 'customer' },
  F3: { action: 'search' },
  F4: { action: 'mode', arg: 'qty' },
  F8: { action: 'mode', arg: 'discount' },
  F9: { action: 'mode', arg: 'price' },
  F10: { action: 'hold' },
});

/**
 * SALE keys that would otherwise edit text: handled only when the sale search is empty or no
 * field has the caret. + and − are printable, so they wait the scanner settle window first.
 */
export const SALE_LINE_KEYS = Object.freeze({
  '+': { action: 'qtyStep', arg: 1, printable: true },
  '-': { action: 'qtyStep', arg: -1, printable: true },
  Delete: { action: 'remove' },
});

/**
 * The cart line a line shortcut (+, −, Delete, F4/F8/F9) acts on: the line the cashier selected,
 * else the line most recently entered. Never "the first line in the array" — new lines go on top
 * and a re-scan merges into a line wherever it sits, so position says nothing about recency.
 * A voided or vanished line is no target. Returns null when there is none.
 */
export function resolveShortcutLine({ items = [], selectedId = null, lastEnteredId = null } = {}) {
  const live = (id) => (id == null ? null : items.find((i) => i.id === id && !i.isVoided) || null);
  return live(selectedId) || live(lastEnteredId);
}
