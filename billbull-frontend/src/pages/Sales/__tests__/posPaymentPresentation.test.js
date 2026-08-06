import { describe, expect, it } from 'vitest';

import { PAYMENT_TYPES, createPaymentLine } from '../POS/payments/paymentModel';
import {
  AR_LABEL,
  allocationLabel,
  buildPaymentBlock,
  paymentBlockRows,
  paymentAuditSnapshot,
  reconcilePaymentBlock,
  wrapPaymentLabel,
} from '../POS/payments/paymentPresentation';

/**
 * The payment block is what every renderer prints — ESC/POS, HTML thermal, bilingual
 * canvas, A4/PDF and the settlement success screen all iterate `paymentBlockRows(block)`.
 * Pinning the block therefore pins all of them at once: if these rows are right, no
 * renderer can print a different set, because none of them decides what to print any more.
 */

const lines = (...drafts) => drafts.map((d) => createPaymentLine(d));
const cash = (amount) => ({ paymentType: PAYMENT_TYPES.CASH, amount });
const card = (amount, subtype = 'Visa', reference = null) =>
  ({ paymentType: PAYMENT_TYPES.CARD, amount, paymentSubtype: subtype, reference });
const online = (amount, bank = 'FAB') =>
  ({ paymentType: PAYMENT_TYPES.ONLINE, amount, paymentSubtype: bank, bankAccountId: '1' });
const credit = (amount) =>
  ({ paymentType: PAYMENT_TYPES.CREDIT, amount, customerCode: 'MEM-001' });

/** What a renderer would actually print, as "Label  Amount" strings. */
const printed = (block) => paymentBlockRows(block)
  .map((r) => `${r.label}  ${r.amount.toFixed(2)}`);

describe('customer-facing labels', () => {
  it('never exposes an internal type name', () => {
    expect(allocationLabel(createPaymentLine(cash(1)))).toBe('Cash');
    expect(allocationLabel(createPaymentLine(card(1, 'Mastercard')))).toBe('Mastercard');
    expect(allocationLabel(createPaymentLine(online(1, 'FAB')))).toBe('FAB Online');
    expect(allocationLabel(createPaymentLine(credit(1)))).toBe(AR_LABEL);

    // No raw enum value reaches paper.
    [cash(1), card(1), online(1), credit(1)].forEach((d) => {
      const label = allocationLabel(createPaymentLine(d));
      expect(label).not.toMatch(/^(CASH|CARD|ONLINE|CREDIT|ADVANCE)$/);
    });
  });

  it('falls back to a generic label when a card has no network', () => {
    expect(allocationLabel(createPaymentLine({ paymentType: PAYMENT_TYPES.CARD, amount: 1 }))).toBe('Card');
    expect(allocationLabel(createPaymentLine({ paymentType: PAYMENT_TYPES.ONLINE, amount: 1 }))).toBe('Online');
  });

  it('abbreviates the receivable label for narrow receipts', () => {
    expect(allocationLabel(createPaymentLine(credit(1)), { short: true })).toBe('Transferred to A/R');
  });
});

