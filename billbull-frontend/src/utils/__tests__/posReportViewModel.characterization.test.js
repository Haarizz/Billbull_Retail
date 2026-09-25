import { describe, expect, it } from 'vitest';

import {
  buildXReportViewModel,
  buildZReportViewModel,
  calculateDenominationTotal,
  money,
} from '../posReportViewModel';
import { DENOM_KEYS } from '../cashDenominations';

/**
 * CHARACTERIZATION SUITE — X and Z report view-models.
 *
 * buildXReportViewModel / buildZReportViewModel are pure transformations from the raw
 * `GET /api/pos/sessions/{id}/x-report` and `/reports/z` payloads onto the structure the
 * A4 and thermal renderers print. They are the deterministic transformation layer the
 * brief asks for: no I/O, no React, and the Z-report is the day's accounting record.
 *
 * Two fields are genuinely nondeterministic and are normalised away rather than asserted:
 *   - reportMeta "Date & Time" — literally `new Date().toLocaleString()` (render clock)
 *   - fmtTs()-formatted timestamps — parsed as UTC then printed with local getters, so
 *     they shift with the machine's timezone.
 * Everything financial is asserted explicitly.
 */

/** Drops the render-clock row so the rest of reportMeta can be compared. */
const metaWithoutClock = (vm) => vm.reportMeta.filter((m) => m.label !== 'Date & Time');

const section = (vm, title) => vm.sections.find((s) => s.title === title);
const kpi = (vm, label) => vm.kpis.find((k) => k.label === label);

/**
 * A drawer count that totals AED 1,246.35 — chosen to exercise notes and coins.
 *
 * The keys MUST be quoted strings. A numeric object-literal key is normalised by the
 * JS engine ('0.10' becomes '0.1', '0.50' becomes '0.5'), which no longer matches the
 * DENOM_KEYS ladder and silently renders those rows as zero.
 */
const DENOMINATIONS = {
  '1000': 1, '500': 0, '200': 1, '100': 0, '50': 0, '20': 2, '10': 0, '5': 1,
  '1': 1, '0.50': 0, '0.25': 1, '0.10': 1, '0.05': 0,
};

/**
 * X-Report payload. Every key here is one buildXReportViewModel actually reads —
 * verified against the implementation, not invented.
 */
const X_REPORT = {
  reportNumber: 'XR-000000042',
  session: {
    id: 42,
    openingCash: 500,
    tradingDate: '2026-09-07',
    branchName: 'Main Branch',
    terminalId: 'TERM-01',
    counterName: 'Counter 1',
    openedBy: 'cashier1',
    openedByDisplayName: 'Aisha K.',
    openedAt: '2026-09-07T06:00:00Z',
    closedAt: '2026-09-07T15:30:00Z',
  },
  sessionInfo: {
    sessionNo: 'SESS-000042',
    branch: 'Main Branch',
    terminalId: 'TERM-01',
    counter: 'Counter 1',
    device: 'POS-80C',
    shift: 'Morning',
    cashierDisplayName: 'Aisha K.',
    businessDate: '2026-09-07',
    durationSeconds: 34200,
    cardBatchNo: 'BATCH-0912',
    cardSettlementVerified: true,
    // X resolves its denomination table from sessionInfo.closingDenominationsJson —
    // an OBJECT here. Z's payload uses the same field name for an ARRAY of per-session
    // rows. Same name, different shape between the two reports.
    closingDenominationsJson: JSON.stringify(DENOMINATIONS),
  },
  summary: {
    openingCash: 500,
    cashSales: 1200.5,
    cardSales: 800.25,
    creditSales: 300,
    bankTransferSales: 150,
    otherSales: 150,
    otherInvoiceCount: 2,
    totalSales: 2450.75,
    totalPaid: 2450.75,
    totalTax: 116.7,
    salesAmountExTax: 2334.05,
    totalDiscount: 45.5,
    cashDropIn: 100,
    cashDropOut: 250,
    invoiceCount: 17,
    cashInvoiceCount: 9,
    cardInvoiceCount: 5,
    creditInvoiceCount: 1,
    totalTenderCount: 17,
    totalItemsSold: 63,
    expectedCash: 1550.5,
    countedCash: 1246.35,
    cashVariance: -304.15,
    reconciliationStatus: 'SHORT',
    totalRefunds: 60,
    totalRefundCount: 1,
    cardRefundSales: 60,
    cardRefundCount: 1,
    voidAmount: 25,
    closingDenominations: DENOMINATIONS,
    cashPosition: {
      cashDropRows: [
        { slNo: 1, type: 'Cash In', amount: 100 },
        { slNo: 2, type: 'Cash Out', amount: 250 },
      ],
    },
    cardTypeBreakdown: [
      { cardType: 'Visa', count: 3, amount: 500.25 },
      { cardType: 'Mastercard', count: 2, amount: 300 },
    ],
  },
  voids: [],
  cartRemovals: [],
  cashiers: [{ cashier: 'cashier1', cashierDisplayName: 'Aisha K.' }],
};

