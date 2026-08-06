import { describe, expect, it } from 'vitest';

import {
  AR_LABEL,
  bankDisplayName,
  buildPaymentBlockFromRecords,
  matchesPaymentFilter,
  paymentBlockRows,
  paymentDetailsForExport,
  summaryLabelForModes,
  PAYMENT_FILTERS,
} from '../POS/payments/paymentPresentation';

/**
 * Back-office screens show sales settled minutes or years ago, so they read *recorded*
 * tender rows rather than live allocations. These tests pin that the recorded form produces
 * the same block the receipt printed — which is what lets the sales list, invoice preview,
 * customer history and exports share one presentation layer instead of each parsing the
 * invoice's paymentMode text.
 */

/** Shape returned by GET /api/sales/payments/invoice-summary. */
const rec = (label, type, amount, extra = {}) => ({ label, type, amount, ...extra });

describe('recorded tenders → the same block the receipt printed', () => {
  it('rebuilds a four-tender sale with receipt-identical rows', () => {
    const block = buildPaymentBlockFromRecords([
      rec('Cash', 'CASH', 80),
      rec('Visa', 'CARD', 10, { reference: 'AUTH-1' }),
      rec('Online', 'ONLINE', 50, { bankName: '1010 - FAB Current' }),
      rec('Credit', 'CREDIT', 16.45),
    ], { invoiceTotal: 156.45 });

    expect(paymentBlockRows(block).map((r) => `${r.label} ${r.amount.toFixed(2)}`)).toEqual([
      'Cash 80.00',
      'Visa 10.00',
      'FAB Current Online 50.00',
      `${AR_LABEL} 16.45`,
      'Total Received 140.00',
    ]);
    expect(block.totalReceived).toBeCloseTo(140, 2);
    expect(block.transferredToAr).toBeCloseTo(16.45, 2);
    expect(block.invoiceTotal).toBeCloseTo(156.45, 2);
  });

  it('strips the account code from a bank name for display', () => {
    expect(bankDisplayName('1010 - FAB Current')).toBe('FAB Current');
    expect(bankDisplayName('ADCB')).toBe('ADCB');
    expect(bankDisplayName(null)).toBeNull();
  });

  it('keeps several cards and several transfers on their own rows', () => {
    const block = buildPaymentBlockFromRecords([
      rec('Visa', 'CARD', 40),
      rec('Mastercard', 'CARD', 10),
      rec('Online', 'ONLINE', 30, { bankName: '1010 - FAB' }),
      rec('Online', 'ONLINE', 20, { bankName: '1020 - ADCB' }),
    ], { invoiceTotal: 100 });

    expect(block.details.map((d) => d.label)).toEqual([
      'Visa', 'Mastercard', 'FAB Online', 'ADCB Online',
    ]);
  });

  it('returns null when nothing was recorded, so the caller falls back', () => {
    // An unpaid credit invoice has no tender rows; the screen shows its stored label.
    expect(buildPaymentBlockFromRecords([], { invoiceTotal: 100 })).toBeNull();
    expect(buildPaymentBlockFromRecords(null, { invoiceTotal: 100 })).toBeNull();
  });

  it('drops zero-amount rows', () => {
    const block = buildPaymentBlockFromRecords([
      rec('Cash', 'CASH', 100), rec('Cash', 'CASH', 0),
    ], { invoiceTotal: 100 });
    expect(block.details).toHaveLength(1);
  });
});

describe('historical invoices keep working', () => {
  it('a sale stored as "Mixed" still yields real per-tender rows', () => {
    // The invoice text says Mixed; its tender rows never did.
    const block = buildPaymentBlockFromRecords([
      rec('Cash', 'CASH', 60), rec('Card', 'CARD', 40),
    ], { invoiceTotal: 100 });

    expect(block.summaryLabel).toBe('Cash + Card');
    expect(JSON.stringify(block)).not.toMatch(/Mixed/i);
  });

  it('a legacy single-mode sale renders as one row', () => {
    const block = buildPaymentBlockFromRecords([rec('Cash', 'CASH', 100)], { invoiceTotal: 100 });
    expect(paymentBlockRows(block)).toHaveLength(1);
  });
});

