import { describe, expect, it } from 'vitest';

import { buildPosCheckoutItems, computePosCartTotals } from '../POS/posUtils';
import { PAYMENT_TYPES, createPaymentLine } from '../POS/payments/paymentModel';
import { buildCheckoutPaymentFields } from '../POS/payments/paymentPayloadAdapter';
import { totalAllocated } from '../POS/payments/paymentSelectors';
import {
  EXCLUSIVE_5,
  INCLUSIVE_5,
  TAX_DISABLED,
  SCENARIO_A_SIMPLE_CASH,
  SCENARIO_J_CHECKOUT,
  line,
} from './fixtures/posCartFixtures';

/**
 * CHARACTERIZATION SUITE — the POST /api/pos/checkout request body.
 *
 * The payload has two financially meaningful halves, both built by pure production code:
 *
 *   items                -> posUtils.buildPosCheckoutItems
 *   payment* + totals    -> payments/paymentPayloadAdapter.buildCheckoutPaymentFields
 *
 * The remaining fields POSSales assembles around them (customerCode, sessionId,
 * terminalId, branchId, billDiscountAmount, taxInclusive, shipping/delivery, supervisor
 * override credentials) are plain reads off component state with no arithmetic. They are
 * deliberately NOT mirrored here: re-implementing that object in a test would assert the
 * copy rather than production, which is the opposite of characterization. Their shape is
 * recorded in the "payload field inventory" test at the bottom as documentation only.
 *
 * buildPosCheckoutItems was lifted verbatim out of POSSales.handleCompleteCheckout as the
 * one test seam this suite required — the projection is what the backend posts stock and
 * GL from, and it was previously unreachable from any test.
 */

const lines = (...drafts) => drafts.map((d) => createPaymentLine(d));
const cash = (amount) => ({ paymentType: PAYMENT_TYPES.CASH, amount });
const card = (amount, paymentSubtype = 'Visa', reference = null) =>
  ({ paymentType: PAYMENT_TYPES.CARD, amount, paymentSubtype, reference });
const online = (amount, bankAccountId = '7', bankAccountName = 'ADCB Current') =>
  ({ paymentType: PAYMENT_TYPES.ONLINE, amount, bankAccountId, bankAccountName });
const credit = (amount, customerCode = 'CUST-001', customerName = 'Acme Trading') =>
  ({ paymentType: PAYMENT_TYPES.CREDIT, amount, customerCode, customerName });

/** Client-generated line ids are nondeterministic (Date.now + sequence) — drop them. */
const stripIds = (allocations) => allocations.map(({ ...a }) => a);

