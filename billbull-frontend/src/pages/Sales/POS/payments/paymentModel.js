/**
 * Progressive-payment domain model for POS checkout.
 *
 * A checkout is an ordered list of *payment lines*. Each line is one tender the cashier
 * allocated against the invoice; the sale settles when the allocations cover the total.
 * There is no "mixed" mode — a sale paid two ways is simply a checkout with two lines.
 *
 * This module is pure (no React, no I/O) so the rules can be unit-tested directly.
 */

/**
 * The kinds of tender a line can be. Mirrors the backend PosPaymentAllocationType enum.
 *
 * Customer Advance is deliberately absent. An advance is a balance on the customer's ledger,
 * received and applied from Customer > Customer Advance Management, where it can be aged,
 * refunded and reconciled against A/R. Drawing one down at the till put the same balance behind
 * two workflows that could disagree, so checkout settles with money only.
 */
export const PAYMENT_TYPES = Object.freeze({
  CASH: 'CASH',
  CARD: 'CARD',
  ONLINE: 'ONLINE',
  CREDIT: 'CREDIT',
  /**
   * Store credit redeemed from a Credit Voucher issued by a Sales Return.
   *
   * A payment instrument, not a discount: it settles the sale at full price by drawing down
   * the liability recognised when the voucher was issued. The voucher code travels in the
   * line's `reference`, and the backend redeems it under a row lock at checkout — adding the
   * line here reserves nothing.
   */
  VOUCHER: 'VOUCHER',
});

/**
 * Human-facing label per type, used to build the payment summary ("Cash + Card + Online").
 * CARD lines override this with their subtype (the card network) when one is chosen.
 */
export const PAYMENT_TYPE_LABELS = Object.freeze({
  [PAYMENT_TYPES.CASH]: 'Cash',
  [PAYMENT_TYPES.CARD]: 'Card',
  [PAYMENT_TYPES.ONLINE]: 'Online',
  [PAYMENT_TYPES.CREDIT]: 'Credit',
  [PAYMENT_TYPES.VOUCHER]: 'Voucher',
});

/** Currency comparison tolerance — half a fils, so 2-dp rounding never flips a check. */
export const AMOUNT_TOLERANCE = 0.005;

/** Only CASH may be tendered above the remaining balance; the excess is the customer's change. */
export const OVERPAYABLE_TYPES = Object.freeze([PAYMENT_TYPES.CASH]);

let lineSequence = 0;

/**
 * Creates a payment line with a unique client-side id.
 *
 * The id is what edit/delete/reorder key off — never the array index, so removing a line
 * can't silently retarget a later edit at the wrong tender.
 *
 * Business-critical properties are first-class fields. `metadata` exists only for
 * extensibility (UI hints, future rails) and is never read by the selectors.
 */
export function createPaymentLine({
  paymentType,
  paymentSubtype = null,
  amount = 0,
  reference = null,
  bankAccountId = null,
  bankAccountName = null,
  customerCode = null,
  customerName = null,
  metadata = null,
} = {}) {
  lineSequence += 1;
  return {
    id: `pl_${Date.now().toString(36)}_${lineSequence.toString(36)}`,
    paymentType,
    paymentSubtype,
    amount: toAmount(amount),
    reference: reference || null,
    bankAccountId: bankAccountId || null,
    bankAccountName: bankAccountName || null,
    customerCode: customerCode || null,
    customerName: customerName || null,
    metadata: metadata || null,
  };
}

/** Parses any input shape (string from a keypad, number, null) into a safe non-negative amount. */
export function toAmount(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The label this line contributes to the payment summary. */
export function lineLabel(line) {
  if (line.paymentType === PAYMENT_TYPES.CARD && line.paymentSubtype) {
    return line.paymentSubtype;
  }
  return PAYMENT_TYPE_LABELS[line.paymentType] || 'Cash';
}

/**
 * Per-line completeness. A line the cashier started but hasn't finished (card with no network
 * picked, online with no receiving bank account, credit with no customer) blocks settlement.
 */
export function validateLine(line) {
  if (!line || !PAYMENT_TYPES[line.paymentType]) return 'Unknown payment type.';
  if (line.amount <= 0) return 'Amount must be greater than zero.';
  switch (line.paymentType) {
    case PAYMENT_TYPES.CARD:
      return line.paymentSubtype ? null : 'Select a card type.';
    case PAYMENT_TYPES.ONLINE:
      return line.bankAccountId ? null : 'Select a receiving bank account.';
    case PAYMENT_TYPES.CREDIT:
      return line.customerCode ? null : 'Select a customer for the credit sale.';
    case PAYMENT_TYPES.VOUCHER:
      // The code is what the backend redeems against; without it the allocation is unbacked
      // and checkout would post a payment line with no voucher behind it.
      return line.reference ? null : 'Scan or enter a voucher code.';
    default:
      return null;
  }
}