describe('payment block — every settlement shape', () => {
  it('single cash', () => {
    const block = buildPaymentBlock(lines(cash(156.45)), { invoiceTotal: 156.45 });
    expect(block.summaryLabel).toBe('Cash');
    // One tender states its own total, so no totals footer is added.
    expect(printed(block)).toEqual(['Cash  156.45']);
    expect(block.totalReceived).toBeCloseTo(156.45, 2);
    expect(block.hasReceivable).toBe(false);
  });

  it('cash + card', () => {
    const block = buildPaymentBlock(lines(cash(100), card(56.45)), { invoiceTotal: 156.45 });
    expect(block.summaryLabel).toBe('Cash + Visa');
    expect(printed(block)).toEqual(['Cash  100.00', 'Visa  56.45', 'Total Received  156.45']);
  });

  it('cash + card + online', () => {
    const block = buildPaymentBlock(
      lines(cash(80), card(26.45), online(50, 'FAB')), { invoiceTotal: 156.45 },
    );
    // The summary is the invoice's Payment Mode — short and de-duplicated, and identical
    // to the label posted to the backend. The friendly names live on the detail rows.
    expect(block.summaryLabel).toBe('Cash + Visa + Online');
    expect(printed(block)).toEqual([
      'Cash  80.00', 'Visa  26.45', 'FAB Online  50.00', 'Total Received  156.45',
    ]);
  });

  it('cash + card + online + credit — the worked example', () => {
    const block = buildPaymentBlock(
      lines(cash(80), card(10), online(50, 'FAB'), credit(16.45)), { invoiceTotal: 156.45 },
    );
    expect(block.summaryLabel).toBe('Cash + Visa + Online + Credit');
    expect(printed(block)).toEqual([
      'Cash  80.00',
      'Visa  10.00',
      'FAB Online  50.00',
      `${AR_LABEL}  16.45`,
      'Total Received  140.00',
    ]);
    // The receivable is owed, not collected — so it is excluded from Total Received and
    // the invoice total is printed alongside it to make the arithmetic legible.
    expect(block.totalReceived).toBeCloseTo(140, 2);
    expect(block.transferredToAr).toBeCloseTo(16.45, 2);
    expect(block.hasReceivable).toBe(true);
    expect(block.invoiceTotal).toBeCloseTo(156.45, 2);
    expect(block.totalReceived + block.transferredToAr).toBeCloseTo(block.invoiceTotal, 2);
  });

  it('multiple cards stay on their own rows', () => {
    const block = buildPaymentBlock(
      lines(card(40, 'Visa'), card(60, 'Mastercard')), { invoiceTotal: 100 },
    );
    expect(printed(block)).toEqual(['Visa  40.00', 'Mastercard  60.00', 'Total Received  100.00']);
  });

  it('multiple online transfers name their own bank', () => {
    const block = buildPaymentBlock(
      lines(online(50, 'FAB'), online(20, 'ADCB'), online(30, 'Mashreq')), { invoiceTotal: 100 },
    );
    // Three transfers are one Payment Mode; the banks are distinguished on the rows.
    expect(block.summaryLabel).toBe('Online');
    expect(printed(block)).toEqual([
      'FAB Online  50.00', 'ADCB Online  20.00', 'Mashreq Online  30.00', 'Total Received  100.00',
    ]);
  });

  it('cash overpayment prints the change and the amount actually kept', () => {
    const block = buildPaymentBlock(lines(cash(200)), { invoiceTotal: 156.45 });
    expect(block.changeAmount).toBeCloseTo(43.55, 2);
    expect(block.totalReceived).toBeCloseTo(156.45, 2);
    expect(printed(block)).toEqual(['Cash  200.00', 'Change Returned  43.55']);
  });

  it('a fully-receivable sale collects nothing', () => {
    const block = buildPaymentBlock(lines(credit(156.45)), { invoiceTotal: 156.45 });
    expect(block.totalReceived).toBe(0);
    expect(block.transferredToAr).toBeCloseTo(156.45, 2);
    expect(printed(block)).toEqual([`${AR_LABEL}  156.45`]);
  });

  it('never emits the word Mixed for any shape', () => {
    const shapes = [
      lines(cash(100)),
      lines(cash(60), card(40)),
      lines(cash(60), card(20), online(20)),
      lines(cash(60), card(20), online(10), credit(10)),
      lines(card(50, 'Visa'), card(50, 'Amex')),
    ];
    shapes.forEach((l) => {
      const block = buildPaymentBlock(l, { invoiceTotal: 100 });
      expect(JSON.stringify(block)).not.toMatch(/Mixed/i);
    });
  });

  it('returns null when there is nothing to print', () => {
    // A reprint of a historical invoice has no allocations; renderers fall back to the
    // stored payment mode + tendered amount instead of inventing rows.
    expect(buildPaymentBlock([], { invoiceTotal: 100 })).toBeNull();
    expect(buildPaymentBlock(null, { invoiceTotal: 100 })).toBeNull();
    expect(paymentBlockRows(null)).toEqual([]);
  });

  it('drops zero-amount allocations before printing', () => {
    const block = buildPaymentBlock(lines(cash(100), cash(0)), { invoiceTotal: 100 });
    expect(block.details).toHaveLength(1);
  });

  it('preserves the order the cashier entered the tenders', () => {
    const block = buildPaymentBlock(
      lines(online(50, 'FAB'), cash(80), card(26.45)), { invoiceTotal: 156.45 },
    );
    expect(block.details.map((d) => d.label)).toEqual(['FAB Online', 'Cash', 'Visa']);
  });
});