const Z_REPORT = {
  reportNumber: 'ZR-000000042',
  date: '2026-09-07',
  // Z sources its denomination table from this ARRAY of per-session rows (each carrying
  // a closingDenominationsJson blob), not from summary.closingDenominations the way the
  // X-Report does. The two reports read different fields for the same physical count.
  sessionInfo: [
    {
      sessionNo: 'SESS-000042',
      cashierDisplayName: 'Aisha K.',
      openedAt: '2026-09-07T06:00:00Z',
      closedAt: '2026-09-07T15:30:00Z',
      expectedCash: 1550.5,
      closingCash: 1246.35,
      closingDenominationsJson: JSON.stringify(DENOMINATIONS),
    },
    {
      sessionNo: 'SESS-000043',
      cashierDisplayName: 'Omar R.',
      openedAt: '2026-09-07T15:30:00Z',
      closedAt: '2026-09-07T22:00:00Z',
      expectedCash: 900,
      closingCash: 900,
      closingDenominationsJson: JSON.stringify({ '500': 1, '200': 2 }),
    },
  ],
  sessions: [
    { id: 42, openingCash: 500, expectedCash: 1550.5, closingCash: 1246.35, openedBy: 'cashier1', openedAt: '2026-09-07T06:00:00Z', closedAt: '2026-09-07T15:30:00Z' },
    { id: 43, openingCash: 300, expectedCash: 900, closingCash: 900, openedBy: 'cashier2', openedAt: '2026-09-07T15:30:00Z', closedAt: '2026-09-07T22:00:00Z' },
  ],
  invoices: [
    { invoiceNumber: 'INV-0002', paymentMode: 'Cash', invoiceTotal: 1200.5 },
    { invoiceNumber: 'INV-0001', paymentMode: 'Credit', invoiceTotal: 300 },
    { invoiceNumber: 'INV-0003', paymentMode: 'Credit Card', invoiceTotal: 800.25 },
  ],
  summary: {
    totalSales: 3350.75,
    cashSales: 1700.5,
    cardSales: 1000.25,
    creditSales: 300,
    bankTransferSales: 350,
    totalTax: 159.56,
    salesAmountExTax: 3191.19,
    totalDiscount: 60,
    totalItemsSold: 92,
    invoiceCount: 24,
    sessionCount: 2,
    cashInvoiceCount: 14,
    cardInvoiceCount: 8,
    creditInvoiceCount: 1,
    totalPaid: 3350.75,
    voidAmount: 25,
    totalRefunds: 60,
    expectedCash: 2450.5,
    countedCash: 2146.35,
    cashVariance: -304.15,
    closingDenominations: DENOMINATIONS,
    cashPosition: {
      openingCash: 800,
      cashSales: 1700.5,
      customerReceiptsTotal: 0,
      customerAdvancesTotal: 0,
      cashDropIn: 100,
      cashDropOut: 250,
      cashDropRows: [{ slNo: 1, type: 'Cash Out', amount: 250 }],
    },
  },
  voids: [],
  cartRemovals: [],
  cashiers: [
    { cashier: 'cashier1', cashierDisplayName: 'Aisha K.' },
    { cashier: 'cashier2', cashierDisplayName: 'Omar R.' },
  ],
};

describe('calculateDenominationTotal', () => {
  it('multiplies each denomination key by its count', () => {
    // 1000 + 200 + 40 + 5 + 1 + 0.25 + 0.10
    expect(calculateDenominationTotal(DENOMINATIONS)).toBeCloseTo(1246.35, 6);
  });

  it('returns 0 for a missing or non-object count', () => {
    expect(calculateDenominationTotal(null)).toBe(0);
    expect(calculateDenominationTotal(undefined)).toBe(0);
    expect(calculateDenominationTotal('nope')).toBe(0);
  });

  it('CHARACTERIZED QUIRK: an unrecognised key is summed as NaN rather than ignored', () => {
    // parseFloat('lorem') is NaN and nothing filters it, so one stray key poisons the
    // whole total. Real payloads only carry ladder keys, so this is latent, not live.
    expect(Number.isNaN(calculateDenominationTotal({ lorem: 2 }))).toBe(true);
  });
});

