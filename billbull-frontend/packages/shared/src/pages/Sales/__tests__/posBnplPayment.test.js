import { describe, expect, it } from 'vitest';

import {
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  createPaymentLine,
  lineLabel,
  validateLine,
} from '../POS/payments/paymentModel';
import { allocationLabel, bnplProviderFromMode, buildPaymentBlockFromRecords } from '../POS/payments/paymentPresentation';
import { buildPaymentAllocationsPayload, buildCheckoutPaymentFields } from '../POS/payments/paymentPayloadAdapter';
import { isOverAllocated, paymentSummary, totalOfType } from '../POS/payments/paymentSelectors';
import { confirmActionLabel, suggestedNextMethod } from '../POS/payments/paymentFlow';
import {
  findBnplProvider,
  firstPaymentDate,
  formatBnplDate,
  generateBnplReference,
  installmentSchedule,
  planChipLabel,
  planFee,
  planInstallmentAmount,
  planSummary,
  planTotalPayable,
} from '../POS/payments/bnplProviders';

/**
 * Buy Now, Pay Later as a POS payment method.
 *
 * The rule everything here protects: BNPL is *money received*, not credit extended. The
 * provider settles the sale in full and carries the customer's installments itself, so a
 * financed sale must leave nothing on the store's receivable.
 */

const bnplLine = (amount, { provider = 'Tabby', reference = 'BNPL-79109320', plan = null } = {}) =>
  createPaymentLine({
    paymentType: PAYMENT_TYPES.BNPL,
    paymentSubtype: provider,
    amount,
    reference,
    metadata: plan ? { bnplProviderId: 'tabby', bnplPlanId: plan.id, bnplPlanLabel: plan.label } : null,
  });

describe('BNPL payment method', () => {
  it('is a recognised tender with a customer-facing label', () => {
    expect(PAYMENT_TYPES.BNPL).toBe('BNPL');
    expect(PAYMENT_TYPE_LABELS[PAYMENT_TYPES.BNPL]).toBe('BNPL');
  });

  it('requires a provider and an approval reference', () => {
    expect(validateLine(bnplLine(100))).toBeNull();

    const noProvider = createPaymentLine({
      paymentType: PAYMENT_TYPES.BNPL, amount: 100, reference: 'BNPL-1',
    });
    expect(validateLine(noProvider)).toMatch(/provider/i);

    const noReference = createPaymentLine({
      paymentType: PAYMENT_TYPES.BNPL, amount: 100, paymentSubtype: 'Tabby',
    });
    expect(validateLine(noReference)).toMatch(/reference/i);
  });

  it('summarises by rail and labels by provider', () => {
    // "BNPL" in the summary, the provider named on the detail row — same split as Card/Visa.
    expect(lineLabel(bnplLine(100))).toBe('BNPL');
    expect(paymentSummary([bnplLine(100)])).toBe('BNPL');
    expect(allocationLabel(bnplLine(100))).toBe('BNPL · Tabby');
    expect(allocationLabel(createPaymentLine({ paymentType: PAYMENT_TYPES.BNPL, amount: 1 })))
      .toBe('Buy Now Pay Later');
  });

  it('settles the invoice rather than putting it on the customer ledger', () => {
    const fields = buildCheckoutPaymentFields([bnplLine(93.45)], { effectiveDue: 93.45 });

    expect(fields.amountReceived).toBe(93.45);
    expect(fields.creditBalance).toBe(0);
    expect(fields.changeDue).toBe(0);
    // No cash changed hands, so the drawer must stay shut.
    expect(fields.cashTaken).toBe(false);
    expect(fields.paymentSummary).toBe('BNPL');
  });

  it('sends the provider as the subtype and the approval reference on the wire', () => {
    const [allocation] = buildPaymentAllocationsPayload([bnplLine(93.45)]);

    expect(allocation).toMatchObject({
      type: 'BNPL',
      subtype: 'Tabby',
      amount: 93.45,
      reference: 'BNPL-79109320',
    });
  });

  it('cannot be over-allocated — a provider never gives change', () => {
    expect(isOverAllocated([bnplLine(120)], 100)).toBe(true);
    expect(isOverAllocated([bnplLine(100)], 100)).toBe(false);
  });

  it('splits with other tenders', () => {
    const lines = [
      bnplLine(60),
      createPaymentLine({ paymentType: PAYMENT_TYPES.CASH, amount: 40 }),
    ];
    expect(totalOfType(lines, PAYMENT_TYPES.BNPL)).toBe(60);
    expect(paymentSummary(lines)).toBe('BNPL + Cash');
  });

  it('is never suggested as the next tender, but chains away from itself', () => {
    const offered = [PAYMENT_TYPES.CASH, PAYMENT_TYPES.CARD, PAYMENT_TYPES.BNPL];
    // Financing is the customer's decision, so the till never nudges a cashier into it.
    expect(suggestedNextMethod(PAYMENT_TYPES.CASH, 200, offered)).not.toBe(PAYMENT_TYPES.BNPL);
    // A partially financed basket still rolls on to the next tender.
    expect(suggestedNextMethod(PAYMENT_TYPES.BNPL, 200, offered)).toBe(PAYMENT_TYPES.CASH);
    expect(confirmActionLabel({
      currentType: PAYMENT_TYPES.BNPL, remainingAfter: 0, offeredTypes: offered,
    })).toBe('Confirm BNPL');
  });

  it('reads a recorded BNPL leg back with its provider', () => {
    // The backend records the mode as "BNPL Tabby" so every report buckets it by rail.
    expect(bnplProviderFromMode('BNPL Tabby')).toBe('Tabby');
    expect(bnplProviderFromMode('BNPL')).toBeNull();

    const block = buildPaymentBlockFromRecords(
      [{ label: 'BNPL Tabby', type: 'BNPL', amount: 93.45, reference: 'BNPL-79109320' }],
      { invoiceTotal: 93.45 },
    );
    expect(block.details[0].label).toBe('BNPL · Tabby');
    expect(block.totalReceived).toBe(93.45);
    expect(block.transferredToAr).toBe(0);
  });
});