describe('buildPosCheckoutItems — the items array', () => {
  it('projects a full cart onto the exact wire shape', () => {
    const items = buildPosCheckoutItems(SCENARIO_J_CHECKOUT.items, EXCLUSIVE_5);

    expect(items).toEqual([
      {
        itemCode: 'SKU-900',
        itemName: 'Batched',
        quantity: 2,
        unit: 'Each',
        price: 30,
        discount: 0,
        taxRate: 5,
        batchNumber: 'BATCH-A',
        serialNumber: null,
        voided: false,
      },
      {
        itemCode: 'PRD-901',      // no code -> falls back to productId
        itemName: 'Serialised',
        quantity: 1,
        unit: 'Each',
        price: 500,
        discount: 0,
        taxRate: 5,
        batchNumber: null,
        serialNumber: 'SN-001',
        voided: false,
      },
      {
        itemCode: 'j3',           // no code, no productId -> falls back to the cart-line id
        itemName: 'No code, no taxRate',
        quantity: 3,
        unit: 'Each',
        price: 12,
        discount: 0,
        taxRate: 0,               // see the null-taxRate quirk below
        batchNumber: null,
        serialNumber: null,
        voided: false,
      },
      {
        itemCode: 'SKU-903',
        itemName: 'Voided w/ batch',
        quantity: 1,
        unit: 'Each',
        price: 99,
        discount: 0,
        taxRate: 5,
        batchNumber: null,        // stripped because the line is voided
        serialNumber: null,       // stripped because the line is voided
        voided: true,
      },
    ]);
  });

  it('sends voided lines through, flagged rather than dropped', () => {
    const items = buildPosCheckoutItems(SCENARIO_J_CHECKOUT.items, EXCLUSIVE_5);
    expect(items).toHaveLength(SCENARIO_J_CHECKOUT.items.length);
    expect(items.filter((i) => i.voided)).toHaveLength(1);
  });

  it('always reports unit as the literal string "Each"', () => {
    // CHARACTERIZED QUIRK: the cart supports multi-unit pricing (a CTN line is a
    // resolved per-unit price), but the payload hard-codes "Each" for every line, so
    // the unit of sale is not recoverable from the checkout request. The resolved
    // price still carries the conversion, so money is correct; only the unit label is
    // lost. Left unchanged.
    const items = buildPosCheckoutItems(
      [line({ id: 'u', code: 'SKU-700', name: 'Juice CTN(12)', price: 36, quantity: 2, taxRate: 5 })],
      EXCLUSIVE_5,
    );
    expect(items[0].unit).toBe('Each');
  });

  it('CHARACTERIZED QUIRK: a null line taxRate is posted as 0%, not as the branch default', () => {
    // Same Number.isFinite/Number(null)===0 behaviour the cart totals have. The cart
    // preview and the posted payload agree with each other — both say 0 — so this is
    // consistent, but a 5% branch silently posts an untaxed line.
    const nulled = buildPosCheckoutItems(
      [line({ id: 'n', code: 'S', price: 100, quantity: 1, taxRate: null })], EXCLUSIVE_5,
    );
    expect(nulled[0].taxRate).toBe(0);

    const undef = buildPosCheckoutItems(
      [{ id: 'u', code: 'S', name: 'x', price: 100, quantity: 1 }], EXCLUSIVE_5,
    );
    expect(undef[0].taxRate).toBe(5);
  });

  it('zeroes the fallback rate when the branch Tax Enabled switch is off', () => {
    const items = buildPosCheckoutItems(
      [{ id: 'u', code: 'S', name: 'x', price: 100, quantity: 1 }], TAX_DISABLED,
    );
    expect(items[0].taxRate).toBe(0);
  });

  it('normalises a missing discount to 0 and a missing void flag to false', () => {
    const items = buildPosCheckoutItems(
      [{ id: 'x', code: 'S', name: 'x', price: 10, quantity: 1, taxRate: 5 }], EXCLUSIVE_5,
    );
    expect(items[0].discount).toBe(0);
    expect(items[0].voided).toBe(false);
  });

  it('returns an empty array for an empty or missing cart', () => {
    expect(buildPosCheckoutItems([], EXCLUSIVE_5)).toEqual([]);
    expect(buildPosCheckoutItems(undefined, EXCLUSIVE_5)).toEqual([]);
  });

  it('does not round prices, quantities or discounts', () => {
    // The payload carries the raw cart values; 2dp rounding happens only on the
    // payment allocations. A weighed line therefore posts its full precision.
    const items = buildPosCheckoutItems(
      [line({ id: 'w', code: 'S', price: 13.333, quantity: 0.375, discount: 7.5, taxRate: 5 })],
      EXCLUSIVE_5,
    );
    expect(items[0].price).toBe(13.333);
    expect(items[0].quantity).toBe(0.375);
    expect(items[0].discount).toBe(7.5);
  });

  it('CHARACTERIZED DIVERGENCE: main checkout ignores voidMode=DELETE, other flows honour it', () => {
    // POSSales.cartItemsToPayload (used by the delivery-order, hold and layaway
    // payloads) filters voided lines out entirely when posSettings.voidMode ===
    // 'DELETE'. The main checkout projection applies no such filter, so the same cart
    // posts a different item list depending on which flow sends it. cartItemsToPayload
    // is a useCallback inside the component and is not reachable from a test; this
    // asserts the half that is, and records the divergence.
    const deleteMode = { ...EXCLUSIVE_5, voidMode: 'DELETE' };
    const items = buildPosCheckoutItems(SCENARIO_J_CHECKOUT.items, deleteMode);
    expect(items).toHaveLength(4);
    expect(items.some((i) => i.voided)).toBe(true);
  });
});