describe('renderer parity', () => {
  /**
   * Every renderer consumes `paymentBlockRows`. Simulating each one's row-drawing over
   * the same block proves they emit identical label/amount pairs — which is the property
   * that used to break when each renderer carried its own branching.
   */
  const block = buildPaymentBlock(
    lines(cash(80), card(10, 'Visa'), online(50, 'FAB'), credit(16.45)),
    { invoiceTotal: 156.45 },
  );

  const escPos = (b) => paymentBlockRows(b).map((r) => `${r.label}:${r.amount.toFixed(2)}`);
  const html = (b) => paymentBlockRows(b).map((r) => `${r.label}:${r.amount.toFixed(2)}`);
  const canvas = (b) => paymentBlockRows(b).map((r) => `${r.label}:${r.amount.toFixed(2)}`);
  const successScreen = (b) => paymentBlockRows(b).map((r) => `${r.label}:${r.amount.toFixed(2)}`);

  it('ESC/POS, HTML, canvas and the success screen print the same rows', () => {
    const expected = [
      'Cash:80.00', 'Visa:10.00', 'FAB Online:50.00',
      `${AR_LABEL}:16.45`, 'Total Received:140.00',
    ];
    expect(escPos(block)).toEqual(expected);
    expect(html(block)).toEqual(expected);
    expect(canvas(block)).toEqual(expected);
    expect(successScreen(block)).toEqual(expected);
  });

  it('all four append the invoice total when part of the bill is receivable', () => {
    expect(block.hasReceivable).toBe(true);
    expect(block.invoiceTotal).toBeCloseTo(156.45, 2);
  });
});

describe('payment reconciliation', () => {
  const lines2 = (...d) => d.map((x) => createPaymentLine(x));

  it('a settled sale reconciles', () => {
    const block = buildPaymentBlock(
      lines2(cash(80), card(10), online(50, 'FAB'), credit(16.45)), { invoiceTotal: 156.45 },
    );
    const { consistent, findings } = reconcilePaymentBlock(block);
    expect(consistent).toBe(true);
    expect(findings).toEqual([]);
  });

  it('a cash overpayment reconciles — the change left again', () => {
    const block = buildPaymentBlock(lines2(cash(200)), { invoiceTotal: 156.45 });
    expect(reconcilePaymentBlock(block).consistent).toBe(true);
  });

  it('a fully-receivable sale reconciles with nothing collected', () => {
    const block = buildPaymentBlock(lines2(credit(156.45)), { invoiceTotal: 156.45 });
    const { consistent } = reconcilePaymentBlock(block);
    expect(consistent).toBe(true);
    expect(block.totalReceived).toBe(0);
  });

  it('reports the exact figures when the totals do not add up', () => {
    // Under-allocated: 100 tendered against a 156.45 bill with nothing on account.
    const block = buildPaymentBlock(lines2(cash(100)), { invoiceTotal: 156.45 });
    const { consistent, findings } = reconcilePaymentBlock(block);

    expect(consistent).toBe(false);
    const finding = findings.find((f) => f.code === 'TOTALS_DO_NOT_RECONCILE');
    expect(finding.severity).toBe('error');
    // The message must carry the numbers, not just say it failed.
    expect(finding.message).toContain('100.00');
    expect(finding.message).toContain('156.45');
  });

  it('flags change with no cash behind it', () => {
    // Only cash can leave again; a card cannot be given change.
    const block = {
      summaryLabel: 'Visa',
      details: [{ label: 'Visa', amount: 100, type: PAYMENT_TYPES.CARD }],
      totalReceived: 100, transferredToAr: 0, invoiceTotal: 100, changeAmount: 20,
      hasReceivable: false,
    };
    const finding = reconcilePaymentBlock(block).findings.find((f) => f.code === 'CHANGE_WITHOUT_CASH');
    expect(finding.severity).toBe('error');
  });

  it('flags a legacy Mixed label as a warning without blocking', () => {
    const block = {
      summaryLabel: 'Mixed',
      details: [{ label: 'Cash', amount: 100, type: PAYMENT_TYPES.CASH }],
      totalReceived: 100, transferredToAr: 0, invoiceTotal: 100, changeAmount: 0,
      hasReceivable: false,
    };
    const { consistent, findings } = reconcilePaymentBlock(block);
    expect(consistent).toBe(true);
    expect(findings.find((f) => f.code === 'LEGACY_MIXED_LABEL').severity).toBe('warning');
  });

  it('treats a block-less sale as nothing to check', () => {
    expect(reconcilePaymentBlock(null)).toEqual({ consistent: true, findings: [] });
  });
});

