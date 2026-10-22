/**
 * The rules for applying a Credit Voucher to an open POS sale.
 *
 * A voucher is a payment instrument, not a cart line and not a discount: the sale still
 * happens at full price, and the voucher settles part of it by drawing down store credit the
 * business already owes the customer. So an applied voucher becomes a VOUCHER allocation on
 * the same Payment Manager the checkout panel writes to — never an item, never a quantity,
 * never a stock movement, never a VAT adjustment.
 *
 * <b>Nothing here spends anything.</b> Planning an application only decides how much of the
 * voucher this sale can absorb; the backend redeems it under a row lock during checkout,
 * re-validating status, expiry, balance and branch under that lock. That is why a cashier can
 * apply a voucher, remove it, or abandon the sale entirely and the balance is untouched — and
 * why a voucher spent on another till in between is still correctly refused at settlement.
 *
 * Pure — no React, no I/O — so every edge case is directly testable.
 */

import { PAYMENT_TYPES } from './paymentModel';

/** Currency rounding to 2dp; money is compared at fils precision everywhere. */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Decides whether a scanned voucher can be applied to the sale, and for how much.
 *
 * @param {object} voucher   the server's CreditVoucherResponse — the only authority on
 *                           balance, status, expiry and branch eligibility
 * @param {Array}  lines     the sale's current payment allocations
 * @param {number} amountDue what the sale still has to settle, net of any layaway deposit
 *
 * @returns {{ok: boolean, amount: number, remainingOnVoucher: number, reason: string|null}}
 *          `reason` is always voucher-specific when `ok` is false — a cashier holding a real
 *          voucher must never be told "item not found".
 */
export function planVoucherApplication(voucher, lines = [], amountDue = 0) {
  if (!voucher) {
    return refuse('No voucher found for that code.');
  }

  // Eligibility is echoed from the server verbatim rather than re-derived here. The till
  // deciding for itself whether a voucher is expired or spent is exactly how a voucher gets
  // redeemed twice, and the message would drift from the one settlement gives.
  if (!voucher.redeemable) {
    return refuse(voucher.notRedeemableReason
      || `Voucher ${voucher.voucherNumber || ''}`.trim() + ' cannot be redeemed.');
  }

  const code = String(voucher.voucherCode || '').toUpperCase();
  const alreadyApplied = lines.some((l) => l.paymentType === PAYMENT_TYPES.VOUCHER
    && String(l.reference || '').toUpperCase() === code);
  if (alreadyApplied) {
    // A double scan must not draw the voucher twice. Whatever this bill could absorb is
    // already committed to it.
    return refuse(`Voucher ${voucher.voucherNumber} is already applied to this sale.`);
  }

  const due = round2(amountDue);
  if (due <= 0) {
    return refuse('Add items to the sale before applying a voucher.');
  }

  const allocated = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const outstanding = round2(due - allocated);
  if (outstanding <= 0) {
    return refuse('This sale is already fully covered — remove a payment first.');
  }

  // Partial redemption in both directions, which is the norm:
  //   voucher 100, bill 60  → applies 60, and 40 stays on the voucher. A voucher can never
  //                           pay out change; the surplus keeps its value for next time.
  //   voucher 100, bill 150 → applies 100, and 50 is still to be collected in cash or card.
  const balance = Number(voucher.remainingAmount) || 0;
  const amount = round2(Math.min(outstanding, balance));
  if (amount <= 0) {
    return refuse(`Voucher ${voucher.voucherNumber} has no remaining balance.`);
  }

  return {
    ok: true,
    amount,
    remainingOnVoucher: round2(balance - amount),
    reason: null,
  };
}

/**
 * Re-caps applied vouchers to fit a bill that has shrunk.
 *
 * A voucher applied against a 500 bill cannot still claim 500 after the cashier voids a line
 * and the bill drops to 300: the backend refuses non-cash tender above the invoice total, so
 * the sale would simply fail at settlement with no explanation the cashier can act on.
 *
 * Only ever shrinks. A voucher is never silently grown to swallow items added afterwards —
 * spending more of a customer's credit than they agreed to is not a rounding decision.
 *
 * @returns {Array<{id: string, action: 'remove'|'reduce', amount: number}>} the adjustments to
 *          apply, in allocation order; empty when everything already fits.
 */
export function capVoucherAllocations(lines = [], amountDue = 0) {
  const vouchers = lines.filter((l) => l.paymentType === PAYMENT_TYPES.VOUCHER);
  if (vouchers.length === 0) return [];

  const nonVoucher = lines.reduce(
    (sum, l) => (l.paymentType === PAYMENT_TYPES.VOUCHER ? sum : sum + (Number(l.amount) || 0)), 0);
  let budget = Math.max(0, round2(amountDue - nonVoucher));

  const adjustments = [];
  vouchers.forEach((line) => {
    const current = Number(line.amount) || 0;
    const capped = round2(Math.min(current, budget));
    budget = round2(budget - capped);
    if (capped <= 0) {
      adjustments.push({ id: line.id, action: 'remove', amount: 0 });
    } else if (Math.abs(capped - current) > 0.005) {
      adjustments.push({ id: line.id, action: 'reduce', amount: capped });
    }
  });
  return adjustments;
}

function refuse(reason) {
  return { ok: false, amount: 0, remainingOnVoucher: 0, reason };
}
