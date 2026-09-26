import { describe, expect, it } from 'vitest';

import { PAYMENT_TYPES, createPaymentLine } from '../POS/payments/paymentModel';
import {
  AR_LABEL,
  AR_LABEL_SHORT,
  MIN_PAYMENT_LABEL_COLUMNS,
  PAYMENT_FILTERS,
  RECONCILIATION_TOLERANCE,
  allocationLabel,
  allocationLabelAr,
  bankDisplayName,
  bnplProviderFromMode,
  buildPaymentBlock,
  buildPaymentBlockFromRecords,
  matchesPaymentFilter,
  paymentAuditSnapshot,
  paymentBlockRows,
  paymentDetailsForExport,
  reconcilePaymentBlock,
  summaryLabelForModes,
  wrapPaymentLabel,
} from '../POS/payments/paymentPresentation';
import { buildThermalReceiptHtml, buildThermalReceiptText } from '../POS/posPrintUtils';
import { INVOICE_PERSISTED_EXCLUSIVE, STORE } from './fixtures/posPrintFixtures';

/**
 * CHARACTERIZATION SUITE — paymentPresentation.js, the POS money-presentation layer.
 *
 * This module is the single source of how a tender is WORDED and which rows a receipt
 * prints. Four renderers consume it (ESC/POS, thermal HTML, bilingual canvas, the
 * BillBull A4 receipt) plus the back-office panels, so a change here changes every
 * printed and on-screen payment block at once.
 *
 * SCOPE — this file deliberately does NOT re-cover what posPaymentPresentation.test.js
 * already asserts (the happy-path block shapes, renderer parity, reconciliation findings,
 * the audit snapshot, and basic label wrapping). It characterizes the gaps around them:
 * rounding, null/undefined/zero/negative handling, defaulted options, conditional row
 * suppression, the label-budget floor, the record→allocation mapping, the filter and
 * export helpers, and the boundary where the block reaches a receipt builder.
 *
 * Payment lines are built with the real createPaymentLine from paymentModel — the same
 * factory the till uses — so no invented DTO appears anywhere in this file.
 */

const lines = (...drafts) => drafts.map((d) => createPaymentLine(d));
const cash = (amount) => ({ paymentType: PAYMENT_TYPES.CASH, amount });
const card = (amount, paymentSubtype = 'Visa', reference = null) =>
  ({ paymentType: PAYMENT_TYPES.CARD, amount, paymentSubtype, reference });
// ONLINE labels read paymentSubtype (the bank display name); bankAccountName is what the
// wire payload carries. Both are set here, as the live checkout sets them.
const online = (amount, paymentSubtype = null, bankAccountName = '1010 - FAB Current') =>
  ({ paymentType: PAYMENT_TYPES.ONLINE, amount, bankAccountId: '7', paymentSubtype, bankAccountName });
const credit = (amount, customerCode = 'CUST-001') =>
  ({ paymentType: PAYMENT_TYPES.CREDIT, amount, customerCode });
const voucher = (amount, reference = 'EDZHPBCR8C65') =>
  ({ paymentType: PAYMENT_TYPES.VOUCHER, amount, reference });
const bnpl = (amount, paymentSubtype = 'Tabby', reference = 'T-1') =>
  ({ paymentType: PAYMENT_TYPES.BNPL, amount, paymentSubtype, reference });

/** Row tuples, the shape most assertions below compare against. */
const rowTuples = (rows) => rows.map((r) => [r.label, r.amount, r.emphasis]);

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · round2 — the module's only rounding rule, applied to every money field
 * ══════════════════════════════════════════════════════════════════════════ */

