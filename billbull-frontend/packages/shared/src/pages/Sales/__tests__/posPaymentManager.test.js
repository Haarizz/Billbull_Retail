import { describe, expect, it } from 'vitest';

import { PAYMENT_TYPES, createPaymentLine } from '../POS/payments/paymentModel';
import {
  canSettle,
  changeAmount,
  isFullyAllocated,
  isOverAllocated,
  lineErrors,
  paymentMethodsUsed,
  paymentSummary,
  remainingBalance,
  totalAllocated,
  allocationTarget,
} from '../POS/payments/paymentSelectors';
import { buildCheckoutPaymentFields, buildSettlementPaymentFields } from '../POS/payments/paymentPayloadAdapter';

const lines = (...drafts) => drafts.map((d) => createPaymentLine(d));
const cash = (amount) => ({ paymentType: PAYMENT_TYPES.CASH, amount });
const card = (amount, subtype = 'Visa', reference = null) =>
  ({ paymentType: PAYMENT_TYPES.CARD, amount, paymentSubtype: subtype, reference });
const online = (amount, bankAccountId = '7') =>
  ({ paymentType: PAYMENT_TYPES.ONLINE, amount, bankAccountId });
const credit = (amount, customerCode = 'MEM-001') =>
  ({ paymentType: PAYMENT_TYPES.CREDIT, amount, customerCode });

describe('payment selectors', () => {
  it('walks an invoice down to zero across four tenders', () => {
    const l = lines(cash(80), card(10), online(50), credit(16.45));
    expect(totalAllocated(l)).toBeCloseTo(156.45, 2);
    expect(remainingBalance(l, 156.45)).toBeCloseTo(0, 2);
    expect(isFullyAllocated(l, 156.45)).toBe(true);
    expect(canSettle(l, 156.45, {})).toBe(true);
  });

  it('builds the summary in entry order, de-duplicated, and never says Mixed', () => {
    const l = lines(cash(20), cash(30), card(40, 'Visa'), card(10, 'Mastercard'));
    expect(paymentMethodsUsed(l)).toEqual(['Cash', 'Visa', 'Mastercard']);
    expect(paymentSummary(l)).toBe('Cash + Visa + Mastercard');
    expect(paymentSummary(l)).not.toContain('Mixed');
  });

  it('gives change only for cash overpayment', () => {
    expect(changeAmount(lines(cash(200)), 156.45)).toBeCloseTo(43.55, 2);
    expect(changeAmount(lines(card(40), cash(100)), 100)).toBeCloseTo(40, 2);
    // Non-cash never produces change; it is flagged as over-allocated instead.
    expect(changeAmount(lines(card(150)), 100)).toBe(0);
    expect(isOverAllocated(lines(card(150)), 100)).toBe(true);
    expect(canSettle(lines(card(150)), 100, {})).toBe(false);
  });

  it('cash overpayment is allowed but non-cash overpayment blocks settlement', () => {
    expect(canSettle(lines(cash(200)), 156.45, {})).toBe(true);
    expect(canSettle(lines(online(200)), 156.45, {})).toBe(false);
  });

  it('blocks settlement on incomplete lines', () => {
    const noCardType = lines({ paymentType: PAYMENT_TYPES.CARD, amount: 100 });
    expect(canSettle(noCardType, 100, {})).toBe(false);

    const noBank = lines({ paymentType: PAYMENT_TYPES.ONLINE, amount: 100 });
    expect(canSettle(noBank, 100, {})).toBe(false);

    const noCustomer = lines({ paymentType: PAYMENT_TYPES.CREDIT, amount: 100 });
    expect(canSettle(noCustomer, 100, {})).toBe(false);
  });

  it('flags duplicate card references', () => {
    const l = lines(card(50, 'Visa', 'AUTH-1'), card(50, 'Amex', 'auth-1'));
    const errs = lineErrors(l, {});
    expect(Object.keys(errs)).toHaveLength(2);
    expect(canSettle(l, 100, {})).toBe(false);
  });

  it('gives every line a unique id', () => {
    const l = lines(cash(10), cash(10), cash(10));
    expect(new Set(l.map((x) => x.id)).size).toBe(3);
  });

  it('treats a zero-total bill as already settled', () => {
    expect(canSettle([], 0, {})).toBe(true);
    expect(isFullyAllocated([], 0)).toBe(true);
  });
});

