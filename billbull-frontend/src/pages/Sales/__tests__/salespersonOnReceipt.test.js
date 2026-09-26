import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { buildThermalReceiptHtml, buildThermalReceiptText } from '../POS/posPrintUtils';

/**
 * Cashier AND Salesperson, in that order, on every receipt path.
 *
 * They are INDEPENDENT identities: the cashier is the logged-in operator who rang the sale up,
 * the salesperson is who the sale is attributed to for commission. One never replaces the other,
 * and both must appear — that is what makes "who served me" answerable from the paper.
 *
 * The preview, the real print and the reprint are three different renderers. Behaviour is
 * asserted directly for the two pure builders; the others are asserted against their source,
 * because they need a canvas / ESC/POS device context that this suite has no business faking.
 */

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

const invoice = (over = {}) => ({
  invoiceNumber: 'INV-2026-9001',
  invoiceDate: '2026-09-23',
  createdAt: '2026-09-23T10:00:00Z',
  customerName: 'Walk-in Customer',
  paymentMode: 'Cash',
  subTotal: 100,
  taxTotal: 0,
  invoiceTotal: 100,
  items: [{ itemName: 'Widget', quantity: 1, unitPrice: 100, netAmount: 100 }],
  ...over,
});

const opts = (over = {}) => ({
  companyName: 'BillBull', trn: '100000000000003',
  cashierName: 'Admin', terminalId: 'T1', counterName: 'C1',
  ...over,
});

describe('HTML thermal receipt (checkout preview + browser print)', () => {
  it('prints Salesperson immediately after Cashier', () => {
    const html = buildThermalReceiptHtml('80mm', invoice(), opts({ salespersonName: 'Manager One' }));
    expect(html).toContain('Cashier:');
    expect(html).toContain('Salesperson:');
    expect(html).toContain('Manager One');
    expect(html.indexOf('Cashier:')).toBeLessThan(html.indexOf('Salesperson:'));
  });

  it('keeps the cashier untouched', () => {
    const html = buildThermalReceiptHtml('80mm', invoice(), opts({ salespersonName: 'Manager One' }));
    expect(html).toContain('Admin');
  });

  it('falls back to the invoice\'s persisted name — the REPRINT path', () => {
    // A reprint rebuilds from the stored invoice long after the till moved on, so there is no
    // live salesperson to pass; the persisted name is the only source.
    const html = buildThermalReceiptHtml('80mm', invoice({ salespersonName: 'Manager One' }), opts());
    expect(html).toContain('Salesperson:');
    expect(html).toContain('Manager One');
  });

  it('omits the row entirely when the sale has no salesperson', () => {
    const html = buildThermalReceiptHtml('80mm', invoice(), opts());
    expect(html).toContain('Cashier:');
    expect(html).not.toContain('Salesperson:');
  });
});

describe('text/GDI receipt (ESC/POS compatibility fallback + print-job audit payload)', () => {
  it('prints Salesperson immediately after Cashier', () => {
    const text = buildThermalReceiptText('80mm', invoice(), opts({ salespersonName: 'Manager One' }));
    expect(text).toContain('Cashier');
    expect(text).toContain('Salesperson');
    expect(text).toContain('Manager One');
    expect(text.indexOf('Cashier')).toBeLessThan(text.indexOf('Salesperson'));
  });

  it('falls back to the invoice\'s persisted name', () => {
    const text = buildThermalReceiptText('80mm', invoice({ salespersonName: 'Manager One' }), opts());
    expect(text).toContain('Salesperson');
    expect(text).toContain('Manager One');
  });
});

describe('the other renderers carry it too', () => {
  it('ESC/POS (real thermal print) emits Salesperson under Cashier', () => {
    const src = read('../../../utils/escPosReceipt.js');
    expect(src).toContain("buildFixedWidthLine('Salesperson:', salespersonLine, width)");
    expect(src.indexOf("'Cashier:'")).toBeLessThan(src.indexOf("'Salesperson:'"));
    expect(src).toContain("salespersonName || invoice.salespersonName");
  });

  it('bilingual canvas raster emits Salesperson under Cashier', () => {
    const src = read('../../../utils/bilingualReceiptCanvas.js');
    expect(src).toContain('kv2(L.SALESPERSON, salespersonLine)');
    expect(src.indexOf('L.CASHIER')).toBeLessThan(src.indexOf('L.SALESPERSON'));
  });

  it('the bilingual label exists in both languages', () => {
    const src = read('../../../utils/receiptLabels.js');
    expect(src).toContain('SALESPERSON:');
    expect(src).toMatch(/SALESPERSON:\s*\{\s*en:\s*'Salesperson'/);
  });

  it('the React receipt template renders Salesperson under Cashier', () => {
    const src = read('../POS/receiptTemplates/BillBullTaxInvoiceReceipt.jsx');
    expect(src).toContain('meta.salespersonName');
    expect(src.indexOf('meta.cashierName')).toBeLessThan(src.indexOf('meta.salespersonName'));
  });

  it('the Template-2 data mapper carries it, with the reprint fallback', () => {
    const src = read('../POS/receiptTemplates/billBullTaxInvoiceData.js');
    expect(src).toContain('salespersonName: opts.salespersonName || invoice.salespersonName');
  });

  it('the shared artifacts builder feeds every silent-print path from the invoice', () => {
    // Both the ESC/POS bag and the text fallback bag — one without it would make the real print
    // and its compatibility fallback disagree.
    const src = read('../POS/device/printing/buildThermalReceiptArtifacts.js');
    expect(src.match(/salespersonName: full\.salespersonName \|\| ''/g) || []).toHaveLength(2);
  });
});

describe('the A4 document path', () => {
  it('maps salesPerson to the salesperson, not to the POS counter', () => {
    const src = read('../POS/posPrintUtils.js');
    expect(src).toContain('salesPerson: full.salespersonName');
    // The pre-existing mis-map is gone: a counter is a till, not a person.
    expect(src).not.toContain('salesPerson: full.posCounterName');
  });
});

describe('the checkout preview shows what will be printed', () => {
  it('stamps the effective salesperson onto the preview invoice', () => {
    const src = read('../POSSales.jsx');
    expect(src).toContain("salespersonName: effectiveSalesperson?.name || ''");
  });
});
