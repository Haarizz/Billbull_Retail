/**
 * Flow rules for progressive payment allocation: what the primary button of a payment modal
 * says, and which tender the cashier is offered next when money is still owed.
 *
 * Kept here rather than inside each modal so the four modals cannot drift apart — the rule
 * "if this payment finishes the bill, confirm and stop; otherwise confirm and roll straight
 * into the next tender" is written once and read by everything.
 *
 * Pure functions, no React — directly unit-testable.
 */

import { AMOUNT_TOLERANCE, PAYMENT_TYPES } from './paymentModel';

/**
 * The order a cashier is nudged through tenders when a balance remains. Cash first because
 * it is what a customer reaches for when a card is declined or short; credit last because
 * it collects no money and is the fallback of last resort.
 */
export const NEXT_METHOD_PRIORITY = Object.freeze([
  PAYMENT_TYPES.CASH,
  PAYMENT_TYPES.CARD,
  PAYMENT_TYPES.ONLINE,
  PAYMENT_TYPES.CREDIT,
]);

/** Short button-facing names — "Confirm Card", not "Confirm Card Payment". */
export const METHOD_SHORT_LABELS = Object.freeze({
  [PAYMENT_TYPES.CASH]: 'Cash',
  [PAYMENT_TYPES.CARD]: 'Card',
  [PAYMENT_TYPES.ONLINE]: 'Online',
  [PAYMENT_TYPES.CREDIT]: 'Credit',
  [PAYMENT_TYPES.VOUCHER]: 'Voucher',
  [PAYMENT_TYPES.BNPL]: 'BNPL',
});

// BNPL is deliberately absent from NEXT_METHOD_PRIORITY for the same reason as VOUCHER below:
// financing is the customer's decision, made before the till is involved, so nudging a cashier
// into it would be pushing credit at someone who did not ask for it. It still chains away from
// itself, so a partially financed basket suggests Cash next.
//
// VOUCHER is deliberately absent from NEXT_METHOD_PRIORITY above: the till should never nudge a
// cashier toward a voucher, because the customer either produced one or did not. It still
// chains correctly *away* from itself — a voucher that leaves a balance suggests Cash next,
// which is the ordinary "voucher + cash" split.

/**
 * The tender to open next, or null when this payment settles the bill.
 *
 * The current method is always skipped: a cashier who has just keyed cash and still owes
 * money is short of cash, so re-opening the cash pad would only repeat the dead end.
 *
 * @param offeredTypes the tenders this screen actually allows — a delivery balance cannot be
 *                     put back on account, so CREDIT is not offered there and is skipped.
 */
export function suggestedNextMethod(currentType, remainingAfter, offeredTypes = NEXT_METHOD_PRIORITY) {
  if (!(remainingAfter > AMOUNT_TOLERANCE)) return null;
  const offered = offeredTypes && offeredTypes.length > 0 ? offeredTypes : NEXT_METHOD_PRIORITY;
  return NEXT_METHOD_PRIORITY.find((t) => t !== currentType && offered.includes(t)) || null;
}

/**
 * The primary button's label for a modal about to commit `remainingAfter` still owed.
 *
 * Editing an existing allocation never chains onward: the cashier came back to correct one
 * line, not to start a new tender, so it stays a plain save.
 */
export function confirmActionLabel({ currentType, remainingAfter, offeredTypes, editing = false }) {
  const label = METHOD_SHORT_LABELS[currentType] || 'Payment';
  if (editing) return `Save ${label}`;
  const next = suggestedNextMethod(currentType, remainingAfter, offeredTypes);
  return next ? `Confirm & Continue to ${METHOD_SHORT_LABELS[next]}` : `Confirm ${label}`;
}

/**
 * What a modal still leaves owed after applying `amount`.
 *
 * `target` is what this one modal may allocate (see `allocationTarget`). Cash tendered above
 * it is change, not an over-payment, hence the clamp.
 */
export function remainingAfterAllocation(target, amount) {
  return Math.max(0, target - Math.min(amount, target));
}
