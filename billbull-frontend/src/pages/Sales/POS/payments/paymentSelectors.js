/**
 * Derived values for a progressive-payment checkout.
 *
 * Every figure the checkout screen shows — remaining balance, change, summary label,
 * settlement readiness — is computed here from the payment lines. Nothing derived is ever
 * stored: there is exactly one source of truth (the lines), so the displayed remaining
 * balance and the amount actually sent to the backend cannot drift apart.
 *
 * Pure functions, no React — directly unit-testable.
 */

import {
  AMOUNT_TOLERANCE,
  PAYMENT_TYPES,
  lineLabel,
  validateLine,
} from './paymentModel';

/** Sum of the lines matching `type`. */
export function totalOfType(lines, type) {
  return lines.reduce((sum, l) => (l.paymentType === type ? sum + l.amount : sum), 0);
}

/** Sum of every allocation, credit included — credit is an allocation, just not a receipt. */
export function totalAllocated(lines) {
  return lines.reduce((sum, l) => sum + l.amount, 0);
}

/** Sum of everything that is not cash. Cash is excluded because only cash may overpay. */
export function totalNonCash(lines) {
  return lines.reduce((sum, l) => (l.paymentType === PAYMENT_TYPES.CASH ? sum : sum + l.amount), 0);
}

/**
 * What is still owed. Clamped at zero: cash tendered above the total is change, not a
 * negative balance.
 */
export function remainingBalance(lines, invoiceTotal) {
  return Math.max(0, invoiceTotal - totalAllocated(lines));
}

/**
 * Change owed to the customer. Only cash can produce it: the non-cash lines settle their
 * part of the invoice first, and whatever cash was tendered beyond the leftover is returned.
 */
export function changeAmount(lines, invoiceTotal) {
  const cash = totalOfType(lines, PAYMENT_TYPES.CASH);
  const cashNeeded = Math.max(0, invoiceTotal - totalNonCash(lines));
  return Math.max(0, cash - cashNeeded);
}

/**
 * The tender types used, in the order the cashier allocated them and de-duplicated:
 * Cash → Cash → Visa becomes ["Cash", "Visa"]. Never reordered alphabetically, because the
 * receipt, settlement screen and payment history must all read back in entry order.
 */
export function paymentMethodsUsed(lines) {
  const seen = [];
  lines.forEach((l) => {
    if (l.amount <= 0) return;
    const label = lineLabel(l);
    if (!seen.includes(label)) seen.push(label);
  });
  return seen;
}

/**
 * The combined payment-mode label: "Cash", "Cash + Card", "Cash + Card + Online + Credit".
 * Returns null when nothing is allocated. Never returns "Mixed".
 */
export function paymentSummary(lines) {
  const methods = paymentMethodsUsed(lines);
  return methods.length > 0 ? methods.join(' + ') : null;
}

/**
 * True once the allocations cover the invoice total. A zero-total bill (fully discounted,
 * or a layaway whose deposit already covered it) is complete with no tender at all.
 */
export function isFullyAllocated(lines, invoiceTotal) {
  if (invoiceTotal <= 0) return true;
  return totalAllocated(lines) >= invoiceTotal - AMOUNT_TOLERANCE;
}

/**
 * True when non-cash tender exceeds the invoice total. Card / Online / Credit
 * cannot be "given change" — an over-allocation there would have to be refunded through a
 * separate channel, so it is a blocking error rather than a rounding nicety.
 */
export function isOverAllocated(lines, invoiceTotal) {
  return totalNonCash(lines) > invoiceTotal + AMOUNT_TOLERANCE;
}

/**
 * Reference numbers used on more than one card line. Duplicates almost always mean the
 * cashier pasted the same auth code twice, which would post two indistinguishable card
 * receipts — the backend rejects them, so they are caught here first.
 */
export function duplicateCardReferences(lines) {
  const seen = new Set();
  const dupes = new Set();
  lines.forEach((l) => {
    if (l.paymentType !== PAYMENT_TYPES.CARD) return;
    const ref = (l.reference || '').trim().toLowerCase();
    if (!ref) return;
    if (seen.has(ref)) dupes.add(ref);
    else seen.add(ref);
  });
  return dupes;
}

/** Per-line validation errors, keyed by line id. Empty object means every line is complete. */
export function lineErrors(lines) {
  const errors = {};
  lines.forEach((l) => {
    const err = validateLine(l);
    if (err) errors[l.id] = err;
  });
  const dupes = duplicateCardReferences(lines);
  if (dupes.size > 0) {
    lines.forEach((l) => {
      if (l.paymentType !== PAYMENT_TYPES.CARD) return;
      const ref = (l.reference || '').trim().toLowerCase();
      if (ref && dupes.has(ref)) errors[l.id] = 'Duplicate reference number.';
    });
  }
  return errors;
}

/**
 * Settlement readiness: the invoice is covered, nothing non-cash is over-allocated, and
 * every line the cashier started is complete.
 */
export function canSettle(lines, invoiceTotal) {
  if (invoiceTotal <= 0) return true; // nothing left to collect
  if (lines.length === 0) return false;
  if (!isFullyAllocated(lines, invoiceTotal)) return false;
  if (isOverAllocated(lines, invoiceTotal)) return false;
  return Object.keys(lineErrors(lines)).length === 0;
}

/**
 * How much a single modal is allowed to allocate.
 *
 * When adding, that is simply what is still owed. When *editing*, the line being edited is
 * already counted in the remaining balance, so its own amount has to be added back — without
 * this, opening a fully-allocating line for edit would show a remaining balance of zero and
 * refuse every amount the cashier typed.
 */
export function allocationTarget(remaining, editingLine) {
  return remaining + (editingLine ? editingLine.amount : 0);
}