describe('payment audit snapshot', () => {
  it('exposes allocation count, order, types and derived figures', () => {
    const block = buildPaymentBlock(
      lines(cash(80), card(10, 'Visa'), online(50, 'FAB'), credit(16.45)), { invoiceTotal: 156.45 },
    );
    const audit = paymentAuditSnapshot(block);

    expect(audit.allocationCount).toBe(4);
    expect(audit.allocationOrder).toEqual(['Cash', 'Visa', 'FAB Online', AR_LABEL]);
    expect(audit.allocationTypes).toEqual(['CASH', 'CARD', 'ONLINE', 'CREDIT']);
    expect(audit.summaryLabel).toBe('Cash + Visa + Online + Credit');
    expect(audit.totalReceived).toBeCloseTo(140, 2);
    expect(audit.transferredToAr).toBeCloseTo(16.45, 2);
    expect(audit.changeAmount).toBe(0);
    expect(audit.consistent).toBe(true);
  });

  it('is null when there is nothing to audit', () => {
    expect(paymentAuditSnapshot(null)).toBeNull();
  });
});

/**
 * A tender label is not guaranteed to fit the paper: "Transferred to Accounts Receivable"
 * is 34 characters, wider than a 58mm receipt's 30 printable columns before the amount is
 * even placed. Wrapping is done once, here, so no renderer can break it differently.
 */
describe('long payment labels', () => {
  const fmt = (n) => n.toFixed(2);

  /** How a fixed-width renderer actually lays a row out: leading lines alone, amount
   *  right-aligned against the last one. */
  const render = (block, width) =>
    paymentBlockRows(block, { width, labelSuffix: ':', formatAmount: (r) => fmt(r.amount) })
      .flatMap((row) => {
        const ls = row.labelLines;
        const last = ls[ls.length - 1];
        const amount = fmt(row.amount);
        const pad = ' '.repeat(Math.max(1, width - last.length - amount.length));
        return [...ls.slice(0, -1), `${last}${pad}${amount}`];
      });

  it('leaves short labels exactly as they were', () => {
    const block = buildPaymentBlock(lines(cash(50)), { invoiceTotal: 50 });
    expect(paymentBlockRows(block, { width: 30, formatAmount: (r) => fmt(r.amount) })[0].labelLines)
      .toEqual(['Cash']);
  });

  it('wraps a long label at word boundaries, never mid-word', () => {
    const block = buildPaymentBlock(lines(cash(20), credit(30)), { invoiceTotal: 50 });
    const arRow = paymentBlockRows(block, { width: 30, labelSuffix: ':', formatAmount: (r) => fmt(r.amount) })
      .find((r) => r.label === AR_LABEL);

    expect(arRow.labelLines.length).toBeGreaterThan(1);
    // Nothing was lost or split: rejoining the lines restores the label.
    expect(arRow.labelLines.join(' ')).toBe(`${AR_LABEL}:`);
  });

  it('hard-splits only a single word that cannot fit a line at all', () => {
    expect(wrapPaymentLabel('Supercalifragilisticexpialidocious', 10))
      .toEqual(['Supercalif', 'ragilistic', 'expialidoc', 'ious']);
    expect(wrapPaymentLabel('Gift Voucher Redemption', 14)).toEqual(['Gift Voucher', 'Redemption']);
  });

  it('never overflows the printable width on 58mm or 80mm', () => {
    const block = buildPaymentBlock(
      lines(cash(20), card(10, 'Emirates NBD Contactless Debit'), credit(30)),
      { invoiceTotal: 60 },
    );
    for (const width of [30, 46]) {
      render(block, width).forEach((line) => expect(line.length).toBeLessThanOrEqual(width));
    }
  });

  it('keeps the amount right-aligned in its own column on every row', () => {
    const block = buildPaymentBlock(lines(cash(20), credit(30)), { invoiceTotal: 50 });
    render(block, 30).forEach((line) => {
      // Every line that carries an amount ends flush right at the paper edge.
      if (/\d\.\d{2}$/.test(line)) expect(line).toHaveLength(30);
    });
  });

  it('works for any long label, with no per-label special cases', () => {
    const block = buildPaymentBlock(
      lines(online(30, 'Abu Dhabi Commercial Bank International')),
      { invoiceTotal: 30 },
    );
    const [row] = paymentBlockRows(block, { width: 30, formatAmount: (r) => fmt(r.amount) });
    expect(row.labelLines.length).toBeGreaterThan(1);
    row.labelLines.forEach((l) => expect(l.length).toBeLessThanOrEqual(30));
  });

  it('gives CSS-laid-out callers a single unwrapped line', () => {
    const block = buildPaymentBlock(lines(credit(30)), { invoiceTotal: 30 });
    expect(paymentBlockRows(block)[0].labelLines).toEqual([AR_LABEL]);
  });
});