describe('checkout payload adapter', () => {
  it('projects the four-tender walk onto the wire shape, in order', () => {
    const l = lines(cash(80), card(10, 'Visa', 'AUTH-1'), online(50), credit(16.45));
    const fields = buildCheckoutPaymentFields(l, { effectiveDue: 156.45 });

    expect(fields.paymentAllocations.map((a) => [a.type, a.amount])).toEqual([
      ['CASH', 80], ['CARD', 10], ['ONLINE', 50], ['CREDIT', 16.45],
    ]);
    expect(fields.paymentAllocations[1].subtype).toBe('Visa');
    expect(fields.paymentAllocations[1].reference).toBe('AUTH-1');
    expect(fields.paymentMode).toBe('Cash + Visa + Online + Credit');
    expect(fields.combinedPaymentMode).toBe(fields.paymentMode);
  });

  it('never sends the word Mixed', () => {
    const fields = buildCheckoutPaymentFields(lines(cash(60), card(40)), { effectiveDue: 100 });
    expect(fields.paymentMode).toBe('Cash + Visa');
    expect(JSON.stringify(fields)).not.toContain('Mixed');
  });

  it('reports change, amount received and the credit carried forward', () => {
    const l = lines(cash(200), credit(50));
    const fields = buildCheckoutPaymentFields(l, { effectiveDue: 156.45 });
    // 200 cash against a 106.45 cash share leaves 93.55 change.
    expect(fields.changeDue).toBeCloseTo(93.55, 2);
    expect(fields.paidAmount).toBeCloseTo(106.45, 2);
    expect(fields.creditBalance).toBeCloseTo(50, 2);
    expect(fields.creditAppliedAmount).toBeCloseTo(106.45, 2);
    expect(fields.cashTaken).toBe(true);
  });

  it('credits a layaway deposit on top of what was collected now', () => {
    const fields = buildCheckoutPaymentFields(lines(cash(50)), { effectiveDue: 50, layawayDeposit: 20 });
    expect(fields.paidAmount).toBeCloseTo(70, 2);
  });

  it('only opens the drawer when cash changed hands', () => {
    expect(buildCheckoutPaymentFields(lines(card(100)), { effectiveDue: 100 }).cashTaken).toBe(false);
    expect(buildCheckoutPaymentFields(lines(cash(100)), { effectiveDue: 100 }).cashTaken).toBe(true);
  });

  it('drops zero-amount lines from the wire payload', () => {
    const fields = buildCheckoutPaymentFields(lines(cash(100), cash(0)), { effectiveDue: 100 });
    expect(fields.paymentAllocations).toHaveLength(1);
  });
});

describe('allocation editing target', () => {
  it('adds the edited line back so it can keep its own amount', () => {
    // A line that fully covers the bill leaves remaining = 0. Editing it must still allow
    // up to the full amount, not zero.
    const line = createPaymentLine(cash(156.45));
    expect(allocationTarget(0, line)).toBeCloseTo(156.45, 2);
  });

  it('is just the remaining balance when adding a new allocation', () => {
    expect(allocationTarget(76.45, null)).toBeCloseTo(76.45, 2);
  });

  it('lets an edit grow into the balance another allocation left behind', () => {
    // Cash 80 of 156.45 → remaining 76.45. Editing the cash line may go up to 156.45.
    const line = createPaymentLine(cash(80));
    expect(allocationTarget(76.45, line)).toBeCloseTo(156.45, 2);
  });
});

describe('editing preserves identity and order', () => {
  it('keeps the id and position when an amount is corrected', () => {
    const before = lines(cash(80), card(10, 'Visa'), online(50));
    const editedId = before[0].id;
    // Mirrors usePaymentManager.updateLine: patch in place, never remove-and-append.
    const after = before.map((l) => (l.id === editedId ? { ...l, amount: 90 } : l));

    expect(after.map((l) => l.id)).toEqual(before.map((l) => l.id));
    expect(after[0].amount).toBe(90);
    expect(paymentSummary(after)).toBe('Cash + Visa + Online');
  });

  it('recalculates everything after a deletion', () => {
    const before = lines(cash(80), card(10, 'Visa'), credit(66.45));
    expect(canSettle(before, 156.45, {})).toBe(true);

    const after = before.filter((l) => l.paymentType !== PAYMENT_TYPES.CREDIT);
    expect(remainingBalance(after, 156.45)).toBeCloseTo(66.45, 2);
    expect(totalAllocated(after)).toBeCloseTo(90, 2);
    expect(paymentSummary(after)).toBe('Cash + Visa');
    expect(canSettle(after, 156.45, {})).toBe(false);
  });
});