describe('money()', () => {
  it('renders an em dash for a genuinely absent value, not zero', () => {
    // The NOT_COUNTED vs COUNTED_ZERO distinction: a drawer counted and found empty is
    // not an uncounted drawer.
    expect(money(null)).toBe('—');
    expect(money(undefined)).toBe('—');
    expect(money(0)).toBe('0.00');
    expect(money(0, (n) => `AED ${Number(n).toFixed(2)}`)).toBe('AED 0.00');
  });
});

describe('buildXReportViewModel', () => {
  const vm = buildXReportViewModel(X_REPORT, { currency: 'AED' });

  it('titles the report and derives the header note from the session, not today', () => {
    expect(vm.reportTitle).toBe('X-Report / Session Close Report');
    expect(vm.note).toBe(
      'Report No: XR-000000042  |  Cashier: Aisha K.  |  Session: SESS-000042  |  Date: 2026-09-07',
    );
  });

  it('carries the session identity in reportMeta', () => {
    expect(metaWithoutClock(vm)).toEqual([
      { label: 'Report No', value: 'XR-000000042' },
      { label: 'Session No', value: 'SESS-000042' },
      { label: 'Cashier', value: 'Aisha K.' },
      { label: 'Business Date', value: '2026-09-07' },
      { label: 'Terminal', value: 'TERM-01' },
    ]);
  });

  it('formats every KPI as "AED n.nn"', () => {
    expect(kpi(vm, 'Opening Cash').value).toBe('AED 500.00');
    expect(kpi(vm, 'Total Sales').value).toBe('AED 2450.75');
    expect(kpi(vm, 'Cash Sales').value).toBe('AED 1200.50');
    expect(kpi(vm, 'Card Sales').value).toBe('AED 800.25');
    expect(kpi(vm, 'Credit Sales').value).toBe('AED 300.00');
    expect(kpi(vm, 'Online / Bank Transfer').value).toBe('AED 150.00');
    expect(kpi(vm, 'Returns').value).toBe('AED 60.00');
    expect(kpi(vm, 'Discounts').value).toBe('AED 45.50');
  });

  it('reports Expected, Actual and Variance exactly as the backend supplied them', () => {
    // There is deliberately no client-side Expected Cash formula: a second
    // implementation is how X and Z drifted apart before.
    expect(kpi(vm, 'Expected Cash').value).toBe('AED 1550.50');
    expect(kpi(vm, 'Actual Cash').value).toBe('AED 1246.35');
    expect(kpi(vm, 'Cash Variance').value).toBe('AED -304.15');
    expect(kpi(vm, 'Cash Variance').hint).toBe('Short');
  });

  it('renders an uncounted drawer as an em dash, never as zero', () => {
    const uncounted = buildXReportViewModel({
      ...X_REPORT,
      summary: { ...X_REPORT.summary, countedCash: null, cashVariance: null, reconciliationStatus: undefined },
    }, { currency: 'AED' });

    expect(kpi(uncounted, 'Actual Cash').value).toBe('—');
    expect(kpi(uncounted, 'Cash Variance').value).toBe('—');
    expect(kpi(uncounted, 'Cash Variance').hint).toBe('Pending Count');
  });

  it('lays the denomination table out over the full ladder, zeroes included', () => {
    const denom = section(vm, '1. Denomination Count');

    expect(denom.cols).toEqual(['Denomination', 'Quantity', 'Total Amount']);
    expect(denom.rows).toHaveLength(DENOM_KEYS.length);
    expect(denom.rows[0]).toEqual(['AED 1000', '1', 'AED 1000.00']);
    expect(denom.rows[1]).toEqual(['AED 500', '0', 'AED 0.00']);
    expect(denom.rows[2]).toEqual(['AED 200', '1', 'AED 200.00']);
    expect(denom.rows[5]).toEqual(['AED 20', '2', 'AED 40.00']);
    expect(denom.rows[10]).toEqual(['AED 0.25 Coin', '1', 'AED 0.25']);
    expect(denom.footer).toEqual(['Total Cash Counted', '', 'AED 1246.35']);
  });

  it('summarises the cash drawer from backend figures only', () => {
    const drawer = section(vm, '2. Cash Drawer Summary');

    expect(drawer.rows).toEqual([
      ['Opening Cash / Float', 'AED 500.00'],
      ['Cash Sales', 'AED 1200.50'],
      ['Cash Drop In', 'AED 100.00'],
      ['Cash Drop Out', 'AED 250.00'],
      ['Expected Cash in Drawer', 'AED 1550.50'],
      ['Actual Cash Counted', 'AED 1246.35'],
    ]);
    expect(drawer.footer).toEqual(['Cash Variance (Short)', 'AED -304.15']);
  });

  it('parenthesises a cash-out in the informational context block', () => {
    const context = section(vm, '2a. Cash Context — Back-Office / Non-Drawer (Informational)');
    expect(context.rows).toContainEqual(['Cash Drop Out', '(AED 250.00)']);
    expect(context.footer).toEqual(['Drawer reconciliation is reported above', '']);
  });

  it('nets card refunds off card sales in the settlement summary', () => {
    const settle = section(vm, '4. Card / Bank Settlement Summary');

    expect(settle.rows).toEqual([
      ['Visa', '3', 'AED 500.25'],
      ['Mastercard', '2', 'AED 300.00'],
      ['Card Sales', '5', 'AED 800.25'],
      ['Card Refunds', '1', '(AED 60.00)'],
      ['Net Card Settlement', '4', 'AED 740.25'],
      ['Card Machine Batch No.', 'BATCH-0912', ''],
      ['Card Settlement Verified', 'Yes', ''],
    ]);
  });

  it('adds an Online tender row only when there were other sales', () => {
    const withOnline = section(vm, '3. Payment / Tender Summary');
    expect(withOnline.rows.map((r) => r[0])).toEqual(['Cash', 'Card', 'Credit', 'Online']);
    expect(withOnline.footer).toEqual(['Total Collected', '17', 'AED 2450.75']);

    const noOther = buildXReportViewModel({
      ...X_REPORT,
      summary: { ...X_REPORT.summary, otherSales: 0 },
    }, { currency: 'AED' });
    expect(section(noOther, '3. Payment / Tender Summary').rows.map((r) => r[0]))
      .toEqual(['Cash', 'Card', 'Credit']);
  });

  it('falls back to a padded session id when no report number was issued', () => {
    const vmNoNumber = buildXReportViewModel({ ...X_REPORT, reportNumber: undefined }, {});
    expect(vmNoNumber.reportMeta.find((m) => m.label === 'Report No').value).toBe('XR-000000042');
  });

  it('survives an empty payload without throwing', () => {
    const empty = buildXReportViewModel({}, {});
    expect(empty.reportTitle).toBe('X-Report / Session Close Report');
    expect(kpi(empty, 'Total Sales').value).toBe('AED 0.00');
    expect(kpi(empty, 'Actual Cash').value).toBe('—');
    expect(empty.reportMeta.find((m) => m.label === 'Business Date').value).toBe('—');
  });

  it('honours a non-AED currency label', () => {
    const sar = buildXReportViewModel(X_REPORT, { currency: 'SAR' });
    expect(kpi(sar, 'Total Sales').value).toBe('SAR 2450.75');
  });
});