describe('2-decimal rounding', () => {
  const amountOf = (v) => buildPaymentBlock(lines(cash(v)), { invoiceTotal: v }).details[0].amount;

  it('rounds a half fils up when the float representation allows it', () => {
    expect(amountOf(0.005)).toBe(0.01);
    expect(amountOf(0.015)).toBe(0.02);
    expect(amountOf(2.675)).toBe(2.68);
    expect(amountOf(10.555)).toBe(10.56);
  });

  it('CHARACTERIZED QUIRK: round2 is Math.round(n*100)/100, so some halves round DOWN', () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE-754, so Math.round yields 100 and the
    // amount prints as 1.00 rather than 1.01. The rule is not "half up" — it is "half up
    // on whatever the multiplication produced". Deterministic, and left as-is.
    expect(1.005 * 100).toBe(100.49999999999999);
    expect(amountOf(1.005)).toBe(1);
    expect(amountOf(1.0049999)).toBe(1);
  });

  it('applies the same rounding to every derived figure, not just the detail rows', () => {
    const block = buildPaymentBlock(lines(cash(33.333), card(66.667)), { invoiceTotal: 99.999 });

    expect(block.details.map((d) => d.amount)).toEqual([33.33, 66.67]);
    expect(block.invoiceTotal).toBe(100);
    expect(block.totalReceived).toBe(100);
    expect(block.changeAmount).toBe(0);
  });

  it('CHARACTERIZED QUIRK: rounded detail rows need not sum to the rounded total', () => {
    // Each field is rounded independently from the raw values, so a receipt can show
    // rows that do not visibly add up to their own footer.
    const block = buildPaymentBlock(lines(cash(0.005), cash(0.005)), { invoiceTotal: 0.01 });
    expect(block.details.map((d) => d.amount)).toEqual([0.01, 0.01]);   // 0.02 on paper
    expect(block.totalReceived).toBe(0.01);                             // footer says 0.01
  });

  it('rounds the receivable and the change independently of the tenders', () => {
    const block = buildPaymentBlock(lines(cash(100.004), credit(49.996)), { invoiceTotal: 150 });
    expect(block.transferredToAr).toBe(50);
    expect(block.details[1].amount).toBe(50);
    expect(block.changeAmount).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · Missing, null, zero and negative input
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildPaymentBlock — absent and degenerate input', () => {
  it('returns null rather than an empty block when there is nothing to print', () => {
    expect(buildPaymentBlock([], { invoiceTotal: 100 })).toBe(null);
    expect(buildPaymentBlock(null, { invoiceTotal: 100 })).toBe(null);
    expect(buildPaymentBlock(undefined, { invoiceTotal: 100 })).toBe(null);
    // A reprint of a historical invoice takes this path; the renderer then falls back
    // to the stored cashGiven/changeAmount.
  });

  it('filters out null and undefined entries before deciding', () => {
    const block = buildPaymentBlock([null, undefined, ...lines(cash(10))], { invoiceTotal: 10 });
    expect(block.details).toHaveLength(1);
    expect(block.details[0].label).toBe('Cash');

    expect(buildPaymentBlock([null, undefined], { invoiceTotal: 10 })).toBe(null);
  });

  it('drops every non-positive amount — zero, negative, null, undefined and NaN', () => {
    [0, -5, null, undefined, NaN].forEach((amount) => {
      expect(buildPaymentBlock([{ paymentType: PAYMENT_TYPES.CASH, amount }], { invoiceTotal: 10 }))
        .toBe(null);
    });
  });

  it('keeps positive tenders when only some are non-positive', () => {
    const block = buildPaymentBlock([
      { paymentType: PAYMENT_TYPES.CASH, amount: 0 },
      { paymentType: PAYMENT_TYPES.CARD, amount: 50, paymentSubtype: 'Visa' },
      { paymentType: PAYMENT_TYPES.CASH, amount: -1 },
    ], { invoiceTotal: 50 });

    expect(block.details).toHaveLength(1);
    expect(block.details[0].label).toBe('Visa');
    expect(block.summaryLabel).toBe('Visa');
  });

  it('CHARACTERIZED QUIRK: a numeric STRING amount survives the filter and is printed', () => {
    // The guard is `l.amount > 0`, which coerces. createPaymentLine would have parsed a
    // string to a number, but buildPaymentBlock is also called with plain objects (see
    // buildPaymentBlockFromRecords), so a string can reach it.
    const block = buildPaymentBlock([{ paymentType: PAYMENT_TYPES.CASH, amount: '12.5' }], { invoiceTotal: 12.5 });
    expect(block.details[0].amount).toBe(12.5);
    expect(typeof block.details[0].amount).toBe('number');   // round2 coerces it back
  });

  it('CHARACTERIZED QUIRK: omitting the options object reports the whole tender as change', () => {
    // invoiceTotal defaults to 0, so changeAmount becomes the full amount and
    // totalReceived becomes 0 — a receipt printed from this block would say the customer
    // paid nothing and got everything back. Every real caller passes invoiceTotal.
    const block = buildPaymentBlock(lines(cash(50)));

    expect(block.invoiceTotal).toBe(0);
    expect(block.changeAmount).toBe(50);
    expect(block.totalReceived).toBe(0);
    expect(reconcilePaymentBlock(block).consistent).toBe(true);   // 0 + 0 == 0
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · Labels — including the fallbacks the existing suite does not reach
 * ══════════════════════════════════════════════════════════════════════════ */

describe('allocationLabel', () => {
  it('names each tender the way a customer reads it', () => {
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.CASH })).toBe('Cash');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.CARD, paymentSubtype: 'Mastercard' })).toBe('Mastercard');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.ONLINE, paymentSubtype: 'FAB' })).toBe('FAB Online');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.ONLINE })).toBe('Online');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.BNPL, paymentSubtype: 'Tabby' })).toBe('BNPL · Tabby');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.BNPL })).toBe('Buy Now Pay Later');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.VOUCHER, reference: 'ABC123' })).toBe('Voucher ABC123');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.VOUCHER })).toBe('Credit Voucher');
  });

  it('spells the receivable out in full, abbreviating only on request', () => {
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.CREDIT })).toBe(AR_LABEL);
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.CREDIT }, { short: true })).toBe(AR_LABEL_SHORT);
    expect(AR_LABEL).toBe('Transferred to Accounts Receivable');
    expect(AR_LABEL_SHORT).toBe('Transferred to A/R');
  });

  it('ignores the short flag for every tender except the receivable', () => {
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.CASH }, { short: true })).toBe('Cash');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.CARD, paymentSubtype: 'Visa' }, { short: true })).toBe('Visa');
  });

  it('falls back to the generic word "Payment" for an unrecognised tender type', () => {
    expect(allocationLabel({ paymentType: 'GIFT_CARD' })).toBe('Payment');
    expect(allocationLabel({ paymentType: undefined })).toBe('Payment');
    expect(allocationLabel({})).toBe('Payment');
  });

  it('treats an empty card subtype as no subtype', () => {
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.CARD, paymentSubtype: '' })).toBe('Card');
    expect(allocationLabel({ paymentType: PAYMENT_TYPES.ONLINE, paymentSubtype: '' })).toBe('Online');
  });
});

describe('allocationLabelAr', () => {
  it('provides an Arabic counterpart for every known tender', () => {
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.CASH })).toBe('نقداً');
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.CARD })).toBe('بطاقة');
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.ONLINE })).toBe('تحويل بنكي');
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.CREDIT })).toBe('محول إلى الذمم المدينة');
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.VOUCHER })).toBe('قسيمة رصيد');
  });

  it('names the BNPL provider in the Arabic label too', () => {
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.BNPL, paymentSubtype: 'Tamara' }))
      .toBe('اشترِ الآن وادفع لاحقاً · Tamara');
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.BNPL })).toBe('اشترِ الآن وادفع لاحقاً');
  });

  it('CHARACTERIZED QUIRK: an unknown type gets an EMPTY Arabic label, not a fallback word', () => {
    // The English side falls back to "Payment"; the Arabic side returns ''. A bilingual
    // receipt therefore prints an English label with a blank Arabic column for the same row.
    expect(allocationLabelAr({ paymentType: 'GIFT_CARD' })).toBe('');
    expect(allocationLabel({ paymentType: 'GIFT_CARD' })).toBe('Payment');
  });

  it('does not vary the Arabic card label by network', () => {
    // Unlike the English label, which prints "Visa" / "Mastercard".
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.CARD, paymentSubtype: 'Visa' })).toBe('بطاقة');
    expect(allocationLabelAr({ paymentType: PAYMENT_TYPES.CARD, paymentSubtype: 'Mastercard' })).toBe('بطاقة');
  });
});