describe('allocation-aware filtering', () => {
  const splitBlock = buildPaymentBlockFromRecords([
    rec('Cash', 'CASH', 60), rec('Visa', 'CARD', 40),
  ], { invoiceTotal: 100 });
  const cashBlock = buildPaymentBlockFromRecords([rec('Cash', 'CASH', 100)], { invoiceTotal: 100 });

  it('a split sale appears under every tender it used', () => {
    // This is the case an equality test on paymentMode could never satisfy: the sale is
    // stored as "Cash + Visa", which equals neither "Cash" nor "Card".
    expect(matchesPaymentFilter('Cash', splitBlock, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('Card', splitBlock, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('Online', splitBlock, 'Cash + Visa')).toBe(false);
  });

  it('a single-tender sale appears only under its own tender', () => {
    expect(matchesPaymentFilter('Cash', cashBlock, 'Cash')).toBe(true);
    expect(matchesPaymentFilter('Card', cashBlock, 'Cash')).toBe(false);
  });

  it('"Mixed" means more than one tender, however the sale was recorded', () => {
    expect(matchesPaymentFilter('Mixed', splitBlock, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('Mixed', cashBlock, 'Cash')).toBe(false);
    // Historical invoice literally stored as "Mixed", with no block available.
    expect(matchesPaymentFilter('Mixed', null, 'Mixed')).toBe(true);
  });

  it('falls back to the stored label when no block is available', () => {
    expect(matchesPaymentFilter('Cash', null, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('Card', null, 'Card')).toBe(true);
    expect(matchesPaymentFilter('Online', null, 'Cash')).toBe(false);
  });

  it('All matches everything', () => {
    expect(matchesPaymentFilter('All', splitBlock, 'Cash + Visa')).toBe(true);
    expect(matchesPaymentFilter('All', null, null)).toBe(true);
    expect(matchesPaymentFilter(null, null, null)).toBe(true);
  });

  it('offers a stable, allocation-shaped filter list', () => {
    expect(PAYMENT_FILTERS).toEqual(['All', 'Cash', 'Card', 'Online', 'Credit', 'Advance', 'Mixed']);
  });
});

describe('exports carry the breakdown, not just a label', () => {
  it('renders one cell per tender', () => {
    const block = buildPaymentBlockFromRecords([
      rec('Cash', 'CASH', 80), rec('Visa', 'CARD', 10), rec('Credit', 'CREDIT', 16.45),
    ], { invoiceTotal: 106.45 });

    expect(paymentDetailsForExport(block, 'Cash + Visa + Credit'))
      .toBe(`Cash 80.00 | Visa 10.00 | ${AR_LABEL} 16.45`);
  });

  it('falls back to the stored label for a sale with no recorded tender', () => {
    expect(paymentDetailsForExport(null, 'Mixed')).toBe('Mixed');
    expect(paymentDetailsForExport(null, null)).toBe('');
  });
});

describe('one summary-label implementation', () => {
  it('de-duplicates and preserves order for plain mode records', () => {
    // The back-office settlement modal and the split-payment list work with {mode, amount}
    // records rather than allocations; both now share this rule instead of each rolling
    // their own join, which is how one ends up de-duplicating and the other doesn't.
    expect(summaryLabelForModes([{ mode: 'Cash' }, { mode: 'Visa' }])).toBe('Cash + Visa');
    expect(summaryLabelForModes([{ mode: 'Cash' }, { mode: 'Cash' }])).toBe('Cash');
    expect(summaryLabelForModes([{ mode: 'Visa' }, { mode: 'Cash' }])).toBe('Visa + Cash');
  });

  it('ignores blank modes and reports nothing for an empty set', () => {
    expect(summaryLabelForModes([{ mode: '' }, { mode: '  ' }])).toBeNull();
    expect(summaryLabelForModes([])).toBeNull();
    expect(summaryLabelForModes(null)).toBeNull();
  });

  it('never produces the word Mixed', () => {
    expect(summaryLabelForModes([{ mode: 'Cash' }, { mode: 'Card' }])).not.toMatch(/Mixed/i);
  });
});
