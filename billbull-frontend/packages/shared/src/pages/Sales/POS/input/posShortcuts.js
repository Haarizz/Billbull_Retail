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
 *             F6 cursor into the cart / back to search
 *   CART      (SALE, caret in the cart) ↑ ↓ pick a line · C D O R B checkout on that tender
 *             · Esc back to search
 *   CHECKOUT  C D O R B tenders (the payment panel's hotkeys) · C twice = exact Cash allocated
 *             Ctrl+Enter settle · Esc cancel checkout
 *   COMPLETE  Enter new sale
 *
 * Browser keys stay the browser's: F5, F11, F12, Ctrl+R/W/P and every other chord except
 * Ctrl+Enter pass through untouched.
 */
import { SCANNER_BURST_GAP_MS } from '../device/scanner/scanGuard';
import { VISIBLE_PAYMENT_METHODS } from '../payments/paymentMethods';

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
  /** A tender picked from the cart (quick-pay bar or a cart hotkey): open that tender's modal. */
  TENDER: 'tender',
});

const QUICK_CASH_MODES = new Set([CHECKOUT_QUICK_CASH.MODAL, CHECKOUT_QUICK_CASH.ALLOCATE]);
const TENDER_TYPES = new Set(VISIBLE_PAYMENT_METHODS.map((m) => m.type));

/**
 * handleCheckout's optional argument → the request the checkout payment panel acts on once, or
 * null. `{ quickCash }` is an Enter sequence, `{ tender }` a tender picked in the cart. Anything
 * else (no argument, a click event) is an ordinary checkout. `seq` makes each request distinct,
 * so the panel can tell a new one from the one it already handled.
 */
export function checkoutQuickCashRequest(opts, seq) {
  if (!opts || typeof opts !== 'object') return null;
  if (TENDER_TYPES.has(opts.tender)) return { mode: CHECKOUT_QUICK_CASH.TENDER, method: opts.tender, seq };
  return QUICK_CASH_MODES.has(opts.quickCash) ? { mode: opts.quickCash, seq } : null;
}

/**
 * A template's checkout argument → handleCheckout's options. The Enter shortcut passes a
 * quick-cash mode (a string), the cart passes `{ tender }`; a click passes its event, which is
 * neither, and opens a plain checkout.
 */
export function checkoutOptions(arg) {
  if (typeof arg === 'string') return { quickCash: arg };
  if (arg && typeof arg === 'object' && TENDER_TYPES.has(arg.tender)) return { tender: arg.tender };
  return undefined;
}

/**
 * The cart cursor. F6 moves the caret into the cart and back to the search. In the cart,
 * ↑ / ↓ pick the line the line shortcuts act on, Enter checks out as anywhere, Esc returns to
 * the search, and a tender's hotkey (the letters the checkout method bar shows) opens checkout
 * with that tender's modal up. The letters are safe only there: the cart takes no typing.
 */
export const CART_CURSOR_KEY = 'F6';
/** Marks the cart region. The cursor is "in the cart" while the caret is inside it. */
export const CART_ZONE_ATTR = 'data-pos-cart';
export const CART_MOVE_KEYS = Object.freeze({ ArrowDown: 1, ArrowUp: -1 });
/** Cart hotkey (lower case) → tender. */
export const CART_TENDER_KEYS = Object.freeze(
  Object.fromEntries(VISIBLE_PAYMENT_METHODS.map((m) => [m.hotkey, m.type])),
);

/**
 * The line ↑ / ↓ moves the cart cursor to: one step from the current target line, held at the
 * ends. With no target yet, ↓ starts at the top and ↑ at the bottom. Voided lines are skipped.
 * Returns the line id, or null for an empty cart.
 */
export function stepCartLine({ items = [], currentId = null, delta = 1 } = {}) {
  const live = items.filter((i) => !i.isVoided);
  if (live.length === 0) return null;
  const at = live.findIndex((i) => i.id === currentId);
  if (at < 0) return (delta < 0 ? live[live.length - 1] : live[0]).id;
  return live[Math.max(0, Math.min(live.length - 1, at + delta))].id;
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