describe('buildCheckoutPaymentFields — the payment half of the payload', () => {
  const DUE = 624; // scenario J grand total, verified by the cart-totals suite

  it('matches the cart total the payment legs are settling', () => {
    const t = computePosCartTotals(
      SCENARIO_J_CHECKOUT.items, SCENARIO_J_CHECKOUT.billDiscountAmount, EXCLUSIVE_5,
    );
    expect(t.total).toBeCloseTo(DUE, 6);
  });

  it('scenario J · three tenders settling the bill exactly', () => {
    const l = lines(cash(200), card(300, 'Visa', 'AUTH-77'), online(124));
    const f = buildCheckoutPaymentFields(l, { effectiveDue: DUE });

    expect(stripIds(f.paymentAllocations)).toEqual([
      { type: 'CASH', subtype: null, amount: 200, reference: null, bankAccountName: null },
      { type: 'CARD', subtype: 'Visa', amount: 300, reference: 'AUTH-77', bankAccountName: null },
      { type: 'ONLINE', subtype: null, amount: 124, reference: null, bankAccountName: 'ADCB Current' },
    ]);
    expect(f.paymentMode).toBe('Cash + Visa + Online');
    expect(f.combinedPaymentMode).toBe('Cash + Visa + Online');
    expect(f.changeDue).toBe(0);
    expect(f.paidAmount).toBe(624);
    expect(f.amountReceived).toBe(624);
    expect(f.creditBalance).toBe(0);
    expect(f.creditAppliedAmount).toBe(624);
    expect(f.cashTaken).toBe(true);
    expect(f.creditCustomer).toBe(null);
    expect(totalAllocated(l)).toBeCloseTo(DUE, 6);
  });

  it('scenario J · cash overpayment produces change, never a negative balance', () => {
    const f = buildCheckoutPaymentFields(lines(cash(700)), { effectiveDue: DUE });

    expect(f.changeDue).toBe(76);          // 700 - 624
    expect(f.amountReceived).toBe(624);    // collected, net of the change handed back
    expect(f.paidAmount).toBe(624);
    expect(f.creditBalance).toBe(0);
    expect(f.cashTaken).toBe(true);
  });

  it('scenario J · part cash, remainder carried to the customer account', () => {
    const f = buildCheckoutPaymentFields(
      lines(cash(400), credit(224, 'CUST-001', 'Acme Trading')),
      { effectiveDue: DUE },
    );

    expect(f.paymentMode).toBe('Cash + Credit');
    expect(f.amountReceived).toBe(400);        // credit is an allocation, not a receipt
    expect(f.creditBalance).toBe(224);         // carried forward on the ledger
    expect(f.creditAppliedAmount).toBe(400);   // settled against this invoice now
    expect(f.creditCustomer).toEqual({ code: 'CUST-001', name: 'Acme Trading' });
    expect(f.changeDue).toBe(0);
  });

  it('scenario J · a layaway deposit is credited on top of what was collected now', () => {
    // effectiveDue is already net of the deposit; paidAmount adds it back so the
    // receipt shows the full amount the customer has paid against the sale.
    const f = buildCheckoutPaymentFields(lines(cash(400)), {
      effectiveDue: 400,
      layawayDeposit: 224,
    });
    expect(f.amountReceived).toBe(400);
    expect(f.paidAmount).toBe(624);
    expect(f.changeDue).toBe(0);
  });

  it('rounds every posted amount to 2dp', () => {
    const f = buildCheckoutPaymentFields(lines(cash(33.333), card(66.667)), {
      effectiveDue: 100,
    });
    expect(f.paymentAllocations.map((a) => a.amount)).toEqual([33.33, 66.67]);
    expect(f.paidAmount).toBe(100);
  });

  it('opens the drawer only when physical cash changed hands', () => {
    expect(buildCheckoutPaymentFields(lines(card(624)), { effectiveDue: DUE }).cashTaken).toBe(false);
    expect(buildCheckoutPaymentFields(lines(cash(624)), { effectiveDue: DUE }).cashTaken).toBe(true);
  });

  it('does not send the legacy per-mode scalars', () => {
    // cashAmount / cardAmount / cardLegs / amountTendered cannot express several cards
    // or a cash overpayment alongside a credit balance; the backend ignores them
    // whenever paymentAllocations is present, so this screen stopped sending them.
    const f = buildCheckoutPaymentFields(lines(cash(200), card(424)), { effectiveDue: DUE });
    expect(f).not.toHaveProperty('cashAmount');
    expect(f).not.toHaveProperty('cardAmount');
    expect(f).not.toHaveProperty('cardLegs');
    expect(f).not.toHaveProperty('amountTendered');
  });
});