describe('buildZReportViewModel', () => {
  const vm = buildZReportViewModel(Z_REPORT, { currency: 'AED', businessDate: '2026-09-07' });

  it('aggregates the day across every session', () => {
    expect(section(vm, '0. Session Information').rows).toHaveLength(2);
    expect(vm.reportMeta.find((m) => m.label === 'Report No')?.value).toBe('ZR-000000042');
  });

  it('reports the day sales summary from backend figures', () => {
    const sales = section(vm, '2. Sales Summary');

    expect(sales.rows).toEqual([
      ['Gross Sales', 'AED 3350.75'],
      ['Total Discount', '(AED 60.00)'],
      ['Net Sales Before VAT', 'AED 3191.19'],
      ['VAT Amount (5%)', 'AED 159.56'],
      ['Net Sales Including VAT', 'AED 3350.75'],
    ]);
  });

  it('CHARACTERIZED QUIRK: the VAT row is labelled "(5%)" regardless of the actual rate', () => {
    // The label is a hard-coded string, not derived from the branch rate or from the
    // rates actually charged. A 0% or mixed-rate day still prints "VAT Amount (5%)".
    const zeroVat = buildZReportViewModel({
      ...Z_REPORT,
      summary: { ...Z_REPORT.summary, totalTax: 0, salesAmountExTax: 3350.75 },
    }, { currency: 'AED' });

    const row = section(zeroVat, '2. Sales Summary').rows.find((r) => r[0].startsWith('VAT Amount'));
    expect(row).toEqual(['VAT Amount (5%)', 'AED 0.00']);
  });

  it('sums the denomination count across every session of the day', () => {
    const denom = section(vm, '1. Denomination Count');

    expect(denom.rows[0]).toEqual(['AED 1000', '1', 'AED 1000.00']);   // session 42 only
    expect(denom.rows[1]).toEqual(['AED 500', '1', 'AED 500.00']);     // session 43 only
    expect(denom.rows[2]).toEqual(['AED 200', '3', 'AED 600.00']);     // 1 + 2 across both
    expect(denom.rows[5]).toEqual(['AED 20', '2', 'AED 40.00']);
    expect(denom.rows[11]).toEqual(['AED 0.10 Coin', '1', 'AED 0.10']);
    expect(denom.footer).toEqual(['Total Cash Counted', '', 'AED 2146.35']);
  });

  it('CHARACTERIZED RISK: the Z denomination footer is computed locally, not read from countedCash', () => {
    // "Total Cash Counted" is calculateDenominationTotal() over the summed per-session
    // closingDenominationsJson blobs — an independent client-side figure. The
    // backend-authoritative count lives in summary.countedCash and is rendered
    // elsewhere. The fixture makes them agree (2146.35); nothing in the code forces
    // that. A session closed without a denomination breakdown contributes 0 here while
    // still contributing to countedCash, so the two can disagree on a real day.
    const denom = section(vm, '1. Denomination Count');
    expect(denom.footer[2]).toBe('AED 2146.35');
    expect(Z_REPORT.summary.countedCash).toBe(2146.35);

    const missingBreakdown = buildZReportViewModel({
      ...Z_REPORT,
      sessionInfo: Z_REPORT.sessionInfo.map((s) => ({ ...s, closingDenominationsJson: null })),
    }, { currency: 'AED' });
    // countedCash is unchanged, but the denomination footer collapses to zero.
    expect(section(missingBreakdown, '1. Denomination Count').footer[2]).toBe('AED 0.00');
  });

  it('classifies a Credit invoice but not a Credit Card invoice as credit', () => {
    // The filter is a substring match on paymentMode that excludes anything also
    // containing "card", so "Credit Card" must not be counted as a credit sale.
    const creditSection = section(vm, '11. Customer Credit Summary');

    expect(creditSection.rows[0]).toEqual(['Credit Sales', '1', 'AED 300.00']);
    expect(creditSection.rows[1]).toEqual(['Outstanding Created Today', '1', 'AED 300.00']);
    // INV-0003 is "Credit Card" at 800.25 — excluded. Had it been counted the figure
    // would read AED 1100.25.
    expect(creditSection.rows[0][2]).not.toBe('AED 1100.25');
  });

  it('names every cashier who worked the day', () => {
    expect(JSON.stringify(vm)).toContain('Aisha K.');
    expect(JSON.stringify(vm)).toContain('Omar R.');
  });

  it('survives an empty payload without throwing', () => {
    const empty = buildZReportViewModel({}, {});
    expect(empty.sections.length).toBeGreaterThan(0);
    expect(JSON.stringify(empty)).toContain('AED 0.00');
  });
});