describe('BNPL installment plans', () => {
  it('splits an amount into installments that add back up exactly', () => {
    const schedule = installmentSchedule(93.45, 6);
    expect(schedule).toHaveLength(6);
    expect(schedule.reduce((a, b) => a + b, 0)).toBeCloseTo(93.45, 2);
    // The odd fils lands on the first payment, not the last.
    expect(schedule[0]).toBeGreaterThanOrEqual(schedule[5]);
  });

  it('returns nothing for a plan that cannot be paid', () => {
    expect(installmentSchedule(0, 4)).toEqual([]);
    expect(installmentSchedule(100, 0)).toEqual([]);
  });

  it('describes a plan for the row and the receipt', () => {
    const tabby = findBnplProvider('tabby');
    expect(planSummary(tabby.plans[0], 100)).toBe('Pay in 4 · 4 x 25.00');
    expect(planSummary(null, 100)).toBeNull();
  });

  it('charges the plan fee to the customer, never to the sale', () => {
    const [payIn4, payIn6] = findBnplProvider('tabby').plans;

    // Interest-free: the customer pays exactly what the store financed.
    expect(planFee(93.45, payIn4)).toBe(0);
    expect(planTotalPayable(93.45, payIn4)).toBe(93.45);

    // 2% plan: the fee is the provider's charge to the customer, on top of the same
    // financed amount — the store still banks 93.45.
    expect(planFee(93.45, payIn6)).toBe(1.87);
    expect(planTotalPayable(93.45, payIn6)).toBe(95.32);
    expect(planInstallmentAmount(93.45, payIn6)).toBe(15.89);
  });

  it('multiplies out a rate quoted per month', () => {
    // 12 months at 1.9% p.m. is not 1.9% — quoting it flat would understate the customer's
    // own total by an order of magnitude.
    const monthly = findBnplProvider('nomad').plans[1];
    expect(monthly.perMonth).toBe(true);
    expect(planFee(1000, monthly)).toBe(228);
    expect(planChipLabel(monthly)).toBe('12 Months · 1.9% p.m.');
    expect(planChipLabel(findBnplProvider('tabby').plans[0])).toBe('Pay in 4 · 0%');
  });

  it('dates the first installment one cycle after the sale', () => {
    const sale = new Date(2026, 7, 31); // 31 Aug 2026
    const [fortnightly, monthly] = findBnplProvider('tabby').plans;

    expect(formatBnplDate(firstPaymentDate(fortnightly, sale))).toBe('14 Sep 2026');
    expect(formatBnplDate(firstPaymentDate(monthly, sale))).toBe('01 Oct 2026');
    expect(formatBnplDate(null)).toBe('');
  });

  it('always has a reference to record the leg against', () => {
    expect(generateBnplReference()).toMatch(/^BNPL-\d{8}$/);
  });
});