describe('unknown tender types inside a block', () => {
  const block = buildPaymentBlock([{ paymentType: 'GIFT_CARD', amount: 50 }], { invoiceTotal: 50 });

  it('CHARACTERIZED QUIRK: the detail row says "Payment" but the summary says "Cash"', () => {
    // allocationLabel falls back to 'Payment'; paymentSummary goes through
    // paymentModel.lineLabel, whose fallback is 'Cash'. One block, two different names
    // for the same tender — the receipt header and its own detail row disagree.
    expect(block.details[0].label).toBe('Payment');
    expect(block.summaryLabel).toBe('Cash');
  });

  it('counts an unknown tender as money received, not as a receivable', () => {
    // `received` is derived as "not CREDIT", so anything unrecognised is assumed collected.
    expect(block.details[0].received).toBe(true);
    expect(block.totalReceived).toBe(50);
    expect(block.transferredToAr).toBe(0);
    expect(block.hasReceivable).toBe(false);
  });

  it('preserves the original type string on the row', () => {
    expect(block.details[0].type).toBe('GIFT_CARD');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · Block fields — received flag, references, ordering
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildPaymentBlock — row fields', () => {
  const block = buildPaymentBlock(
    lines(cash(80), card(10, 'Visa', 'AUTH-77'), voucher(20, 'VCH-9'), credit(40)),
    { invoiceTotal: 150 },
  );

  it('marks only the receivable as not received', () => {
    expect(block.details.map((d) => [d.type, d.received])).toEqual([
      ['CASH', true],
      ['CARD', true],
      ['VOUCHER', true],
      ['CREDIT', false],
    ]);
  });

  it('carries each tender reference through, null when absent', () => {
    // Order is cash, card, voucher, credit — only the card and voucher carry one.
    expect(block.details.map((d) => d.reference)).toEqual([null, 'AUTH-77', 'VCH-9', null]);
  });

  it('keeps the cashier entry order and never sorts', () => {
    expect(block.details.map((d) => d.label)).toEqual([
      'Cash', 'Visa', 'Voucher VCH-9', AR_LABEL,
    ]);
  });

  it('excludes the receivable from totalReceived but includes it in the summary', () => {
    expect(block.totalReceived).toBe(110);        // 80 + 10 + 20
    expect(block.transferredToAr).toBe(40);
    expect(block.hasReceivable).toBe(true);
    expect(block.summaryLabel).toContain('Credit');
  });

  it('returns exactly the documented field set', () => {
    expect(Object.keys(block).sort()).toEqual([
      'changeAmount', 'details', 'hasReceivable', 'invoiceTotal',
      'summaryLabel', 'totalReceived', 'transferredToAr',
    ]);
    expect(Object.keys(block.details[0]).sort()).toEqual([
      'amount', 'label', 'labelAr', 'received', 'reference', 'type',
    ]);
  });

  it('sets hasReceivable strictly on a positive receivable', () => {
    expect(buildPaymentBlock(lines(cash(100)), { invoiceTotal: 100 }).hasReceivable).toBe(false);
  });
});

describe('buildPaymentBlock — every tender type in one sale', () => {
  // The widest settlement the allocation model allows: all six types on one bill.
  const block = buildPaymentBlock(
    lines(
      cash(100),
      card(50, 'Mastercard', 'AUTH-01'),
      online(40, 'FAB'),
      voucher(30, 'VCH-7'),
      bnpl(20, 'Tamara', 'TMR-9'),
      credit(10),
    ),
    { invoiceTotal: 250 },
  );

  it('labels all six tenders, in entry order', () => {
    expect(block.details.map((d) => d.label)).toEqual([
      'Cash',
      'Mastercard',
      'FAB Online',
      'Voucher VCH-7',
      'BNPL · Tamara',
      AR_LABEL,
    ]);
  });

  it('names every tender in the summary, grouped by rail', () => {
    // Card reports its network; BNPL and Voucher report their rail, not their provider.
    expect(block.summaryLabel).toBe('Cash + Mastercard + Online + Voucher + BNPL + Credit');
    expect(block.summaryLabel).not.toContain('Mixed');
  });

  it('counts everything except the receivable as received', () => {
    expect(block.totalReceived).toBe(240);      // 100+50+40+30+20
    expect(block.transferredToAr).toBe(10);
    expect(block.details.filter((d) => !d.received).map((d) => d.type)).toEqual(['CREDIT']);
    expect(reconcilePaymentBlock(block).consistent).toBe(true);
  });

  it('produces a row per tender plus the footer, with no change', () => {
    const rows = paymentBlockRows(block);
    expect(rows.map((r) => r.label)).toEqual([
      'Cash', 'Mastercard', 'FAB Online', 'Voucher VCH-7', 'BNPL · Tamara', AR_LABEL,
      'Total Received',
    ]);
    expect(rows.filter((r) => r.emphasis).map((r) => r.label)).toEqual(['Total Received']);
  });

  it('exports the whole breakdown as one cell', () => {
    expect(paymentDetailsForExport(block, '')).toBe(
      `Cash 100.00 | Mastercard 50.00 | FAB Online 40.00 | Voucher VCH-7 30.00 | BNPL · Tamara 20.00 | ${AR_LABEL} 10.00`,
    );
  });

  it('matches every one of its tender filters', () => {
    ['Cash', 'Card', 'Online', 'Credit', 'BNPL', 'Mixed'].forEach((filter) => {
      expect(matchesPaymentFilter(filter, block, '')).toBe(true);
    });
  });
});

describe('buildPaymentBlock — settlement positions', () => {
  it('exact payment: nothing owed, nothing returned', () => {
    const block = buildPaymentBlock(lines(cash(150)), { invoiceTotal: 150 });
    expect(block.totalReceived).toBe(150);
    expect(block.changeAmount).toBe(0);
    expect(block.transferredToAr).toBe(0);
  });

  it('partial payment: the block records only what was tendered', () => {
    // CHARACTERIZED BEHAVIOUR: an under-settled sale carries no "balance owing" field.
    // The shortfall is representable only as a CREDIT allocation; a block that is simply
    // short reconciles as an error rather than printing a balance row.
    const block = buildPaymentBlock(lines(cash(100)), { invoiceTotal: 150 });
    expect(block.totalReceived).toBe(100);
    expect(block.changeAmount).toBe(0);
    expect(block).not.toHaveProperty('balanceDue');
    expect(reconcilePaymentBlock(block).consistent).toBe(false);
  });

  it('overpayment: only the excess cash becomes change', () => {
    const block = buildPaymentBlock(lines(card(40), cash(100)), { invoiceTotal: 100 });
    expect(block.changeAmount).toBe(40);      // cash 100, cash needed 60
    expect(block.totalReceived).toBe(100);    // 140 tendered - 40 handed back
  });

  it('a non-cash overpayment produces no change at all', () => {
    // Only cash can be given back; the selector's cashNeeded clamp means an over-tendered
    // card yields zero change rather than a refund row.
    const block = buildPaymentBlock(lines(card(200)), { invoiceTotal: 100 });
    expect(block.changeAmount).toBe(0);
    expect(block.totalReceived).toBe(200);
    expect(reconcilePaymentBlock(block).consistent).toBe(false);
  });

  it('a fully-receivable sale collects nothing and reconciles', () => {
    const block = buildPaymentBlock(lines(credit(150)), { invoiceTotal: 150 });
    expect(block.totalReceived).toBe(0);
    expect(block.transferredToAr).toBe(150);
    expect(reconcilePaymentBlock(block).consistent).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · paymentBlockRows — which rows exist, and when they are suppressed
 * ══════════════════════════════════════════════════════════════════════════ */

describe('paymentBlockRows — row composition', () => {
  it('returns an empty array for a null block', () => {
    expect(paymentBlockRows(null)).toEqual([]);
    expect(paymentBlockRows(undefined)).toEqual([]);
    expect(paymentBlockRows(null, { width: 42 })).toEqual([]);
  });

  it('a single tender prints one row and NO totals footer', () => {
    const rows = paymentBlockRows(buildPaymentBlock(lines(cash(100)), { invoiceTotal: 100 }));
    expect(rowTuples(rows)).toEqual([['Cash', 100, false]]);
  });

  it('a split payment appends the Total Received footer', () => {
    const rows = paymentBlockRows(buildPaymentBlock(lines(cash(60), card(40)), { invoiceTotal: 100 }));
    expect(rowTuples(rows)).toEqual([
      ['Cash', 60, false],
      ['Visa', 40, false],
      ['Total Received', 100, true],
    ]);
  });

  it('CHARACTERIZED BEHAVIOUR: a single tender with change gets the change row but still no footer', () => {
    // The footer is gated on details.length > 1, not on the presence of a change row, so
    // an overpaid single-tender sale prints Cash / Change Returned with no Total Received.
    const rows = paymentBlockRows(buildPaymentBlock(lines(cash(100)), { invoiceTotal: 60 }));
    expect(rowTuples(rows)).toEqual([
      ['Cash', 100, false],
      ['Change Returned', 40, true],
    ]);
  });

  it('orders the rows tenders → change → total', () => {
    const rows = paymentBlockRows(buildPaymentBlock(lines(card(40), cash(100)), { invoiceTotal: 100 }));
    expect(rows.map((r) => r.label)).toEqual(['Visa', 'Cash', 'Change Returned', 'Total Received']);
  });

  it('suppresses the change row when nothing is returned', () => {
    const rows = paymentBlockRows(buildPaymentBlock(lines(cash(60), card(40)), { invoiceTotal: 100 }));
    expect(rows.some((r) => r.label === 'Change Returned')).toBe(false);
  });

  it('emphasises only the change and total rows', () => {
    const rows = paymentBlockRows(buildPaymentBlock(lines(cash(120), card(40)), { invoiceTotal: 100 }));
    expect(rows.filter((r) => r.emphasis).map((r) => r.label)).toEqual(['Change Returned', 'Total Received']);
  });

  it('carries the Arabic label on every row, including the generated ones', () => {
    const rows = paymentBlockRows(buildPaymentBlock(lines(cash(120), card(40)), { invoiceTotal: 100 }));
    expect(rows.map((r) => r.labelAr)).toEqual(['نقداً', 'بطاقة', 'المبلغ المرتجع', 'إجمالي المستلم']);
  });

  it('does NOT include an Invoice Total row — each renderer appends that itself', () => {
    // hasReceivable is exposed on the block and every renderer adds the row on its own,
    // which is the one piece of the payment block that is not centralised here.
    const rows = paymentBlockRows(buildPaymentBlock(lines(cash(50), credit(50)), { invoiceTotal: 100 }));
    expect(rows.some((r) => r.label === 'Invoice Total')).toBe(false);
    expect(rows.map((r) => r.label)).toEqual(['Cash', AR_LABEL, 'Total Received']);
  });
});

describe('paymentBlockRows — label wrapping and the column budget', () => {
  const block = buildPaymentBlock(lines(cash(80), credit(70)), { invoiceTotal: 150 });

  it('gives CSS-laid-out callers one unwrapped line per row', () => {
    const rows = paymentBlockRows(block);
    rows.forEach((r) => expect(r.labelLines).toHaveLength(1));
    expect(rows[1].labelLines).toEqual([AR_LABEL]);
  });

  it('appends labelSuffix before wrapping, so the colon is inside the budget', () => {
    const rows = paymentBlockRows(block, { width: 42, labelSuffix: ':' });
    expect(rows[0].labelLines).toEqual(['Cash:']);
    expect(rows[1].labelLines.join(' ')).toBe(`${AR_LABEL}:`);
  });

  it('leaves the row label itself unsuffixed — only labelLines carries it', () => {
    const rows = paymentBlockRows(block, { width: 42, labelSuffix: ':' });
    expect(rows[0].label).toBe('Cash');
    expect(rows[0].labelLines[0]).toBe('Cash:');
  });

  it('sizes the budget from the formatted amount the renderer will actually print', () => {
    const wide = paymentBlockRows(block, {
      width: 42, labelSuffix: ':', formatAmount: (r) => `AED ${r.amount.toFixed(2)}`,
    });
    const bare = paymentBlockRows(block, { width: 42, labelSuffix: ':' });

    // "AED 70.00" is 9 chars vs "70.00" at 5, so the wider amount leaves a smaller budget
    // and breaks the long label into more lines.
    expect(wide[1].labelLines.length).toBeGreaterThanOrEqual(bare[1].labelLines.length);
    wide[1].labelLines.forEach((l) => expect(l.length).toBeLessThanOrEqual(42 - 'AED 70.00'.length - 1));
  });

  it('defaults the amount string to toFixed(2) when no formatter is given', () => {
    const rows = paymentBlockRows(buildPaymentBlock(lines(cash(5)), { invoiceTotal: 5 }), { width: 20 });
    // Budget = 20 - '5.00'.length - 1 = 15, so 'Cash' fits on one line.
    expect(rows[0].labelLines).toEqual(['Cash']);
  });

  it('never squeezes the label below MIN_PAYMENT_LABEL_COLUMNS', () => {
    expect(MIN_PAYMENT_LABEL_COLUMNS).toBe(8);
    const rows = paymentBlockRows(block, {
      width: 20, labelSuffix: ':', formatAmount: () => 'AED 1234567.89',
    });
    rows.forEach((r) => r.labelLines.forEach((l) => expect(l.length).toBeLessThanOrEqual(8)));
  });

  it('CHARACTERIZED QUIRK: the 8-column floor stops guaranteeing the row fits the paper', () => {
    // budget = max(MIN_PAYMENT_LABEL_COLUMNS, width - amount - 1). Once the amount is wide
    // enough that the subtraction drops below 8, the floor wins and the budget no longer
    // reflects the space actually available. Label lines are then capped at 8 while the
    // amount needs 14, so a full-width last line pairs into 8 + 1 + 14 = 23 columns on a
    // 20-column row. Whether a given row overflows depends only on where its wrap happens
    // to land — the floor protects legibility at the cost of that guarantee.
    const amount = 'AED 1234567.89';
    const rows = paymentBlockRows(block, {
      width: 20, labelSuffix: ':', formatAmount: () => amount,
    });

    const widest = Math.max(...rows[1].labelLines.map((l) => l.length));
    expect(widest).toBe(MIN_PAYMENT_LABEL_COLUMNS);              // capped by the floor
    expect(widest + 1 + amount.length).toBeGreaterThan(20);      // would not fit

    // This particular label happens to wrap to a short last line ("le:"), so THIS row
    // still fits — which is exactly why the overflow is intermittent rather than obvious.
    const last = rows[1].labelLines[rows[1].labelLines.length - 1];
    expect(last).toBe('le:');
    expect(last.length + 1 + amount.length).toBeLessThanOrEqual(20);
  });

  it('hard-splits a single word that cannot fit the budget at all', () => {
    const rows = paymentBlockRows(block, {
      width: 20, labelSuffix: ':', formatAmount: () => 'AED 1234567.89',
    });
    // "Transferred" is 11 chars against an 8-column budget.
    expect(rows[1].labelLines.slice(0, 2)).toEqual(['Transfer', 'red to']);
  });
});

describe('wrapPaymentLabel — the underlying wrapper', () => {
  it('always returns at least one line', () => {
    expect(wrapPaymentLabel('', 10)).toEqual(['']);
    expect(wrapPaymentLabel(null, 10)).toEqual(['']);
    expect(wrapPaymentLabel(undefined, 10)).toEqual(['']);
    expect(wrapPaymentLabel('   ', 10)).toEqual(['']);
  });

  it('trims the label before measuring it', () => {
    expect(wrapPaymentLabel('  Cash  ', 10)).toEqual(['Cash']);
  });

  it('CHARACTERIZED BEHAVIOUR: a non-positive or NaN width collapses to a 1-column budget', () => {
    // Math.max(1, Math.floor(maxChars) || 0) — so 0, negative and NaN all become 1, and a
    // label is emitted one character per line rather than throwing or passing through.
    expect(wrapPaymentLabel('ab', 0)).toEqual(['a', 'b']);
    expect(wrapPaymentLabel('ab', -5)).toEqual(['a', 'b']);
    expect(wrapPaymentLabel('ab', NaN)).toEqual(['a', 'b']);
  });

  it('returns the label untouched when it already fits', () => {
    expect(wrapPaymentLabel(AR_LABEL, 40)).toEqual([AR_LABEL]);
    expect(wrapPaymentLabel('Cash', 4)).toEqual(['Cash']);
  });

  it('collapses runs of whitespace when it does wrap', () => {
    expect(wrapPaymentLabel('Cash    and    Card', 10)).toEqual(['Cash and', 'Card']);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6 · buildPaymentBlockFromRecords — the persisted-tender mapping
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildPaymentBlockFromRecords', () => {
  it('returns null when nothing was recorded', () => {
    expect(buildPaymentBlockFromRecords([], { invoiceTotal: 100 })).toBe(null);
    expect(buildPaymentBlockFromRecords(null, { invoiceTotal: 100 })).toBe(null);
    expect(buildPaymentBlockFromRecords(undefined)).toBe(null);
    // An unpaid credit invoice has no tender rows; the caller then falls back to the
    // stored payment-mode text.
  });

  it('drops non-positive recorded amounts before deciding', () => {
    expect(buildPaymentBlockFromRecords([{ type: 'CASH', amount: 0 }], { invoiceTotal: 10 })).toBe(null);
    expect(buildPaymentBlockFromRecords([{ type: 'CASH', amount: '-3' }], { invoiceTotal: 10 })).toBe(null);
  });

  it('maps a card row label onto the network subtype', () => {
    const block = buildPaymentBlockFromRecords([{ type: 'CARD', label: 'Mastercard', amount: 50 }], { invoiceTotal: 50 });
    expect(block.details[0].label).toBe('Mastercard');
    expect(block.details[0].type).toBe('CARD');
  });

  it('strips the code prefix from a recorded bank account for an online row', () => {
    const block = buildPaymentBlockFromRecords(
      [{ type: 'ONLINE', label: 'Online', amount: 20, bankName: '1010 - FAB Current' }],
      { invoiceTotal: 20 },
    );
    expect(block.details[0].label).toBe('FAB Current Online');
  });

  it('strips the BNPL prefix from a recorded provider mode', () => {
    const block = buildPaymentBlockFromRecords(
      [{ type: 'BNPL', label: 'BNPL Tabby', amount: 30, reference: 'T-1' }],
      { invoiceTotal: 30 },
    );
    expect(block.details[0].label).toBe('BNPL · Tabby');
    expect(block.details[0].reference).toBe('T-1');
  });

  it('CHARACTERIZED QUIRK: an unrecognised recorded type is silently relabelled as Cash', () => {
    // `PAYMENT_TYPES[r.type] || PAYMENT_TYPES.CASH` — a record whose type the enum does
    // not know (a future tender, a typo, a renamed backend constant) prints on the
    // receipt and in back-office exports as a cash payment.
    const block = buildPaymentBlockFromRecords([{ type: 'WEIRD', label: 'Weird', amount: 10 }], { invoiceTotal: 10 });
    expect(block.details[0].type).toBe('CASH');
    expect(block.details[0].label).toBe('Cash');
    expect(block.summaryLabel).toBe('Cash');
  });

  it('preserves the recorded order across mixed tender types', () => {
    const block = buildPaymentBlockFromRecords([
      { type: 'CARD', label: 'Visa', amount: 10 },
      { type: 'ONLINE', label: 'Online', amount: 20, bankName: '1010 - FAB Current' },
      { type: 'BNPL', label: 'BNPL Tabby', amount: 30, reference: 'T-1' },
    ], { invoiceTotal: 60 });

    expect(block.details.map((d) => d.label)).toEqual(['Visa', 'FAB Current Online', 'BNPL · Tabby']);
    expect(block.summaryLabel).toBe('Visa + Online + BNPL');
    expect(block.totalReceived).toBe(60);
  });

  it('honours the short receivable label', () => {
    const block = buildPaymentBlockFromRecords(
      [{ type: 'CREDIT', label: 'Credit', amount: 40 }], { invoiceTotal: 40, short: true },
    );
    expect(block.details[0].label).toBe(AR_LABEL_SHORT);
  });

  it('coerces a recorded string amount to a number', () => {
    const block = buildPaymentBlockFromRecords([{ type: 'CASH', label: 'Cash', amount: '25.50' }], { invoiceTotal: 25.5 });
    expect(block.details[0].amount).toBe(25.5);
  });
});

describe('bnplProviderFromMode and bankDisplayName', () => {
  it('extracts the provider from every recorded BNPL spelling', () => {
    expect(bnplProviderFromMode('BNPL Tabby')).toBe('Tabby');
    expect(bnplProviderFromMode('BNPL · Tamara')).toBe('Tamara');
    expect(bnplProviderFromMode('BNPL - Postpay')).toBe('Postpay');
    expect(bnplProviderFromMode('bnpl tabby')).toBe('tabby');   // case-insensitive prefix
  });

  it('returns null when there is no provider to name', () => {
    expect(bnplProviderFromMode('BNPL')).toBe(null);
    expect(bnplProviderFromMode('')).toBe(null);
    expect(bnplProviderFromMode(null)).toBe(null);
    expect(bnplProviderFromMode(undefined)).toBe(null);
  });

  it('leaves a mode with no BNPL prefix alone', () => {
    expect(bnplProviderFromMode('Tabby')).toBe('Tabby');
  });

  it('strips a code prefix from a bank account name', () => {
    expect(bankDisplayName('1010 - FAB Current')).toBe('FAB Current');
    expect(bankDisplayName('ACC.01 - ADCB Savings')).toBe('ADCB Savings');
    expect(bankDisplayName('FAB Current')).toBe('FAB Current');   // nothing to strip
  });

  it('returns null for an absent bank name', () => {
    expect(bankDisplayName('')).toBe(null);
    expect(bankDisplayName(null)).toBe(null);
    expect(bankDisplayName(undefined)).toBe(null);
  });

  it('CHARACTERIZED QUIRK: only the FIRST " - " separated segment is treated as a code', () => {
    // The pattern anchors at the start and requires a word-ish token, so a bank name that
    // itself contains " - " keeps everything after the first separator.
    expect(bankDisplayName('1010 - FAB - Current')).toBe('FAB - Current');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7 · Back-office helpers
 * ══════════════════════════════════════════════════════════════════════════ */

describe('matchesPaymentFilter', () => {
  const split = buildPaymentBlock(lines(cash(60), card(40)), { invoiceTotal: 100 });
  const cashOnly = buildPaymentBlock(lines(cash(100)), { invoiceTotal: 100 });

  it('passes everything for All or an absent filter', () => {
    expect(matchesPaymentFilter('All', cashOnly, 'Cash')).toBe(true);
    expect(matchesPaymentFilter('', cashOnly, 'Cash')).toBe(true);
    expect(matchesPaymentFilter(null, cashOnly, 'Cash')).toBe(true);
  });

  it('matches a split sale under BOTH of its tender filters', () => {
    expect(matchesPaymentFilter('Cash', split, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('Card', split, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('Online', split, 'Cash + Visa')).toBe(false);
  });

  it('treats Mixed as "more than one distinct tender type"', () => {
    expect(matchesPaymentFilter('Mixed', split, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('Mixed', cashOnly, 'Cash')).toBe(false);

    // Two allocations of the SAME type are not mixed.
    const twoCash = buildPaymentBlock(lines(cash(50), cash(50)), { invoiceTotal: 100 });
    expect(matchesPaymentFilter('Mixed', twoCash, 'Cash')).toBe(false);
  });

  it('falls back to the stored mode text when no block is known', () => {
    expect(matchesPaymentFilter('Cash', null, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('Card', null, 'Cash + Visa')).toBe(false);   // text says "Visa"
    expect(matchesPaymentFilter('Mixed', null, 'Mixed')).toBe(true);
    expect(matchesPaymentFilter('Mixed', null, 'Cash + Visa')).toBe(true);   // the "+" heuristic
  });

  it('matches the retired Advance tender on the stored label only', () => {
    expect(matchesPaymentFilter('Advance', null, 'Customer Advance')).toBe(true);
    expect(matchesPaymentFilter('Advance', cashOnly, 'Cash')).toBe(false);
    // Even with a block present, Advance never consults it.
    expect(matchesPaymentFilter('Advance', cashOnly, 'Advance')).toBe(true);
  });

  it('CHARACTERIZED QUIRK: an unrecognised filter passes everything through', () => {
    // FILTER_TO_TYPE has no entry, so the guard returns true rather than excluding.
    // A typo'd filter silently disables filtering instead of showing an empty list.
    expect(matchesPaymentFilter('Bitcoin', cashOnly, 'Cash')).toBe(true);
  });

  it('offers the documented filter list in a stable order', () => {
    expect(PAYMENT_FILTERS).toEqual(['All', 'Cash', 'Card', 'Online', 'Credit', 'BNPL', 'Advance', 'Mixed']);
  });
});

describe('paymentDetailsForExport', () => {
  it('renders one pipe-separated cell with 2dp amounts', () => {
    const block = buildPaymentBlock(lines(cash(80), card(10, 'Visa')), { invoiceTotal: 90 });
    expect(paymentDetailsForExport(block, 'Cash + Visa')).toBe('Cash 80.00 | Visa 10.00');
  });

  it('falls back to the stored mode when no block exists', () => {
    expect(paymentDetailsForExport(null, 'Mixed')).toBe('Mixed');
    expect(paymentDetailsForExport(null, '')).toBe('');
    expect(paymentDetailsForExport(null, undefined)).toBe('');
  });

  it('includes the receivable row in the export cell', () => {
    const block = buildPaymentBlock(lines(cash(50), credit(50)), { invoiceTotal: 100 });
    expect(paymentDetailsForExport(block, '')).toBe(`Cash 50.00 | ${AR_LABEL} 50.00`);
  });
});

describe('summaryLabelForModes', () => {
  it('de-duplicates and joins in first-seen order', () => {
    expect(summaryLabelForModes([{ mode: 'Cash' }, { mode: 'Visa' }, { mode: 'Cash' }]))
      .toBe('Cash + Visa');
  });

  it('trims and skips blank modes', () => {
    expect(summaryLabelForModes([{ mode: '  Cash  ' }, { mode: '' }, { mode: null }]))
      .toBe('Cash');
  });

  it('returns null when there is nothing to name', () => {
    expect(summaryLabelForModes([])).toBe(null);
    expect(summaryLabelForModes(null)).toBe(null);
    expect(summaryLabelForModes([{ mode: '' }])).toBe(null);
    expect(summaryLabelForModes([null, undefined])).toBe(null);
  });

  it('CHARACTERIZED BEHAVIOUR: de-duplication is case- and space-sensitive', () => {
    expect(summaryLabelForModes([{ mode: 'Cash' }, { mode: 'cash' }])).toBe('Cash + cash');
  });
});

describe('reconciliation tolerance', () => {
  it('is half a fils', () => {
    expect(RECONCILIATION_TOLERANCE).toBe(0.005);
  });

  it('accepts a discrepancy inside the tolerance and rejects one outside it', () => {
    const inside = buildPaymentBlock(lines(cash(100)), { invoiceTotal: 100.004 });
    expect(reconcilePaymentBlock(inside).consistent).toBe(true);

    const outside = buildPaymentBlock(lines(cash(100)), { invoiceTotal: 100.02 });
    expect(reconcilePaymentBlock(outside).consistent).toBe(false);
    expect(reconcilePaymentBlock(outside).findings[0].code).toBe('TOTALS_DO_NOT_RECONCILE');
  });

  it('CHARACTERIZED BEHAVIOUR: a non-positive allocation can never be reported', () => {
    // NON_POSITIVE_ALLOCATION is unreachable through buildPaymentBlock, which filters
    // those rows out before the block exists. It only fires on a hand-built block.
    const handBuilt = {
      details: [{ label: 'Cash', type: PAYMENT_TYPES.CASH, amount: 0 }],
      summaryLabel: 'Cash', totalReceived: 0, transferredToAr: 0,
      invoiceTotal: 0, changeAmount: 0,
    };
    expect(reconcilePaymentBlock(handBuilt).findings.map((f) => f.code))
      .toContain('NON_POSITIVE_ALLOCATION');

    const viaBuilder = buildPaymentBlock(lines(cash(0), cash(10)), { invoiceTotal: 10 });
    expect(reconcilePaymentBlock(viaBuilder).findings).toEqual([]);
  });
});

describe('paymentAuditSnapshot', () => {
  it('flattens the block plus its reconciliation into one JSON-friendly object', () => {
    const block = buildPaymentBlock(lines(cash(60), credit(40)), { invoiceTotal: 100 });
    const snap = paymentAuditSnapshot(block);

    expect(snap.allocationCount).toBe(2);
    expect(snap.allocationOrder).toEqual(['Cash', AR_LABEL]);
    expect(snap.allocationTypes).toEqual(['CASH', 'CREDIT']);
    expect(snap.totalReceived).toBe(60);
    expect(snap.transferredToAr).toBe(40);
    expect(snap.consistent).toBe(true);
    expect(snap.findings).toEqual([]);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('is null when there is nothing to audit', () => {
    expect(paymentAuditSnapshot(null)).toBe(null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8 · Boundary — paymentPresentation → receipt builder → rendered receipt
 * ══════════════════════════════════════════════════════════════════════════ */

describe('integration boundary: the block reaches the thermal HTML receipt', () => {
  const block = buildPaymentBlock(lines(cash(200), card(150, 'Visa', 'AUTH-77'), credit(18)), {
    invoiceTotal: 368,
  });
  const html = buildThermalReceiptHtml('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
    ...STORE, paymentBlock: block, currency: 'AED',
  });

  it('prints one row per tender, using this module’s labels', () => {
    expect(html).toContain('Cash:');
    expect(html).toContain('Visa:');
    // The long receivable label arrives pre-wrapped; its first fragment is on the paper.
    expect(html).toContain('Transferred to');
  });

  it('prints the amounts this module rounded, formatted by the renderer', () => {
    expect(html).toContain('AED 200.00');
    expect(html).toContain('AED 150.00');
    expect(html).toContain('AED 18.00');
  });

  it('prints the Total Received footer for a split payment', () => {
    expect(html).toContain('Total Received:');
    expect(html).toContain('AED 350.00');   // 200 + 150, receivable excluded
  });

  it('appends the Invoice Total row only because the block flags a receivable', () => {
    expect(block.hasReceivable).toBe(true);
    expect(html).toContain('Invoice Total:');
    expect(html).toContain('AED 368.00');

    const noAr = buildThermalReceiptHtml('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE,
      paymentBlock: buildPaymentBlock(lines(cash(368)), { invoiceTotal: 368 }),
      currency: 'AED',
    });
    expect(noAr).not.toContain('Invoice Total:');
  });

  it('falls back to the stored cash/change rows when no block is supplied', () => {
    // The historical-reprint path: paymentBlockRows returns [], so the renderer prints
    // what the invoice recorded instead.
    const reprint = buildThermalReceiptHtml('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE, paymentBlock: null, cashGiven: 400, changeAmount: 32, currency: 'AED',
    });
    expect(reprint).toContain('Cash Received:');
    expect(reprint).toContain('AED 400.00');
    expect(reprint).toContain('Change Returned:');
    expect(reprint).not.toContain('Total Received:');
  });

  it('prints nothing from this module when payment details are switched off', () => {
    const hidden = buildThermalReceiptHtml('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE, paymentBlock: block, showPaymentDetails: false, currency: 'AED',
    });
    expect(hidden).not.toContain('Total Received:');
    expect(hidden).not.toContain('Invoice Total:');
  });

  it('CHARACTERIZED BOUNDARY: the plain-text receipt IGNORES the payment block entirely', () => {
    // buildThermalReceiptText accepts no paymentBlock — it prints a single "Payment Mode"
    // line plus the stored cashGiven/changeAmount. So the ESC/POS, thermal-HTML, canvas
    // and A4 receipts show a per-tender breakdown while the text fallback — the path
    // localPrintAgent takes when a v4/WSD driver refuses raw ESC/POS — collapses a split
    // payment to one mode label. Same sale, two different levels of detail depending on
    // which print path the driver forced.
    const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE, paymentBlock: block, currency: 'AED',
    });

    // The block was passed and had no effect: no per-tender rows, no footer.
    expect(text).not.toContain('Total Received');
    expect(text).not.toContain('Transferred to');
    expect(text).not.toContain('Visa');
    // What it prints instead is the invoice's own single mode string.
    expect(text).toMatch(/^Payment Mode\s+Cash$/m);

    // The HTML receipt, given the same block, does show the breakdown.
    expect(html).toContain('Total Received:');
    expect(html).toContain('Visa:');
  });
});

describe('integration boundary: rows are wrapped to the receipt column grid', () => {
  const block = buildPaymentBlock(lines(cash(80), credit(70)), { invoiceTotal: 150 });

  it('wraps the receivable label against the 58mm grid without losing a word', () => {
    const rows = paymentBlockRows(block, {
      width: 30, labelSuffix: ':', formatAmount: (r) => `AED ${r.amount.toFixed(2)}`,
    });
    const arRow = rows.find((r) => r.label === AR_LABEL);

    expect(arRow.labelLines.join(' ')).toBe(`${AR_LABEL}:`);
    arRow.labelLines.forEach((l) => expect(l.length).toBeLessThanOrEqual(30 - 'AED 70.00'.length - 1));
  });

  it('needs fewer lines on the wider 80mm grid', () => {
    const narrow = paymentBlockRows(block, { width: 30, labelSuffix: ':', formatAmount: (r) => `AED ${r.amount.toFixed(2)}` });
    const wide = paymentBlockRows(block, { width: 46, labelSuffix: ':', formatAmount: (r) => `AED ${r.amount.toFixed(2)}` });

    const arNarrow = narrow.find((r) => r.label === AR_LABEL).labelLines;
    const arWide = wide.find((r) => r.label === AR_LABEL).labelLines;
    expect(arWide.length).toBeLessThan(arNarrow.length);
  });

  it('keeps short labels on one line at every width', () => {
    [30, 42, 46].forEach((width) => {
      const rows = paymentBlockRows(block, { width, labelSuffix: ':', formatAmount: (r) => `AED ${r.amount.toFixed(2)}` });
      expect(rows.find((r) => r.label === 'Cash').labelLines).toEqual(['Cash:']);
    });
  });

  it('uses the abbreviated receivable label when the block was built short', () => {
    const shortBlock = buildPaymentBlock(lines(cash(80), credit(70)), { invoiceTotal: 150, short: true });
    const rows = paymentBlockRows(shortBlock, { width: 30, labelSuffix: ':', formatAmount: (r) => `AED ${r.amount.toFixed(2)}` });

    expect(rows[1].label).toBe(AR_LABEL_SHORT);
    expect(rows[1].labelLines.join(' ')).toBe('Transferred to A/R:');
    expect(rows[1].labelLines.length).toBeLessThan(4);
  });
});
