import { describe, expect, it } from 'vitest';

import { PAYMENT_TYPES } from '../POS/payments/paymentModel';
import { capVoucherAllocations, planVoucherApplication } from '../POS/payments/voucherRedemption';

/**
 * Applying a Credit Voucher to an open POS sale.
 *
 * These pin the rules a cashier meets at the till: how much of a voucher a bill can absorb,
 * which vouchers are refused and with what wording, and what happens to an applied voucher
 * when the cart changes underneath it. Redemption itself is the backend's job — nothing here
 * spends anything, which is exactly why applying and removing a voucher is free.
 */

const voucher = (over = {}) => ({
  id: 7,
  voucherNumber: 'CV-2026-000007',
  voucherCode: 'EG56-RKDM-XV3K',
  originalAmount: 100,
  usedAmount: 0,
  remainingAmount: 100,
  expiryDate: '2027-09-03',
  status: 'ACTIVE',
  redeemable: true,
  notRedeemableReason: null,
  ...over,
});

const voucherLine = (over = {}) => ({
  id: 'pl_1', paymentType: PAYMENT_TYPES.VOUCHER, amount: 100, reference: 'EG56-RKDM-XV3K',
  metadata: { voucherNumber: 'CV-2026-000007' }, ...over,
});

const cashLine = (amount, id = 'pl_cash') => ({
  id, paymentType: PAYMENT_TYPES.CASH, amount, reference: null,
});

describe('planVoucherApplication', () => {
  it('applies the whole voucher when the bill is larger', () => {
    // 100 voucher against a 525 bill: the voucher is exhausted and 425 is still to collect.
    const plan = planVoucherApplication(voucher(), [], 525);
    expect(plan).toMatchObject({ ok: true, amount: 100, remainingOnVoucher: 0 });
  });

  it('applies only what the bill needs and leaves the rest on the voucher', () => {
    // 100 voucher against a 60 bill. A voucher can never pay out change, so the surplus keeps
    // its value for next time rather than being consumed.
    const plan = planVoucherApplication(voucher(), [], 60);
    expect(plan).toMatchObject({ ok: true, amount: 60, remainingOnVoucher: 40 });
  });

  it('applies only the balance remaining on a partly-spent voucher', () => {
    const plan = planVoucherApplication(
      voucher({ usedAmount: 60, remainingAmount: 40, status: 'PARTIALLY_REDEEMED' }), [], 525);
    expect(plan).toMatchObject({ ok: true, amount: 40, remainingOnVoucher: 0 });
  });

  it('fills only what other tenders have left outstanding', () => {
    // Cash 400 already allocated against a 525 bill leaves 125; the voucher covers 100 of it.
    const plan = planVoucherApplication(voucher(), [cashLine(400)], 525);
    expect(plan).toMatchObject({ ok: true, amount: 100 });
  });

  it('caps at the outstanding balance rather than over-allocating', () => {
    // Only 30 left to settle, so a 100 voucher gives up 30 and keeps 70. Over-allocating
    // non-cash tender is refused by the backend outright.
    const plan = planVoucherApplication(voucher(), [cashLine(495)], 525);
    expect(plan).toMatchObject({ ok: true, amount: 30, remainingOnVoucher: 70 });
  });

  // ── Refusals. Every message must name the voucher; "item not found" is never acceptable
  // for a voucher a customer is physically holding. ────────────────────────────────────────

  it('refuses an expired voucher with the server\'s own reason', () => {
    const plan = planVoucherApplication(
      voucher({ redeemable: false, notRedeemableReason: 'This voucher expired on 2026-01-01.' }), [], 525);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe('This voucher expired on 2026-01-01.');
  });

  it('refuses a cancelled voucher', () => {
    const plan = planVoucherApplication(
      voucher({ status: 'CANCELLED', redeemable: false, notRedeemableReason: 'This voucher has been cancelled.' }),
      [], 525);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe('This voucher has been cancelled.');
  });

  it('refuses a fully redeemed voucher', () => {
    const plan = planVoucherApplication(
      voucher({
        usedAmount: 100, remainingAmount: 0, status: 'FULLY_REDEEMED',
        redeemable: false, notRedeemableReason: 'This voucher has no remaining balance.',
      }), [], 525);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe('This voucher has no remaining balance.');
  });

  it('refuses an unknown code', () => {
    const plan = planVoucherApplication(null, [], 525);
    expect(plan).toMatchObject({ ok: false, reason: 'No voucher found for that code.' });
  });

  it('refuses a second scan of a voucher already on the sale', () => {
    // Whatever this bill could absorb is already committed to it; a double scan must not
    // draw the voucher twice.
    const plan = planVoucherApplication(voucher(), [voucherLine()], 525);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toContain('already applied');
  });

  it('matches an already-applied voucher regardless of code casing', () => {
    const plan = planVoucherApplication(
      voucher({ voucherCode: 'eg56-rkdm-xv3k' }), [voucherLine()], 525);
    expect(plan.ok).toBe(false);
  });

  it('accepts a second, different voucher on the same sale', () => {
    // Multiple vouchers are allowed: each is redeemed as its own allocation, under its own
    // row lock, against its own ledger.
    const plan = planVoucherApplication(
      voucher({ voucherNumber: 'CV-2026-000008', voucherCode: 'AAAA-BBBB-CCCC', remainingAmount: 50 }),
      [voucherLine()], 525);
    expect(plan).toMatchObject({ ok: true, amount: 50 });
  });

  it('refuses a voucher on an empty sale', () => {
    const plan = planVoucherApplication(voucher(), [], 0);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toContain('Add items');
  });

  it('refuses a voucher when the sale is already fully covered', () => {
    const plan = planVoucherApplication(voucher(), [cashLine(525)], 525);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toContain('already fully covered');
  });
});

describe('capVoucherAllocations', () => {
  it('leaves an allocation that still fits alone', () => {
    expect(capVoucherAllocations([voucherLine({ amount: 100 })], 525)).toEqual([]);
  });

  it('reduces a voucher when the bill shrinks below it', () => {
    // Cashier voids a line and the 525 bill drops to 60. Left at 100 the sale would be
    // refused at settlement for over-allocating non-cash tender.
    expect(capVoucherAllocations([voucherLine({ amount: 100 })], 60))
      .toEqual([{ id: 'pl_1', action: 'reduce', amount: 60 }]);
  });

  it('removes a voucher when the cart empties', () => {
    expect(capVoucherAllocations([voucherLine({ amount: 100 })], 0))
      .toEqual([{ id: 'pl_1', action: 'remove', amount: 0 }]);
  });

  it('never grows a voucher when the bill gets bigger', () => {
    // Spending more of a customer's credit than they agreed to is not a rounding decision.
    expect(capVoucherAllocations([voucherLine({ amount: 60 })], 900)).toEqual([]);
  });

  it('caps vouchers in allocation order, dropping the ones that no longer fit', () => {
    const lines = [
      voucherLine({ id: 'v1', amount: 100 }),
      voucherLine({ id: 'v2', amount: 50, reference: 'AAAA-BBBB-CCCC' }),
    ];
    expect(capVoucherAllocations(lines, 120)).toEqual([
      { id: 'v2', action: 'reduce', amount: 20 },
    ]);
  });

  it('respects other tenders already allocated when re-capping', () => {
    // 300 bill with 250 cash down leaves 50 for the voucher.
    const lines = [cashLine(250), voucherLine({ amount: 100 })];
    expect(capVoucherAllocations(lines, 300))
      .toEqual([{ id: 'pl_1', action: 'reduce', amount: 50 }]);
  });
});