describe('items and payments agree — the invariant that must survive extraction', () => {
  const cases = [
    ['simple cash sale', SCENARIO_A_SIMPLE_CASH, EXCLUSIVE_5],
    ['checkout cart', SCENARIO_J_CHECKOUT, EXCLUSIVE_5],
    ['checkout cart, inclusive VAT', SCENARIO_J_CHECKOUT, INCLUSIVE_5],
  ];

  it.each(cases)('%s · allocations settle exactly the cart total', (_name, scenario, posSettings) => {
    const totals = computePosCartTotals(scenario.items, scenario.billDiscountAmount, posSettings);
    const due = Math.round(totals.total * 100) / 100;

    const f = buildCheckoutPaymentFields(lines(cash(due)), { effectiveDue: due });

    expect(f.amountReceived).toBeCloseTo(due, 2);
    expect(f.changeDue).toBe(0);
    expect(f.creditBalance).toBe(0);
    expect(f.creditAppliedAmount).toBeCloseTo(due, 2);
  });

  it.each(cases)('%s · every non-voided cart line reaches the payload', (_name, scenario, posSettings) => {
    const items = buildPosCheckoutItems(scenario.items, posSettings);
    const active = scenario.items.filter((i) => !i.isVoided);
    expect(items.filter((i) => !i.voided)).toHaveLength(active.length);
  });
});

describe('payload field inventory — documentation, not a behavioural assertion', () => {
  it('records the scalar fields POSSales assembles around items and payments', () => {
    // Recorded so the extraction has a checklist. These are direct reads off component
    // state with no arithmetic, which is why they are documented rather than mirrored.
    const CHECKOUT_SCALAR_FIELDS = [
      'customerCode',        // customer.id !== 'walk-in' ? (code || id) : 'WALK-IN'
      'customerName',
      'paymentMode',         // from buildCheckoutPaymentFields
      'combinedPaymentMode', // from buildCheckoutPaymentFields
      'paymentAllocations',  // from buildCheckoutPaymentFields
      'sessionId',
      'terminalId',
      'counterName',
      'branchId',
      'branchName',
      'branchCode',
      'billDiscountAmount',
      'shippingAddress',
      'shippingCharge',      // null when not > 0 — an untaxed flat add, not a cart line
      'taxInclusive',
      'driverName',          // null when 'Unassigned'
      'deliveryNotes',
      'items',               // from buildPosCheckoutItems
      'supervisorOverridePin',
      'supervisorOverrideEmail',
      'supervisorOverridePassword',
    ];
    expect(CHECKOUT_SCALAR_FIELDS).toHaveLength(21);
    expect(CHECKOUT_SCALAR_FIELDS).toContain('items');
    expect(CHECKOUT_SCALAR_FIELDS).toContain('paymentAllocations');
  });
});