describe('payment manager mutations', () => {
  it('allows several allocations of the same type without merging them', () => {
    const l = lines(cash(20), cash(30), card(40, 'Visa'), card(10, 'Mastercard'));
    expect(l).toHaveLength(4);
    expect(totalAllocated(l)).toBeCloseTo(100, 2);
    // Two cash tenders stay two rows; the summary collapses only the label.
    expect(paymentSummary(l)).toBe('Cash + Visa + Mastercard');
    expect(canSettle(l, 100, {})).toBe(true);
  });

  it('keeps several online transfers separate, one per receiving bank', () => {
    const l = lines(online(50, '1'), online(20, '2'), online(30, '3'));
    expect(l).toHaveLength(3);
    expect(l.map((x) => x.bankAccountId)).toEqual(['1', '2', '3']);
    expect(canSettle(l, 100, {})).toBe(true);
  });

  it('handles a credit allocation carrying the remainder to the customer account', () => {
    const l = lines(cash(80), card(10, 'Visa'), online(50), credit(16.45));
    const fields = buildCheckoutPaymentFields(l, { effectiveDue: 156.45 });
    expect(fields.creditBalance).toBeCloseTo(16.45, 2);
    expect(fields.creditCustomer).toEqual({ code: 'MEM-001', name: null });
    expect(fields.amountReceived).toBeCloseTo(140, 2);
  });

  it('lets cash overpay and reports the change, without over-allocating', () => {
    const l = lines(card(56.45, 'Visa'), cash(200));
    expect(isOverAllocated(l, 156.45)).toBe(false);
    expect(changeAmount(l, 156.45)).toBeCloseTo(100, 2);
    expect(canSettle(l, 156.45, {})).toBe(true);
  });

  // Customer Advance was retired as a checkout tender: an advance is a customer-ledger
  // balance, received and applied from the Customer module. A stale client that still sends
  // one must not be able to settle a sale with it.
  it('refuses to settle on a Customer Advance allocation', () => {
    const l = lines({ paymentType: 'ADVANCE', amount: 100 });
    expect(canSettle(l, 100)).toBe(false);
  });
});

describe('settlement payload adapter — every flow, one builder', () => {
  it('projects a delivery-balance settlement onto the same wire shape as checkout', () => {
    const l = lines(cash(60), card(40, 'Visa', 'AUTH-7'));
    const fields = buildSettlementPaymentFields(l, { amountDue: 100 });

    expect(fields.paymentAllocations.map((a) => [a.type, a.amount])).toEqual([
      ['CASH', 60], ['CARD', 40],
    ]);
    expect(fields.paymentMode).toBe('Cash + Visa');
    expect(fields.amountTendered).toBe(100);
    expect(fields.changeDue).toBe(0);
  });

  it('caps the tendered figure at the amount due and reports cash change', () => {
    const fields = buildSettlementPaymentFields(lines(cash(200)), { amountDue: 156.45 });
    expect(fields.amountTendered).toBe(156.45);
    expect(fields.changeDue).toBeCloseTo(43.55, 2);
  });

  it('supports a layaway deposit that only partly covers the sale', () => {
    // Unlike a sale, a deposit need not settle the bill — the rest becomes the balance.
    const fields = buildSettlementPaymentFields(lines(cash(50)), { amountDue: 200 });
    expect(fields.amountTendered).toBe(50);
    expect(fields.paymentMode).toBe('Cash');
  });

  it('carries several cards and several online transfers as separate allocations', () => {
    const l = lines(card(40, 'Visa'), card(10, 'Mastercard'), online(30, '1'), online(20, '2'));
    const fields = buildSettlementPaymentFields(l, { amountDue: 100 });
    expect(fields.paymentAllocations).toHaveLength(4);
    expect(fields.paymentMode).toBe('Visa + Mastercard + Online');
  });

  it('never emits the word Mixed for any settlement flow', () => {
    const l = lines(cash(60), card(40, 'Visa'));
    expect(JSON.stringify(buildSettlementPaymentFields(l, { amountDue: 100 }))).not.toContain('Mixed');
    expect(JSON.stringify(buildCheckoutPaymentFields(l, { effectiveDue: 100 }))).not.toContain('Mixed');
  });

  it('applies identical validation to a settlement as to a checkout', () => {
    // Same selectors, so the rules cannot drift between screens.
    expect(canSettle(lines(card(150, 'Visa')), 100, {})).toBe(false); // card may not overpay
    expect(canSettle(lines(cash(150)), 100, {})).toBe(true);          // cash may
    expect(canSettle(lines(online(100, '')), 100, {})).toBe(false);   // bank account required
    expect(canSettle(lines(card(50, 'Visa', 'R1'), card(50, 'Amex', 'r1')), 100, {})).toBe(false);
  });
});