describe('X and Z denomination tables — same ladder, different sources', () => {
  const x = buildXReportViewModel(X_REPORT, { currency: 'AED' });
  const z = buildZReportViewModel(Z_REPORT, { currency: 'AED' });

  it('renders the identical ladder, in the identical order, with identical labels', () => {
    const xDenom = section(x, '1. Denomination Count');
    const zDenom = section(z, '1. Denomination Count');

    expect(zDenom.cols).toEqual(xDenom.cols);
    expect(zDenom.rows.map((r) => r[0])).toEqual(xDenom.rows.map((r) => r[0]));
    expect(zDenom.rows).toHaveLength(DENOM_KEYS.length);
    expect(xDenom.rows).toHaveLength(DENOM_KEYS.length);
  });

  it('CHARACTERIZED RISK: they read different fields for the same physical count', () => {
    // X reads sessionInfo.closingDenominationsJson (one session's count, an object).
    // Z sums sessionInfo[].closingDenominationsJson (per-session blobs).
    // Neither reads the other's field, so a backend change to one shape silently
    // zeroes the other report's denomination table rather than failing loudly.
    const xOnlySession = section(x, '1. Denomination Count').footer[2];
    const zAllSessions = section(z, '1. Denomination Count').footer[2];

    expect(xOnlySession).toBe('AED 1246.35');   // session 42 alone
    expect(zAllSessions).toBe('AED 2146.35');   // sessions 42 + 43
  });
});
