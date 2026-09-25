import { describe, expect, it } from 'vitest';

import {
  buildXReportExcelRows,
  buildZReportExcelSections,
} from '../POS/features/reports/reportExcelBuilders';

/**
 * CHARACTERIZATION — the X/Z report Excel row builders.
 *
 * These were closures inside POSSales.jsx and therefore unreachable from any test. The
 * Phase 3 decomposition made them pure module functions (the values they used to read
 * from the enclosing scope are now parameters), so the rows exportToExcel() writes can
 * finally be asserted.
 *
 * Nothing about the rows themselves changed. These tests describe the CURRENT output.
 */

const DENOMINATIONS = {
  '1000': 1, '500': 0, '200': 1, '100': 0, '50': 0, '20': 2, '10': 0, '5': 1,
  '1': 1, '0.50': 0, '0.25': 1, '0.10': 1, '0.05': 0,
};

const Z_REPORT = {
  summary: {
    totalSales: 3350.75,
    cashSales: 1700.5,
    cardSales: 1000.25,
    creditSales: 300,
    totalTax: 159.56,
    salesAmountExTax: 3191.19,
    totalDiscount: 60,
    totalItemsSold: 92,
    invoiceCount: 24,
    cashInvoiceCount: 14,
    cardInvoiceCount: 8,
    creditInvoiceCount: 1,
    totalRefunds: 60,
    totalRefundCount: 1,
    expectedCash: 2450.5,
    cashDropIn: 100,
    cashDropOut: 250,
  },
  sessions: [
    { id: 42, openingCash: 500 },
    { id: 43, openingCash: 300 },
  ],
  invoices: [
    { invoiceNumber: 'INV-0001', paymentMode: 'Cash', invoiceTotal: 1200.5 },
    { invoiceNumber: 'INV-0002', paymentMode: 'Credit Card', invoiceTotal: 800.25 },
  ],
};

const X_REPORT = {
  summary: {
    openingCash: 500,
    cashSales: 1200.5,
    cardSales: 800.25,
    creditSales: 300,
    otherSales: 150,
    totalSales: 2450.75,
    totalPaid: 2450.75,
    totalTax: 116.7,
    salesAmountExTax: 2334.05,
    totalDiscount: 45.5,
    invoiceCount: 17,
    cashInvoiceCount: 9,
    cardInvoiceCount: 5,
    creditInvoiceCount: 1,
    otherInvoiceCount: 2,
    totalTenderCount: 17,
    expectedCash: 1550.5,
    totalRefunds: 60,
    refundCount: 1,
    cardBatchNo: 'BATCH-0912',
    cardSettlementVerified: true,
  },
  session: { id: 42, openingCash: 500 },
  invoices: [
    { invoiceNumber: 'INV-0001', paymentMode: 'Cash', invoiceTotal: 1200.5 },
  ],
};

const xArgs = (overrides = {}) => ({
  xReportData: X_REPORT,
  currentSession: { id: 42, openingCash: 500 },
  closingDenominations: DENOMINATIONS,
  xReportCardBatchNo: 'BATCH-0912',
  xReportCardVerified: true,
  ...overrides,
});

/** Rows are flat {Section, Description, Count, Amount} records. */
const descriptions = (rows) => rows.map((r) => r.Description);
const findRow = (rows, description) => rows.find((r) => r.Description === description);

