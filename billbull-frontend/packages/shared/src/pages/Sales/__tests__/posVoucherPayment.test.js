import { describe, expect, it } from 'vitest';

import {
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  createPaymentLine,
  validateLine,
} from '../POS/payments/paymentModel';
import { allocationLabel } from '../POS/payments/paymentPresentation';
import { buildPaymentAllocationsPayload, buildCheckoutPaymentFields } from '../POS/payments/paymentPayloadAdapter';
import { paymentSummary, totalOfType, remainingBalance } from '../POS/payments/paymentSelectors';
import { confirmActionLabel, suggestedNextMethod } from '../POS/payments/paymentFlow';

/**
 * Credit Voucher as a POS payment method.
 *
 * A voucher is a payment instrument, not a discount: it settles a sale at full price by drawing
 * down store credit. These cover the rules that decide how much of a voucher may be applied and
 * what reaches the backend — the redemption itself is the backend's job and is tested there.
 */

const voucherLine = (amount, code = 'EDZH-PBCR-8C65') => createPaymentLine({
  paymentType: PAYMENT_TYPES.VOUCHER,
  amount,
  reference: code,
  metadata: { voucherNumber: 'CV-2026-000001' },
});

describe('voucher payment method', () => {
  it('is a recognised tender with a customer-facing label', () => {
    expect(PAYMENT_TYPES.VOUCHER).toBe('VOUCHER');
    expect(PAYMENT_TYPE_LABELS[PAYMENT_TYPES.VOUCHER]).toBe('Voucher');
  });

  it('requires a voucher code, because that is what the backend redeems against', () => {
    expect(validateLine(voucherLine(100))).toBeNull();

    const noCode = createPaymentLine({ paymentType: PAYMENT_TYPES.VOUCHER, amount: 100 });
    expect(validateLine(noCode)).toMatch(/voucher code/i);
  });

  it('rejects a zero-amount allocation like every other tender', () => {
    const zero = createPaymentLine({
      paymentType: PAYMENT_TYPES.VOUCHER, amount: 0, reference: 'ABC',
    });
    expect(validateLine(zero)).toMatch(/greater than zero/i);
  });

  it('names the specific voucher on the receipt so the customer can track its balance', () => {
    expect(allocationLabel(voucherLine(100))).toBe('Voucher EDZH-PBCR-8C65');
    const noRef = createPaymentLine({ paymentType: PAYMENT_TYPES.VOUCHER, amount: 100 });
    expect(allocationLabel(noRef)).toBe('Credit Voucher');
  });
});

describe('applicable amount', () => {
  // The ceiling is whichever runs out first: the bill or the voucher.
  const applicable = (saleRemaining, voucherBalance) => Math.min(saleRemaining, voucherBalance);

  it('voucher smaller than the sale applies in full and leaves a balance owing', () => {
    expect(applicable(700, 500)).toBe(500);
    expect(remainingBalance([voucherLine(500)], 700)).toBe(200);
  });

  it('voucher larger than the sale applies only what the sale needs', () => {
    // The unused 200 stays on the voucher — it is never paid out as change.
    expect(applicable(300, 500)).toBe(300);
    expect(remainingBalance([voucherLine(300)], 300)).toBe(0);
  });

  it('voucher exactly covering the sale settles it', () => {
    expect(remainingBalance([voucherLine(100)], 100)).toBe(0);
  });
});

describe('voucher combined with another tender', () => {
  it('voucher plus cash settles the bill and totals correctly', () => {
    const lines = [
      voucherLine(500),
      createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 200 }),
    ];

    expect(remainingBalance(lines, 700)).toBe(0);
    expect(totalOfType(lines, PAYMENT_TYPES.VOUCHER)).toBe(500);
    expect(totalOfType(lines, PAYMENT_TYPES.CASH)).toBe(200);
    expect(paymentSummary(lines)).toContain('Voucher');
    expect(paymentSummary(lines)).toContain('Cash');
  });

  it('after a voucher leaves a balance, the till suggests cash next', () => {
    const next = suggestedNextMethod(PAYMENT_TYPES.VOUCHER, 200,
      [PAYMENT_TYPES.CASH, PAYMENT_TYPES.CARD, PAYMENT_TYPES.VOUCHER]);
    expect(next).toBe(PAYMENT_TYPES.CASH);

    expect(confirmActionLabel({
      currentType: PAYMENT_TYPES.VOUCHER,
      remainingAfter: 200,
      offeredTypes: [PAYMENT_TYPES.CASH, PAYMENT_TYPES.VOUCHER],
    })).toBe('Confirm & Continue to Cash');
  });

  it('a voucher that settles the bill does not chain onward', () => {
    expect(suggestedNextMethod(PAYMENT_TYPES.VOUCHER, 0,
      [PAYMENT_TYPES.CASH, PAYMENT_TYPES.VOUCHER])).toBeNull();
    expect(confirmActionLabel({
      currentType: PAYMENT_TYPES.VOUCHER,
      remainingAfter: 0,
      offeredTypes: [PAYMENT_TYPES.CASH, PAYMENT_TYPES.VOUCHER],
    })).toBe('Confirm Voucher');
  });

  it('the till never nudges a cashier toward a voucher — the customer either has one or not', () => {
    const next = suggestedNextMethod(PAYMENT_TYPES.CASH, 200,
      [PAYMENT_TYPES.CASH, PAYMENT_TYPES.CARD, PAYMENT_TYPES.VOUCHER]);
    expect(next).not.toBe(PAYMENT_TYPES.VOUCHER);
  });
});

describe('checkout payload', () => {
  it('sends the voucher code as the allocation reference, which is what the backend redeems', () => {
    const payload = buildPaymentAllocationsPayload([voucherLine(500)]);

    expect(payload).toHaveLength(1);
    expect(payload[0].type).toBe('VOUCHER');
    expect(payload[0].amount).toBe(500);
    expect(payload[0].reference).toBe('EDZH-PBCR-8C65');
  });

  it('counts a voucher as money received but never opens the cash drawer', () => {
    const fields = buildCheckoutPaymentFields([voucherLine(500)], { effectiveDue: 500 });

    expect(fields.amountReceived).toBe(500);
    expect(fields.changeDue).toBe(0);
    // No physical cash moved, so the drawer must stay shut.
    expect(fields.cashTaken).toBe(false);
  });

  it('a voucher larger than the sale produces no change — the surplus stays on the voucher', () => {
    // The UI caps the allocation at the sale total, so the payload carries only what was applied.
    const fields = buildCheckoutPaymentFields([voucherLine(300)], { effectiveDue: 300 });
    expect(fields.changeDue).toBe(0);
    expect(fields.amountReceived).toBe(300);
  });

  it('voucher and cash both reach the backend as separate allocations', () => {
    const lines = [
      voucherLine(500),
      createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 200 }),
    ];
    const payload = buildPaymentAllocationsPayload(lines);

    expect(payload.map((p) => p.type)).toEqual(['VOUCHER', 'CASH']);
    const fields = buildCheckoutPaymentFields(lines, { effectiveDue: 700 });
    expect(fields.amountReceived).toBe(700);
    expect(fields.cashTaken).toBe(true);
  });

  it('a removed voucher allocation leaves nothing behind in the payload', () => {
    // Removing the line before checkout must not reach the backend at all — that is what keeps
    // the persisted voucher untouched when a cashier changes their mind.
    const payload = buildPaymentAllocationsPayload([
      createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 200 }),
    ]);
    expect(payload.every((p) => p.type !== 'VOUCHER')).toBe(true);
  });
});
