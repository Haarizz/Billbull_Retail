import { PAYMENT_TYPES } from './paymentModel';
import {
  changeAmount,
  paymentSummary,
  totalOfType,
} from './paymentSelectors';

/**
 * Adapts the cashier's payment allocations to the shape the checkout API expects.
 *
 * The backend's `paymentAllocations` field (added in Phase 1) is the wire form of exactly
 * this model — an ordered list of tenders, each settling part of the invoice — so the
 * mapping is a direct projection rather than a translation. It is also the only shape that
 * can express what the new UI allows: several cards, a cash overpayment alongside a credit
 * balance, or repeated tenders of the same type. The legacy per-mode scalars
 * (cashAmount / cardAmount / cardLegs / amountTendered) cannot represent those, which is
 * why they are no longer sent from this screen; the backend ignores them whenever
 * `paymentAllocations` is present.
 */
export function buildPaymentAllocationsPayload(lines) {
  return lines
    .filter((l) => l.amount > 0)
    .map((l) => ({
      type: l.paymentType,
      subtype: l.paymentSubtype || null,
      amount: round2(l.amount),
      reference: l.reference || null,
      bankAccountName: l.bankAccountName || null,
    }));
}

/**
 * The payment-related fields of the checkout payload, plus the figures the post-checkout
 * flow needs (change to hand back, credit carried forward, whether the drawer should open).
 *
 * @param {Array}  lines        the allocations, in cashier entry order
 * @param {number} effectiveDue amount due, net of any layaway deposit already collected
 * @param {number} layawayDeposit deposit pre-credited as tender on a layaway conversion
 */
export function buildCheckoutPaymentFields(lines, { effectiveDue = 0, layawayDeposit = 0 } = {}) {
  const totalCash = totalOfType(lines, PAYMENT_TYPES.CASH);
  const totalCredit = totalOfType(lines, PAYMENT_TYPES.CREDIT);
  const change = changeAmount(lines, effectiveDue);
  // What was actually received now: every allocation except the credit balance, and
  // excluding any cash handed back as change.
  const received = lines.reduce((sum, l) => (
    l.paymentType === PAYMENT_TYPES.CREDIT ? sum : sum + l.amount
  ), 0) - change;

  const summary = paymentSummary(lines) || 'Cash';

  // The account a credit allocation is charged to. The sale's customer follows from this:
  // a bill part-paid on account belongs to that account holder, not to a walk-in.
  const creditLine = lines.find((l) => l.paymentType === PAYMENT_TYPES.CREDIT);
  const creditCustomer = creditLine
    ? { code: creditLine.customerCode, name: creditLine.customerName }
    : null;

  return {
    // ── payload fields ──
    paymentAllocations: buildPaymentAllocationsPayload(lines),
    // Both carry the dynamic summary ("Cash + Visa + Online + Credit"). The backend
    // re-derives its own label from the recorded payments; this is the pre-post label used
    // for the invoice stamp and the on-screen preview. Never the word "Mixed".
    paymentMode: summary,
    combinedPaymentMode: summary,

    // ── post-checkout figures ──
    /** Cash to hand back. Only cash can overpay, so only cash produces change. */
    changeDue: round2(change),
    /** Money collected now, before the layaway deposit is credited back on top. */
    paidAmount: round2(received + (layawayDeposit > 0 ? layawayDeposit : 0)),
    /** Amount left on the customer's receivable after this sale. */
    creditBalance: round2(totalCredit),
    /** Amount applied against the customer's ledger for this invoice. */
    creditAppliedAmount: round2(effectiveDue - totalCredit),
    /** Drawer opens whenever physical cash changed hands. */
    cashTaken: totalCash > 0,
    /** Human-readable payment mode for receipts and the success screen. */
    paymentSummary: summary,
    /** Money actually collected now — every allocation except the credit balance. */
    amountReceived: round2(received),
    /** {code, name} of the account carrying the credit balance, else null. */
    creditCustomer,
  };
}

/**
 * The payment fields for a non-checkout settlement — a delivery-order balance, a layaway
 * deposit. Deliberately the same projection as a checkout: one payload builder, so a rule
 * changed for the till is changed for every settlement screen at the same moment.
 *
 * @param {Array}  lines     the allocations, in cashier entry order
 * @param {number} amountDue what this settlement has to cover
 */
export function buildSettlementPaymentFields(lines, { amountDue = 0 } = {}) {
  const summary = paymentSummary(lines) || 'Cash';
  return {
    paymentAllocations: buildPaymentAllocationsPayload(lines),
    paymentMode: summary,
    paymentSummary: summary,
    amountTendered: round2(Math.min(
      lines.reduce((sum, l) => sum + l.amount, 0),
      amountDue,
    )),
    changeDue: round2(changeAmount(lines, amountDue)),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export default buildCheckoutPaymentFields;