describe('buildZReportExcelSections', () => {
  const rows = buildZReportExcelSections(Z_REPORT);

  it('returns a flat array of export records', () => {
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => {
      expect(Object.keys(r).sort()).toEqual(['Amount', 'Count', 'Description', 'Section']);
    });
  });

  it('rounds every numeric amount to 2 decimals as a NUMBER', () => {
    rows.filter((r) => typeof r.Amount === 'number').forEach((r) => {
      expect(Number(r.Amount.toFixed(2))).toBe(r.Amount);
    });
  });

  it('CHARACTERIZED QUIRK: the Amount column is not always a number', () => {
    // Two rows put non-numeric text in the money column, so a spreadsheet built from
    // these rows has a mixed-type column that will not total.
    expect(findRow(rows, 'Cash Refunds (Cash)').Amount).toBe('Not tracked');
    expect(findRow(rows, 'First Invoice').Amount).toBe('');
    expect(findRow(rows, 'Last Invoice').Amount).toBe('');
  });

  it('carries the day sales figures through unmodified', () => {
    expect(findRow(rows, 'Gross Sales').Amount).toBe(3350.75);
    expect(findRow(rows, 'Net Sales Before VAT').Amount).toBe(3191.19);
    // CHARACTERIZED QUIRK: the label hard-codes "(5%)" regardless of the actual rate —
    // the same defect the Z view-model carries.
    expect(findRow(rows, 'VAT Amount (5%)').Amount).toBe(159.56);
  });

  it('sums opening cash across every session of the day', () => {
    expect(findRow(rows, 'Opening Cash / Float').Amount).toBe(800);   // 500 + 300
  });

  it('takes expected cash from the backend rather than recomputing it', () => {
    expect(findRow(rows, 'Expected Cash in Drawer').Amount).toBe(2450.5);
  });

  it('reports only the first and last invoice number, not the full list', () => {
    // The Z export summarises the range; the per-invoice list is an X-report feature.
    // Both numbers go in the Count column, leaving Amount blank.
    expect(descriptions(rows)).toContain('First Invoice');
    expect(findRow(rows, 'First Invoice').Count).toBe('INV-0001');
    expect(findRow(rows, 'Last Invoice').Count).toBe('INV-0002');
    expect(descriptions(rows).filter((d) => d.startsWith('INV-'))).toEqual([]);
  });

  it('CHARACTERIZED QUIRK: the Total Items Sold row carries SALES VALUE in its Amount', () => {
    // Count holds the item count; Amount holds totalSales, not an item quantity. A
    // reader summing the Amount column double-counts the day's takings.
    const row = findRow(rows, 'Total Items Sold');
    expect(row.Count).toBe('92');
    expect(row.Amount).toBe(3350.75);
  });

  it('survives an empty report without throwing', () => {
    const empty = buildZReportExcelSections({});
    expect(Array.isArray(empty)).toBe(true);
    expect(findRow(empty, 'Gross Sales').Amount).toBe(0);
  });

  it('survives a missing report without throwing', () => {
    expect(Array.isArray(buildZReportExcelSections(undefined))).toBe(true);
  });
});

describe('buildXReportExcelRows', () => {
  const rows = buildXReportExcelRows(xArgs());

  it('returns a flat array of export records', () => {
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => {
      expect(Object.keys(r).sort()).toEqual(['Amount', 'Count', 'Description', 'Section']);
    });
  });

  it('carries the session sales figures through unmodified', () => {
    expect(findRow(rows, 'Opening Cash / Float').Amount).toBe(500);
    expect(findRow(rows, 'Cash Sales').Amount).toBe(1200.5);
    expect(findRow(rows, 'Expected Cash in Drawer').Amount).toBe(1550.5);
  });

  it('expands the denomination count it is handed', () => {
    // The parameter replaced a getReportClosingDenominations() closure call.
    expect(findRow(rows, 'AED 1000').Count).toBe(1);
    expect(findRow(rows, 'AED 1000').Amount).toBe(1000);
    expect(findRow(rows, 'AED 20').Count).toBe(2);
    expect(findRow(rows, 'AED 20').Amount).toBe(40);
    expect(findRow(rows, 'AED 0.25 Coin').Amount).toBe(0.25);
  });

  it('reports the card batch number and verification flag it is handed', () => {
    const verified = buildXReportExcelRows(xArgs());
    expect(JSON.stringify(verified)).toContain('BATCH-0912');

    const unverified = buildXReportExcelRows(xArgs({
      xReportData: { ...X_REPORT, summary: { ...X_REPORT.summary, cardSettlementVerified: undefined } },
      xReportCardVerified: false,
    }));
    expect(JSON.stringify(unverified)).toContain('No');
  });

  it('falls back to the current session when the report carries none', () => {
    const rowsNoSession = buildXReportExcelRows(xArgs({
      xReportData: { ...X_REPORT, session: undefined, summary: { ...X_REPORT.summary, openingCash: undefined } },
    }));
    expect(findRow(rowsNoSession, 'Opening Cash / Float').Amount).toBe(500);
  });

  it('treats an absent denomination count as an empty drawer', () => {
    const rowsNoDenoms = buildXReportExcelRows(xArgs({ closingDenominations: {} }));
    expect(findRow(rowsNoDenoms, 'AED 1000').Count).toBe(0);
    expect(findRow(rowsNoDenoms, 'AED 1000').Amount).toBe(0);
  });

  it('CHARACTERIZED CONTRACT: a denomination map is required', () => {
    // Before the extraction this value came from a getReportClosingDenominations()
    // closure that always returned an object, so the builder never saw undefined. The
    // single call site still always supplies it; the throw documents the contract rather
    // than a reachable production path.
    expect(() => buildXReportExcelRows(xArgs({ closingDenominations: undefined })))
      .toThrow(TypeError);
  });
});
