import { describe, expect, it } from 'vitest';

import {
  applyTaxAwareDisplayOptions,
  buildDraftPrintDataFromCart,
  buildLayawayReceiptText,
  buildPosA4Template,
  buildPosPrintData,
  buildReceiptVoucherThermalText,
  buildStatementThermalText,
  buildThermalPrintHtml,
  buildThermalReceiptText,
  buildThermalTestReceiptText,
  buildZatcaTlvBase64,
  resolveInvoiceGrossTotals,
  stripForPreview,
} from '../POS/posPrintUtils';
import { escPosUsableCols } from '../../../utils/escPosReceipt';
import {
  CART_DRAFT,
  CUSTOMERS_LIST,
  INVOICE_DATED,
  INVOICE_EXPLICIT_DISCOUNT_EXCLUSIVE,
  INVOICE_EXPLICIT_DISCOUNT_INCLUSIVE,
  INVOICE_LONG_TEXT,
  INVOICE_MINIMAL,
  INVOICE_PERSISTED_EXCLUSIVE,
  INVOICE_PERSISTED_INCLUSIVE,
  INVOICE_PERSISTED_WITH_VOID,
  INVOICE_ZERO_TAX,
  LAYAWAY,
  LAYAWAY_LONG_ITEM,
  PAYMENT_VOUCHER,
  PAYMENT_VOUCHER_APPLIED,
  PAYMENT_VOUCHER_SETTLED,
  STATEMENT,
  STATEMENT_EMPTY,
  STORE,
  STORE_LONG,
  VOUCHER_STORE,
} from './fixtures/posPrintFixtures';

/**
 * CHARACTERIZATION SUITE — posPrintUtils.js (1,851 lines).
 *
 * Locks down the plain-text receipt builders, the ZATCA QR payload, the totals
 * reconstruction and the print-data/template shaping that every POS print surface
 * depends on, BEFORE extraction touches printing.
 *
 * WHAT IS ASSERTED EXACTLY
 *   The full line array of each text receipt — content, ordering, column placement and
 *   width. These are the bodies handed to the local print agent (via buildEscPosDocument
 *   / buildEscPosFromPlainText), so a single shifted column is a visibly broken receipt.
 *
 * WHAT IS NORMALISED (and only this)
 *   Rendered dates. The builders call toLocaleDateString/toLocaleString('en-GB'), which
 *   resolve against the host timezone and ICU version, and several fall back to
 *   `new Date()` when the record carries no date. The date VALUE is replaced with
 *   <DATE>; its row position, label and column alignment are still asserted.
 *
 * WHAT IS NOT COVERED HERE
 *   The HTML builders that delegate to documentTemplateRenderer (buildThermalReceiptHtml,
 *   buildSalesReturnThermalHtml, buildDocumentPreviewHtml, buildThermalSampleHtml,
 *   buildServiceJobA4Html, buildThermalJobCardHtml, buildLayawayReceiptHtml,
 *   buildReceiptVoucherThermalHtml, buildStatementThermalHtml). Those emit multi-kilobyte
 *   styled markup whose meaningful behaviour is the renderer's, not this module's; the
 *   data they render is characterized here through buildPosPrintData instead.
 *   No hardware, no print agent, no network is touched by any test in this file.
 */

/** Splits a receipt into lines. */
const linesOf = (text) => text.split('\n');

/** Replaces the value half of a rendered date row, keeping label and width intact. */
const normaliseDateRow = (line, label) => {
  if (!line.startsWith(label)) return line;
  return `${label}<DATE>`;
};

/**
 * Blanks any line whose entire content is a rendered date. Covers both formats in use:
 * toLocaleDateString('en-GB', {day,month,year}) -> "09 Sept 2026" (layaway) and
 * toLocaleString('en-GB')                       -> "09/09/2026, 09:43:39" (printer test).
 */
const normaliseBareDate = (line) => {
  const t = line.trim();
  if (/^\d{2} [A-Za-z]{3,4} \d{4}$/.test(t)) return '<DATE>';
  if (/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}$/.test(t)) return '<DATE>';
  return line;
};

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · resolveInvoiceGrossTotals — the money reconstruction every surface shares
 * ══════════════════════════════════════════════════════════════════════════ */

describe('resolveInvoiceGrossTotals — shape 1: caller supplied an explicit discountTotal', () => {
  it('treats subTotal as the gross pre-discount amount (exclusive VAT)', () => {
    const t = resolveInvoiceGrossTotals(INVOICE_EXPLICIT_DISCOUNT_EXCLUSIVE);

    expect(t.subTotal).toBe(450);
    expect(t.discountTotal).toBe(90);
    expect(t.lineDiscountTotal).toBe(80);      // discountTotal - billDiscountTotal
    expect(t.billDiscountTotal).toBe(10);
    expect(t.taxableAmount).toBe(360);         // flat subtraction; no VAT embedded
  });

  it('extracts VAT out of the discounted net under inclusive pricing', () => {
    // netAfterDiscount is VAT-laden in inclusive mode, so the already-computed taxTotal
    // is subtracted rather than re-deriving from any single line's rate. That keeps it
    // exact across a mixed-rate cart.
    const t = resolveInvoiceGrossTotals(INVOICE_EXPLICIT_DISCOUNT_INCLUSIVE);

    expect(t.subTotal).toBe(472.5);
    expect(t.discountTotal).toBe(94.5);
    expect(t.taxableAmount).toBe(360);         // 378 net - 18 tax
  });

  it('clamps the taxable amount at zero rather than going negative', () => {
    const t = resolveInvoiceGrossTotals({
      subTotal: 100, discountTotal: 100, taxTotal: 50, taxInclusive: true,
    });
    expect(t.taxableAmount).toBe(0);
  });

  it('never reports a negative line discount when the bill discount exceeds the total', () => {
    const t = resolveInvoiceGrossTotals({
      subTotal: 100, discountTotal: 10, billDiscountAmount: 40, taxTotal: 0,
    });
    expect(t.lineDiscountTotal).toBe(0);
    expect(t.billDiscountTotal).toBe(40);
    // CHARACTERIZED QUIRK: discountTotal is returned as the caller supplied it (10),
    // so discountTotal < billDiscountTotal is representable and the two disagree.
    expect(t.discountTotal).toBe(10);
  });

  it('takes the branch on the presence of the key, not on its value', () => {
    // discountTotal: 0 is still "explicit" — a null/undefined is what routes to shape 2.
    const explicitZero = resolveInvoiceGrossTotals({ subTotal: 450, discountTotal: 0, taxTotal: 18, items: [{ quantity: 2, unitPrice: 200, grossAmount: 400 }] });
    expect(explicitZero.subTotal).toBe(450);
    expect(explicitZero.taxableAmount).toBe(450);   // flat, items ignored

    const absent = resolveInvoiceGrossTotals({ subTotal: 450, taxTotal: 18, items: [{ quantity: 2, unitPrice: 200, grossAmount: 400 }] });
    expect(absent.subTotal).toBe(400);              // rebuilt from the line
    expect(absent.taxableAmount).toBe(450);
  });
});

describe('resolveInvoiceGrossTotals — shape 2: persisted invoice, no discount aggregate', () => {
  it('rebuilds the gross subtotal from each line and derives the discount', () => {
    const t = resolveInvoiceGrossTotals(INVOICE_PERSISTED_EXCLUSIVE);

    expect(t.subTotal).toBe(450);              // 400 + 50 gross, rebuilt from lines
    expect(t.taxableAmount).toBe(360);         // invoice.subTotal IS the taxable base
    expect(t.lineDiscountTotal).toBe(80);      // 450 - 360 - 10 bill
    expect(t.billDiscountTotal).toBe(10);
    expect(t.discountTotal).toBe(90);
  });

  it('compares against the VAT-laden net under inclusive pricing', () => {
    const t = resolveInvoiceGrossTotals(INVOICE_PERSISTED_INCLUSIVE);

    expect(t.subTotal).toBe(472.5);
    expect(t.taxableAmount).toBe(360);
    // 472.5 gross - (360 taxable + 18 tax) = 94.5 — a "20% off" line reads as the full
    // 94.5, not the 90 a taxable-basis comparison would give.
    expect(t.lineDiscountTotal).toBe(94.5);
  });

  it('excludes voided lines from the rebuilt gross subtotal', () => {
    const clean = resolveInvoiceGrossTotals(INVOICE_PERSISTED_EXCLUSIVE);
    const withVoid = resolveInvoiceGrossTotals(INVOICE_PERSISTED_WITH_VOID);

    expect(withVoid.subTotal).toBe(clean.subTotal);      // the 99 voided line is ignored
    expect(withVoid.discountTotal).toBe(clean.discountTotal);
  });

  it('honours both voided flag spellings', () => {
    const base = { subTotal: 100, taxTotal: 0, items: [{ quantity: 1, unitPrice: 50, grossAmount: 50 }] };
    const viaVoided = resolveInvoiceGrossTotals({ ...base, items: [...base.items, { quantity: 1, unitPrice: 99, grossAmount: 99, voided: true }] });
    const viaIsVoided = resolveInvoiceGrossTotals({ ...base, items: [...base.items, { quantity: 1, unitPrice: 99, grossAmount: 99, isVoided: true }] });

    expect(viaVoided.subTotal).toBe(50);
    expect(viaIsVoided.subTotal).toBe(50);
  });

  it('derives a line gross from qty x unitPrice when grossAmount is absent', () => {
    const t = resolveInvoiceGrossTotals({
      subTotal: 90, taxTotal: 0,
      items: [{ quantity: 3, unitPrice: 40 }],       // no grossAmount
    });
    expect(t.subTotal).toBe(120);
    expect(t.lineDiscountTotal).toBe(30);
  });

  it('accepts price as an alias for unitPrice', () => {
    const t = resolveInvoiceGrossTotals({
      subTotal: 0, taxTotal: 0, items: [{ quantity: 2, price: 25 }],
    });
    expect(t.subTotal).toBe(50);
  });

  it('falls back to the taxable amount when there are no lines to rebuild from', () => {
    const t = resolveInvoiceGrossTotals({ subTotal: 250, taxTotal: 0, items: [] });
    expect(t.subTotal).toBe(250);
    expect(t.discountTotal).toBe(0);
  });

  it('returns zeroes for an empty invoice', () => {
    const t = resolveInvoiceGrossTotals();
    expect(t).toEqual({
      subTotal: 0, discountTotal: 0, lineDiscountTotal: 0, billDiscountTotal: 0, taxableAmount: 0,
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · buildZatcaTlvBase64 — the ZATCA Phase-1 QR payload
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildZatcaTlvBase64 — UAE FTA / ZATCA QR TLV', () => {
  const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  /** Walks the TLV stream into { tag: value } using a UTF-8 decoder. */
  const parseTlv = (bytes) => {
    const out = {};
    const dec = new TextDecoder();
    let i = 0;
    while (i < bytes.length) {
      const tag = bytes[i];
      const len = bytes[i + 1];
      out[tag] = dec.decode(bytes.slice(i + 2, i + 2 + len));
      i += 2 + len;
    }
    return out;
  };

  it('emits the five mandatory tags in order with correct lengths', () => {
    const b64 = buildZatcaTlvBase64('BillBull Retail', '100123456700003', '2026-09-07T10:30:00Z', 1496.25, 71.25);
    const bytes = decode(b64);

    expect(bytes[0]).toBe(0x01);
    expect(bytes[1]).toBe('BillBull Retail'.length);

    expect(parseTlv(bytes)).toEqual({
      1: 'BillBull Retail',
      2: '100123456700003',
      3: '2026-09-07T10:30:00Z',
      4: '1496.25',
      5: '71.25',
    });
  });

  it('is byte-stable for a fixed input', () => {
    expect(buildZatcaTlvBase64('BillBull Retail', '100123456700003', '2026-09-07T10:30:00Z', 1496.25, 71.25))
      .toBe('AQ9CaWxsQnVsbCBSZXRhaWwCDzEwMDEyMzQ1NjcwMDAwMwMUMjAyNi0wOS0wN1QxMDozMDowMFoEBzE0OTYuMjUFBTcxLjI1');
  });

  it('substitutes N/A for a missing or whitespace-only TRN', () => {
    const parsed = (trn) => parseTlv(decode(buildZatcaTlvBase64('S', trn, '2026-01-01T00:00:00Z', 1, 0)));
    expect(parsed('')[2]).toBe('N/A');
    expect(parsed('   ')[2]).toBe('N/A');
    expect(parsed(null)[2]).toBe('N/A');
    expect(parsed('  100123456700003  ')[2]).toBe('100123456700003'); // trimmed
  });

  it('always formats the money tags to exactly 2 decimals', () => {
    const parsed = parseTlv(decode(buildZatcaTlvBase64('S', 'T', '2026-01-01T00:00:00Z', 1496.5, 0)));
    expect(parsed[4]).toBe('1496.50');
    expect(parsed[5]).toBe('0.00');

    const strings = parseTlv(decode(buildZatcaTlvBase64('S', 'T', '2026-01-01T00:00:00Z', '99.999', '0.005')));
    expect(strings[4]).toBe('100.00');
    expect(strings[5]).toBe('0.01');
  });

  it('CHARACTERIZED QUIRK: the TLV length byte counts UTF-8 bytes, but btoa reads code units', () => {
    // tlvField measures the TextEncoder byte length (correct), yet the final encoding is
    // btoa(String.fromCharCode(...bytes)) over a Uint8Array — each element is already a
    // byte, so this round-trips correctly. A multi-byte seller name therefore declares a
    // byte length longer than its character count, which is the ZATCA-correct behaviour.
    const bytes = decode(buildZatcaTlvBase64('Café', 'T', '2026-01-01T00:00:00Z', 1, 0));
    expect(bytes[1]).toBe(5);                    // 'Café' is 5 UTF-8 bytes, 4 characters
    expect(parseTlv(bytes)[1]).toBe('Café');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · Paper width — the single most extraction-sensitive constant
 * ══════════════════════════════════════════════════════════════════════════ */

describe('paper width resolution', () => {
  const widthOf = (text) => Math.max(...linesOf(text).map((l) => l.length));

  it('builds the sales receipt to 42 columns on 80mm and 32 on 58mm', () => {
    expect(widthOf(buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, STORE))).toBe(42);
    expect(widthOf(buildThermalReceiptText('58mm', INVOICE_PERSISTED_EXCLUSIVE, STORE))).toBe(32);
  });

  it('builds the layaway / voucher / statement receipts to 46 columns on 80mm and 30 on 58mm', () => {
    expect(widthOf(buildLayawayReceiptText('80mm', LAYAWAY, { ...STORE, omitHeader: true }))).toBe(46);
    expect(widthOf(buildLayawayReceiptText('58mm', LAYAWAY, { ...STORE, omitHeader: true }))).toBe(30);
    expect(widthOf(buildReceiptVoucherThermalText('80mm', PAYMENT_VOUCHER, { ...VOUCHER_STORE, omitHeader: true }))).toBe(46);
    expect(widthOf(buildStatementThermalText('80mm', STATEMENT, { ...VOUCHER_STORE, omitHeader: true }))).toBe(46);
  });

  it('CHARACTERIZED DIVERGENCE: three different width conventions coexist', () => {
    // escPosReceipt's own geometry (PAPER_COLS minus a symmetric 1-col gutter) is 46/30.
    // The layaway/voucher/statement builders match it — their comments say so explicitly.
    // buildThermalReceiptText and buildThermalTestReceiptText use 42/32 instead, so the
    // main sales receipt prints 4 columns narrower than every other document on the same
    // 80mm paper, and 2 columns WIDER than them on 58mm. Not reconciled here.
    expect(escPosUsableCols('80mm')).toBe(46);
    expect(escPosUsableCols('58mm')).toBe(30);

    const sales80 = widthOf(buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, STORE));
    const layaway80 = widthOf(buildLayawayReceiptText('80mm', LAYAWAY, { ...STORE, omitHeader: true }));
    expect(sales80).toBe(42);
    expect(layaway80).toBe(46);
    expect(sales80).not.toBe(layaway80);

    const sales58 = widthOf(buildThermalReceiptText('58mm', INVOICE_PERSISTED_EXCLUSIVE, STORE));
    const layaway58 = widthOf(buildLayawayReceiptText('58mm', LAYAWAY, { ...STORE, omitHeader: true }));
    expect(sales58).toBe(32);
    expect(layaway58).toBe(30);
  });

  it('CHARACTERIZED QUIRK: paper size is matched with String.includes("58")', () => {
    // Same defect the escPos suite recorded for escPosPaperWidthDots, present again in
    // every builder here. '57.5mm' — a real way to label narrow paper — silently prints
    // at the 80mm width and overruns the roll.
    expect(widthOf(buildThermalReceiptText('57.5mm', INVOICE_PERSISTED_EXCLUSIVE, STORE))).toBe(42);
    expect(widthOf(buildLayawayReceiptText('57.5mm', LAYAWAY, { ...STORE, omitHeader: true }))).toBe(46);

    // Conversely, ANY string containing "58" is treated as narrow paper.
    expect(widthOf(buildThermalReceiptText('580mm', INVOICE_PERSISTED_EXCLUSIVE, STORE))).toBe(32);
    expect(widthOf(buildThermalReceiptText('Epson TM-T58 III', INVOICE_PERSISTED_EXCLUSIVE, STORE))).toBe(32);

    // An absent paper size falls through to 80mm.
    expect(widthOf(buildThermalReceiptText(undefined, INVOICE_PERSISTED_EXCLUSIVE, STORE))).toBe(42);
    expect(widthOf(buildThermalReceiptText(null, INVOICE_PERSISTED_EXCLUSIVE, STORE))).toBe(42);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · buildThermalReceiptText — the sales receipt, asserted line by line
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildThermalReceiptText — standard 80mm sale with discount, cash and change', () => {
  const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
    ...STORE,
    cashierName: 'Aisha K.',
    terminalId: 'TERM-01',
    counterName: 'Counter 1',
    cashGiven: 400,
    changeAmount: 32,
  });

  it('renders the complete receipt exactly', () => {
    expect(linesOf(text)).toEqual([
      '             BillBull Retail',
      '           TRN: 100123456700003',
      '           Main Branch — Dubai',
      '------------------------------------------',
      '               TAX INVOICE',
      'Invoice                      SI-POS-000124',
      'Cashier                           Aisha K.',
      'Terminal                           TERM-01',
      'Counter                          Counter 1',
      '------------------------------------------',
      'Customer: Fatima Hassan',
      'Customer Code: CUST-001',
      '------------------------------------------',
      '2x Discounted Widget',
      'Price @ AED 200.00              AED 400.00',
      'Discount (20.00%)              - AED 80.00',
      'Net @ AED 160.00                AED 320.00',
      'SKU: SKU-400',
      '1x Plain Widget',
      '@ AED 50.00                      AED 50.00',
      'SKU: SKU-401',
      '------------------------------------------',
      'Subtotal                        AED 450.00',
      'Discount                         AED 90.00',
      'Taxable Amount                  AED 360.00',
      'VAT                              AED 18.00',
      '------------------------------------------',
      'TOTAL                           AED 368.00',
      'Payment Mode                          Cash',
      'Cash Received                   AED 400.00',
      'Change Returned                  AED 32.00',
      '------------------------------------------',
      '      Thank you for shopping with us',
      '',
      '',
    ]);
  });

  it('expands a discounted line into three rows and a plain line into one', () => {
    const l = linesOf(text);
    expect(l.slice(13, 18)).toEqual([
      '2x Discounted Widget',
      'Price @ AED 200.00              AED 400.00',
      'Discount (20.00%)              - AED 80.00',
      'Net @ AED 160.00                AED 320.00',
      'SKU: SKU-400',
    ]);
    // Undiscounted lines collapse to a single "@ unit price ... line total" row.
    expect(l.slice(18, 21)).toEqual([
      '1x Plain Widget',
      '@ AED 50.00                      AED 50.00',
      'SKU: SKU-401',
    ]);
  });

  it('shows the net unit price alongside the gross unit price on a discounted line', () => {
    // 320 / 2 = 160 — the price the customer actually paid per unit.
    expect(text).toContain('Net @ AED 160.00');
    expect(text).toContain('Price @ AED 200.00');
  });

  it('ends with two blank lines as paper feed', () => {
    const l = linesOf(text);
    expect(l.slice(-2)).toEqual(['', '']);
  });

  it('pads every rule to the full paper width', () => {
    linesOf(text).filter((l) => l.startsWith('---')).forEach((rule) => {
      expect(rule).toBe('-'.repeat(42));
    });
  });
});

describe('buildThermalReceiptText — configuration branches', () => {
  it('narrows every row to 32 columns on 58mm without dropping content', () => {
    const l = linesOf(buildThermalReceiptText('58mm', INVOICE_PERSISTED_EXCLUSIVE, STORE));

    expect(l).toEqual([
      '        BillBull Retail',
      '      TRN: 100123456700003',
      '      Main Branch — Dubai',
      '--------------------------------',
      '          TAX INVOICE',
      'Invoice            SI-POS-000124',
      '--------------------------------',
      'Customer: Fatima Hassan',
      'Customer Code: CUST-001',
      '--------------------------------',
      '2x Discounted Widget',
      'Price @ AED 200.00    AED 400.00',
      'Discount (20.00%)    - AED 80.00',
      'Net @ AED 160.00      AED 320.00',
      'SKU: SKU-400',
      '1x Plain Widget',
      '@ AED 50.00            AED 50.00',
      'SKU: SKU-401',
      '--------------------------------',
      'Subtotal              AED 450.00',
      'Discount               AED 90.00',
      'Taxable Amount        AED 360.00',
      'VAT                    AED 18.00',
      '--------------------------------',
      'TOTAL                 AED 368.00',
      'Payment Mode                Cash',
      '--------------------------------',
      ' Thank you for shopping with us',
      '',
      '',
    ]);
  });

  it('omits the TRN row when showTrn is false', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_ZERO_TAX, { ...STORE, showTrn: false });
    expect(text).not.toContain('TRN: 100123456700003');
    expect(text).toContain('BillBull Retail');
  });

  it('suppresses the VAT and Taxable Amount rows when hasTax is false', () => {
    const taxed = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, { ...STORE, hasTax: true });
    const untaxed = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, { ...STORE, hasTax: false });

    expect(taxed).toContain('Taxable Amount');
    expect(taxed).toMatch(/^VAT /m);
    expect(untaxed).not.toContain('Taxable Amount');
    expect(untaxed).not.toMatch(/^VAT /m);
    // Subtotal and Discount survive — only the tax-invoice-specific rows go.
    expect(untaxed).toContain('Subtotal');
    expect(untaxed).toContain('Discount');
  });

  it('CHARACTERIZED QUIRK: hasTax=false still prints the heading "TAX INVOICE"', () => {
    // documentTitle defaults to 'TAX INVOICE' independently of hasTax, so a no-tax sale
    // prints a document headed TAX INVOICE with no VAT content anywhere. Callers must
    // pass documentTitle explicitly to get the right heading; the default does not
    // follow the tax flag.
    const untaxed = buildThermalReceiptText('80mm', INVOICE_ZERO_TAX, { ...STORE, hasTax: false });
    expect(untaxed).toContain('TAX INVOICE');
    expect(untaxed).not.toMatch(/^VAT /m);

    const titled = buildThermalReceiptText('80mm', INVOICE_ZERO_TAX, {
      ...STORE, hasTax: false, documentTitle: 'SALES INVOICE',
    });
    expect(titled).toContain('SALES INVOICE');
    expect(titled).not.toContain('TAX INVOICE');
  });

  it('labels VAT as inclusive when the invoice is tax-inclusive', () => {
    expect(buildThermalReceiptText('80mm', INVOICE_PERSISTED_INCLUSIVE, STORE)).toContain('VAT (incl.)');
    expect(buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, STORE)).toMatch(/^VAT {2}/m);
  });

  it('omits the Taxable Amount row when there is no discount, even on a taxed sale', () => {
    // Taxable Amount is nested inside the discount branch, so a full-price tax invoice
    // shows Subtotal then VAT with no taxable base disclosed.
    const text = buildThermalReceiptText('80mm', {
      ...INVOICE_ZERO_TAX, taxTotal: 5, subTotal: 100, invoiceTotal: 105,
    }, STORE);
    expect(text).not.toContain('Taxable Amount');
    expect(text).toMatch(/^VAT /m);
  });

  it('hides the entire customer block when showCustomerDetails is false', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE, showCustomerDetails: false,
    });
    expect(text).not.toContain('Customer:');
    expect(text).not.toContain('Customer Code:');
  });

  it('renders the optional customer contact rows when supplied', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE,
      customerPhone: '+971 50 123 4567',
      customerEmail: 'fatima@example.ae',
      customerTrn: '100999888700003',
    });
    expect(text).toContain('Mobile: +971 50 123 4567');
    expect(text).toContain('Email: fatima@example.ae');
    expect(text).toContain('TRN: 100999888700003');
  });

  it('suppresses the customer code for a walk-in sale', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_ZERO_TAX, STORE);
    expect(text).toContain('Customer: Walk-in Customer');
    expect(text).not.toContain('Customer Code:');
  });

  it('renders deposit and balance rows for a layaway conversion', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE, depositApplied: 100, balanceDue: 268,
    });
    expect(text).toContain('Deposit Paid                  - AED 100.00');
    expect(text).toContain('Balance Due                     AED 268.00');
  });

  it('derives the balance from the invoice total when balanceDue is not supplied', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE, depositApplied: 100,
    });
    expect(text).toContain('Balance Due                     AED 268.00'); // 368 - 100
  });

  it('clamps a negative balance to zero', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, {
      ...STORE, depositApplied: 500,
    });
    expect(text).toContain('Balance Due                       AED 0.00');
  });

  it('renders delivery and shipping charges as separate rows', () => {
    const text = buildThermalReceiptText('80mm', {
      ...INVOICE_ZERO_TAX, deliveryCharge: 25,
    }, { ...STORE, shippingCharge: 15 });
    expect(text).toContain('Delivery Charge                  AED 25.00');
    expect(text).toContain('Shipping                         AED 15.00');
  });

  it('omits zero and null money rows entirely', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_ZERO_TAX, {
      ...STORE, cashGiven: 0, changeAmount: null, depositApplied: 0, shippingCharge: 0,
    });
    expect(text).not.toContain('Cash Received');
    expect(text).not.toContain('Change Returned');
    expect(text).not.toContain('Deposit Paid');
    expect(text).not.toContain('Shipping');
  });

  it('honours a non-AED currency label throughout', () => {
    const text = buildThermalReceiptText('80mm', INVOICE_ZERO_TAX, { ...STORE, currency: 'SAR' });
    expect(text).toContain('SAR 100.00');
    expect(text).not.toContain('AED');
  });

  it('prints the batch number only when no serial number is present', () => {
    const withBoth = buildThermalReceiptText('80mm', {
      ...INVOICE_ZERO_TAX,
      items: [{ ...INVOICE_ZERO_TAX.items[0], serialNumber: 'SN-1', batchNumber: 'B-1' }],
    }, STORE);
    expect(withBoth).toContain('S/N: SN-1');
    expect(withBoth).not.toContain('Batch: B-1');

    const batchOnly = buildThermalReceiptText('80mm', {
      ...INVOICE_ZERO_TAX,
      items: [{ ...INVOICE_ZERO_TAX.items[0], batchNumber: 'B-1' }],
    }, STORE);
    expect(batchOnly).toContain('Batch: B-1');
  });
});

describe('buildThermalReceiptText — voided lines', () => {
  const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_WITH_VOID, STORE);

  it('keeps the voided line on the receipt, tagged and negated', () => {
    expect(text).toContain('1x Voided Widget [VOID]');
    expect(text).toContain('@ AED 99.00                    - AED 99.00');
  });

  it('discloses the voided tally in its own row', () => {
    expect(text).toContain('Voided Items (1)               - AED 99.00');
  });

  it('excludes the voided line from Subtotal, Discount and TOTAL', () => {
    const clean = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, STORE);
    expect(text).toContain('Subtotal                        AED 450.00');
    expect(clean).toContain('Subtotal                        AED 450.00');
    expect(text).toContain('TOTAL                           AED 368.00');
  });

  it('CHARACTERIZED DIVERGENCE: the receipt prints a voided batch, the payload strips it', () => {
    // buildThermalReceiptText applies no void check when emitting SKU / batch / serial,
    // so a voided line keeps all three on the printed receipt. posUtils.buildPosCheckoutItems
    // does the opposite — it nulls batchNumber and serialNumber for voided lines before
    // posting. The paper and the posted record therefore disagree about the same line.
    expect(text).toContain('SKU: SKU-403');
    expect(text).toContain('Batch: BATCH-B');
  });
});

describe('buildThermalReceiptText — degenerate and long input', () => {
  it('renders a minimal invoice without throwing', () => {
    expect(linesOf(buildThermalReceiptText('80mm', INVOICE_MINIMAL, {}))).toEqual([
      '                 BillBull',
      '------------------------------------------',
      '               TAX INVOICE',
      'Invoice',
      '------------------------------------------',
      'Customer: Walk-in Customer',
      '------------------------------------------',
      '------------------------------------------',
      'Subtotal                          AED 0.00',
      'VAT                               AED 0.00',
      '------------------------------------------',
      'TOTAL                            AED 10.00',
      '------------------------------------------',
      '',
      '',
    ]);
  });

  it('CHARACTERIZED QUIRK: an item-less invoice prints Subtotal 0.00 against a non-zero TOTAL', () => {
    // With no lines there is nothing to rebuild the gross subtotal from, so it falls back
    // to invoice.subTotal (absent here = 0) while invoiceTotal still prints. The receipt
    // does not internally tie out.
    const text = buildThermalReceiptText('80mm', INVOICE_MINIMAL, {});
    expect(text).toContain('Subtotal                          AED 0.00');
    expect(text).toContain('TOTAL                            AED 10.00');
  });

  it('CHARACTERIZED QUIRK: an empty invoice number still prints the Invoice label row', () => {
    expect(linesOf(buildThermalReceiptText('80mm', INVOICE_MINIMAL, {}))).toContain('Invoice');
  });

  it('emits two consecutive rules when the item list is empty', () => {
    const l = linesOf(buildThermalReceiptText('80mm', INVOICE_MINIMAL, {}));
    expect(l[6]).toBe('-'.repeat(42));
    expect(l[7]).toBe('-'.repeat(42));
  });

  it('truncates a long product name to the paper width rather than wrapping it', () => {
    // The sales receipt truncates item names with slice(0, width) — unlike the layaway
    // receipt, which word-wraps them. Two different treatments of the same problem.
    const l = linesOf(buildThermalReceiptText('80mm', INVOICE_LONG_TEXT, STORE));
    const nameLine = l.find((x) => x.startsWith('1x Premium'));
    expect(nameLine).toHaveLength(42);
    expect(nameLine).toBe('1x Premium Organic Extra Virgin Cold Press');
    expect(l.some((x) => x.trim().startsWith('Bottle'))).toBe(false);
  });

  it('word-wraps a long customer address across as many rows as needed', () => {
    const l = linesOf(buildThermalReceiptText('80mm', INVOICE_LONG_TEXT, STORE));
    const start = l.findIndex((x) => x.startsWith('Address:'));

    expect(start).toBeGreaterThan(-1);
    // Newlines and commas are flattened to a single comma-separated string first.
    expect(l[start]).toContain('Office 1204');
    l.slice(start).filter((x) => x.startsWith('Address:') || x.startsWith('  '))
      .forEach((x) => expect(x.length).toBeLessThanOrEqual(42));
  });

  it('centres each line of a multi-line footer independently', () => {
    const l = linesOf(buildThermalReceiptText('80mm', INVOICE_ZERO_TAX, STORE_LONG));
    const a = l.find((x) => x.includes('Goods once sold'));
    const b = l.find((x) => x.includes('Please retain'));

    expect(a.startsWith(' ')).toBe(true);
    expect(b.startsWith(' ')).toBe(true);
    // Each is centred on its own length, not padded once for the whole block.
    expect(a.trimStart().length).not.toBe(b.trimStart().length);
    expect(Math.abs(a.length - a.trimStart().length - Math.floor((42 - a.trim().length) / 2))).toBe(0);
  });

  it('truncates an over-long centred header to the paper width', () => {
    const l = linesOf(buildThermalReceiptText('58mm', INVOICE_ZERO_TAX, STORE_LONG));
    l.forEach((line) => expect(line.length).toBeLessThanOrEqual(32));
  });

  it('renders a date row when createdAt is present, in the Date column', () => {
    const l = linesOf(buildThermalReceiptText('80mm', INVOICE_DATED, STORE))
      .map((x) => normaliseDateRow(x, 'Date'));
    expect(l).toContain('Date<DATE>');
  });

  it('omits the date row entirely when no date is stored', () => {
    expect(buildThermalReceiptText('80mm', INVOICE_MINIMAL, {})).not.toMatch(/^Date /m);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · buildThermalTestReceiptText — the printer self-test
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildThermalTestReceiptText', () => {
  it('renders the full self-test receipt', () => {
    const l = linesOf(buildThermalTestReceiptText({
      companyName: 'BillBull Retail',
      branchName: 'Main Branch',
      terminalId: 'TERM-01',
      counterName: 'Counter 1',
      printerName: 'EPSON TM-T88VI',
      paperSize: '80mm',
      currency: 'AED',
    })).map(normaliseBareDate);

    expect(l).toEqual([
      '             BillBull Retail',
      '             POS PRINTER TEST',
      '------------------------------------------',
      'Branch: Main Branch',
      'Terminal: TERM-01',
      'Counter: Counter 1',
      'Printer: EPSON TM-T88VI',
      'Paper: 80mm',
      'Currency: AED',
      '------------------------------------------',
      '<DATE>',
      '          If you can read this,',
      '    the configured printer is working.',
      '',
      '',
    ]);
  });

  it('drops every optional identity row when nothing is configured', () => {
    const l = linesOf(buildThermalTestReceiptText()).map(normaliseBareDate);

    expect(l).toEqual([
      '                 BillBull',
      '             POS PRINTER TEST',
      '------------------------------------------',
      'Paper: 80mm',
      'Currency: AED',
      '------------------------------------------',
      '<DATE>',
      '          If you can read this,',
      '    the configured printer is working.',
      '',
      '',
    ]);
  });

  it('echoes the configured paper size verbatim even when it is unrecognised', () => {
    // The label reports what was configured; the WIDTH silently falls back to 80mm.
    const text = buildThermalTestReceiptText({ paperSize: '57.5mm' });
    expect(text).toContain('Paper: 57.5mm');
    expect(Math.max(...linesOf(text).map((l) => l.length))).toBe(42);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6 · buildLayawayReceiptText
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildLayawayReceiptText', () => {
  const l = linesOf(buildLayawayReceiptText('80mm', LAYAWAY, { ...STORE, omitHeader: true }))
    .map(normaliseBareDate);

  it('renders the complete layaway receipt with the branded header omitted', () => {
    expect(l).toEqual([
      '              NOT A TAX INVOICE',
      '               LAYAWAY RECEIPT',
      '----------------------------------------------',
      'LAY: LAY-000042',
      '<DATE>',
      'Cust: Fatima Hassan',
      'Tel: +971 50 123 4567',
      '----------------------------------------------',
      'Samsung Galaxy A55 x1             AED 1,380.00',
      'Protective Case x2                  AED 120.00',
      '----------------------------------------------',
      'Sale Total                        AED 1,500.00',
      'Deposit (Cash)                      AED 500.00',
      'BALANCE DUE                       AED 1,000.00',
      'Note: Collect before Eid',
      '----------------------------------------------',
      '        Items reserved until due date.',
      '     Balance must be paid on collection.',
      '        Thank you for shopping with us',
      '',
      '',
    ]);
  });

  it('is explicitly marked NOT A TAX INVOICE', () => {
    // A layaway takes a deposit against an unfulfilled sale — it must not read as a
    // tax document.
    expect(l[0].trim()).toBe('NOT A TAX INVOICE');
  });

  it('prints the plain-text company header when omitHeader is false', () => {
    const withHeader = buildLayawayReceiptText('80mm', LAYAWAY, { ...STORE, omitHeader: false });
    expect(withHeader).toContain('BillBull Retail');
    expect(withHeader).toContain('TRN: 100123456700003');
    expect(withHeader).toContain('Main Branch');
  });

  it('word-wraps a long item name instead of truncating it', () => {
    // Unlike the sales receipt, which truncates. The amount lands on the last wrapped row.
    const wrapped = linesOf(buildLayawayReceiptText('80mm', LAYAWAY_LONG_ITEM, { ...STORE, omitHeader: true }));
    const amountRow = wrapped.find((x) => x.includes('AED 135.00'));

    expect(wrapped.some((x) => x.includes('Premium Organic'))).toBe(true);
    expect(wrapped.some((x) => x.trimStart().startsWith('Bottle') || x.includes('Bottle'))).toBe(true);
    expect(amountRow).toHaveLength(46);
    wrapped.forEach((x) => expect(x.length).toBeLessThanOrEqual(46));
  });

  it('omits the deposit row when no deposit was taken', () => {
    const text = buildLayawayReceiptText('80mm', { ...LAYAWAY, depositAmount: 0 }, { ...STORE, omitHeader: true });
    expect(text).not.toContain('Deposit');
    expect(text).toContain('BALANCE DUE');
  });

  it('adds a due-date block only when a due date exists', () => {
    const without = buildLayawayReceiptText('80mm', LAYAWAY, { ...STORE, omitHeader: true });
    expect(without).not.toContain('Due Date:');

    const withDue = buildLayawayReceiptText('80mm', { ...LAYAWAY, dueDate: '2026-12-01' }, { ...STORE, omitHeader: true });
    expect(withDue).toContain('Due Date:');
  });

  it('falls back to "Auto" when the layaway has no number yet', () => {
    const text = buildLayawayReceiptText('80mm', { ...LAYAWAY, layawayNumber: '' }, { ...STORE, omitHeader: true });
    expect(text).toContain('LAY: Auto');
  });

  it('formats amounts without a currency prefix on the value side', () => {
    // fmt() here returns a bare number; the "AED " prefix is concatenated at each call
    // site, so this builder ignores any currency option.
    expect(l).toContain('Sale Total                        AED 1,500.00');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7 · buildReceiptVoucherThermalText
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildReceiptVoucherThermalText', () => {
  const render = (payment) =>
    linesOf(buildReceiptVoucherThermalText('80mm', payment, { ...VOUCHER_STORE, omitHeader: true }))
      .map((x) => normaliseDateRow(x, 'Date:'));

  it('renders a payment settling several invoices', () => {
    expect(render(PAYMENT_VOUCHER_SETTLED)).toEqual([
      'Receipt No:                          RV-000077',
      'Date:<DATE>',
      'Customer:                     Acme Trading LLC',
      'Code:                                 CUST-002',
      '----------------------------------------------',
      'Payment Mode:                    Bank Transfer',
      'Bank Account:                     ADCB Current',
      'Reference:                           TRF-99871',
      '----------------------------------------------',
      '               INVOICES SETTLED',
      'SI-000101                         AED 1,500.00',
      'SI-000102                         AED 1,000.00',
      '----------------------------------------------',
      'AMOUNT RECEIVED                   AED 2,500.00',
      '----------------------------------------------',
      '            Received with thanks.',
      '          Computer generated receipt',
      '',
      '',
    ]);
  });

  it('falls back to a single applied-invoice row when there is no settlement list', () => {
    const l = render(PAYMENT_VOUCHER_APPLIED);
    expect(l).toContain('Applied to Invoice:                  SI-000103');
    expect(l).not.toContain('               INVOICES SETTLED');
  });

  it('shows neither when the payment is unallocated', () => {
    const l = render(PAYMENT_VOUCHER);
    expect(l.some((x) => x.includes('INVOICES SETTLED'))).toBe(false);
    expect(l.some((x) => x.includes('Applied to Invoice'))).toBe(false);
    expect(l).toContain('AMOUNT RECEIVED                   AED 2,500.00');
  });

  it('prefers paymentNumber, then receiptNumber, then id for the receipt number', () => {
    const text = (p) => buildReceiptVoucherThermalText('80mm', p, { ...VOUCHER_STORE, omitHeader: true });
    expect(text({ paymentNumber: 'A', receiptNumber: 'B', id: 'C' })).toContain('Receipt No:');
    expect(text({ paymentNumber: 'A', receiptNumber: 'B', id: 'C' })).toMatch(/Receipt No:\s+A$/m);
    expect(text({ receiptNumber: 'B', id: 'C' })).toMatch(/Receipt No:\s+B$/m);
    expect(text({ id: 'C' })).toMatch(/Receipt No:\s+C$/m);
  });

  it('defaults an unnamed payer to Walk-in Customer', () => {
    const text = buildReceiptVoucherThermalText('80mm', { amount: 10 }, { ...VOUCHER_STORE, omitHeader: true });
    expect(text).toMatch(/Customer:\s+Walk-in Customer$/m);
  });

  it('flattens a multi-line address into one comma-separated header row', () => {
    const l = linesOf(buildReceiptVoucherThermalText('80mm', PAYMENT_VOUCHER, { ...VOUCHER_STORE, omitHeader: false }));
    expect(l.some((x) => x.includes('Office 1204, Sheikh Zayed Road, Dubai'))).toBe(true);
  });

  it('prints the document title and company block only when omitHeader is false', () => {
    const withHeader = buildReceiptVoucherThermalText('80mm', PAYMENT_VOUCHER, { ...VOUCHER_STORE, omitHeader: false });
    expect(withHeader).toContain('PAYMENT RECEIPT');
    expect(withHeader).toContain('BillBull Retail');
    expect(withHeader).toContain('Tel: +971 4 123 4567');
    expect(withHeader).toContain('TRN: 100123456700003');

    const without = buildReceiptVoucherThermalText('80mm', PAYMENT_VOUCHER, { ...VOUCHER_STORE, omitHeader: true });
    expect(without).not.toContain('PAYMENT RECEIPT');
    expect(without).not.toContain('BillBull Retail');
  });

  it('honours a custom document title', () => {
    const text = buildReceiptVoucherThermalText('80mm', PAYMENT_VOUCHER, {
      ...VOUCHER_STORE, omitHeader: false, documentTitle: 'ADVANCE RECEIPT',
    });
    expect(text).toContain('ADVANCE RECEIPT');
    expect(text).not.toContain('PAYMENT RECEIPT');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8 · buildStatementThermalText
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildStatementThermalText', () => {
  const l = linesOf(buildStatementThermalText('80mm', STATEMENT, {
    ...VOUCHER_STORE, omitHeader: true, startDate: '2026-09-01', endDate: '2026-09-30',
  }));

  it('renders the complete statement', () => {
    expect(l).toEqual([
      'Customer:                     Acme Trading LLC',
      'Code:                                 CUST-002',
      'Period:               2026-09-01 to 2026-09-30',
      '----------------------------------------------',
      'Opening Balance                       1,000.00',
      '----------------------------------------------',
      '2026-09-02                       Sales Invoice',
      'Sale — SI-000101',
      'Dr 1,500.00                       Bal 2,500.00',
      '----------------------------------------------',
      '2026-09-05                     Receipt Voucher',
      'Payment received RV-000077',
      'Cr 750.00                         Bal 1,750.00',
      '----------------------------------------------',
      'CLOSING BAL.                      AED 1,750.00',
      '----------------------------------------------',
      'Total Invoiced                        2,500.00',
      'Total Paid                            1,750.00',
      '----------------------------------------------',
      '          Computer generated receipt',
      '',
      '',
    ]);
  });

  it('drops the OPENING_BALANCE entry, which has its own dedicated row', () => {
    // The fixture carries an OPENING_BALANCE entry; it must not also appear as a
    // transaction line.
    expect(l.filter((x) => x.includes('1,000.00'))).toHaveLength(1);
    expect(l).toContain('Opening Balance                       1,000.00');
  });

  it('title-cases the entry type from its SCREAMING_SNAKE enum', () => {
    expect(l).toContain('2026-09-02                       Sales Invoice');
    expect(l).toContain('2026-09-05                     Receipt Voucher');
  });

  it('appends the document number only when the description does not already contain it', () => {
    expect(l).toContain('Sale — SI-000101');              // appended
    expect(l).toContain('Payment received RV-000077');    // already present, not repeated
    expect(l).not.toContain('Payment received RV-000077 — RV-000077');
  });

  it('renders a debit as Dr and a credit as Cr, never both', () => {
    expect(l.some((x) => x.startsWith('Dr 1,500.00'))).toBe(true);
    expect(l.some((x) => x.startsWith('Cr 750.00'))).toBe(true);
    expect(l.some((x) => x.includes('Dr') && x.includes('Cr'))).toBe(false);
  });

  it('renders an em dash for an entry with neither debit nor credit', () => {
    const text = buildStatementThermalText('80mm', {
      ...STATEMENT_EMPTY,
      entries: [{ type: 'ADJUSTMENT', transactionDate: '2026-09-03', debit: 0, credit: 0, runningBalance: 0 }],
    }, { ...VOUCHER_STORE, omitHeader: true });
    expect(text).toMatch(/^—\s+Bal 0\.00$/m);
  });

  it('states plainly when there were no transactions in the period', () => {
    const text = buildStatementThermalText('80mm', STATEMENT_EMPTY, { ...VOUCHER_STORE, omitHeader: true });
    expect(text).toContain('No transactions in this period.');
  });

  it('omits the Period row when no date range is supplied', () => {
    const text = buildStatementThermalText('80mm', STATEMENT, { ...VOUCHER_STORE, omitHeader: true });
    expect(text).not.toContain('Period:');
  });

  it('CHARACTERIZED QUIRK: only CLOSING BAL. carries the currency code', () => {
    // Opening Balance, Total Invoiced and Total Paid print bare numbers; the closing
    // balance is the one row prefixed with the currency. Inconsistent within one document.
    expect(l).toContain('Opening Balance                       1,000.00');
    expect(l).toContain('CLOSING BAL.                      AED 1,750.00');
    expect(l).toContain('Total Invoiced                        2,500.00');
  });

  it('prefers the customer record over the statement account fields', () => {
    const text = buildStatementThermalText('80mm', STATEMENT, {
      ...VOUCHER_STORE, omitHeader: true,
      customer: { name: 'Override Name', code: 'OVR-1' },
    });
    expect(text).toMatch(/Customer:\s+Override Name$/m);
    expect(text).toMatch(/Code:\s+OVR-1$/m);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 9 · buildPosPrintData — the canonical A4 print-data shape
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildPosPrintData', () => {
  const data = buildPosPrintData(INVOICE_PERSISTED_EXCLUSIVE, 'Terms apply', CUSTOMERS_LIST);

  it('maps the totals block from resolveInvoiceGrossTotals', () => {
    expect(data.totals).toEqual({
      subTotal: 450,
      taxableAmount: 360,
      tax: 18,
      grandTotal: 368,
      discountAmount: 90,
      itemDiscountAmount: 80,
      footerDiscountAmount: 10,
      billDiscountAmount: 10,
      voidedCount: 0,
      voidedTotal: 0,
    });
  });

  it('titles the document from the invoice tax total', () => {
    expect(data.title).toBe('TAX INVOICE');
    expect(buildPosPrintData(INVOICE_ZERO_TAX).title).toBe('SALES INVOICE');
  });

  it('lets an explicit title override win', () => {
    expect(buildPosPrintData(INVOICE_PERSISTED_EXCLUSIVE, '', [], 'POS RECEIPT').title).toBe('POS RECEIPT');
    // Blank / whitespace overrides fall back to the tax-aware label.
    expect(buildPosPrintData(INVOICE_PERSISTED_EXCLUSIVE, '', [], '   ').title).toBe('TAX INVOICE');
  });

  it('backfills customer details from the customers list when the invoice lacks them', () => {
    expect(data.customer).toEqual({
      name: 'Fatima Hassan',
      code: 'CUST-001',
      address: '12 Jumeirah Beach Road, Dubai',
      phone: '+971 50 123 4567',
      email: 'fatima@example.ae',
      trn: '100999888700003',
    });
  });

  it('prefers the invoice values over the customer master', () => {
    const overridden = buildPosPrintData({
      ...INVOICE_PERSISTED_EXCLUSIVE,
      customerPhone: '+971 55 000 0000',
      customerTrn: '999888777600003',
    }, '', CUSTOMERS_LIST);
    expect(overridden.customer.phone).toBe('+971 55 000 0000');
    expect(overridden.customer.trn).toBe('999888777600003');
  });

  it('defaults to a walk-in customer with empty details', () => {
    const walkIn = buildPosPrintData({ items: [], invoiceTotal: 0 });
    expect(walkIn.customer).toEqual({ name: 'Walk-in Customer', code: '', address: '', phone: '', email: '', trn: '' });
  });

  it('maps each line onto the renderer column shape', () => {
    expect(data.items[0]).toEqual({
      code: 'SKU-400',
      name: 'Discounted Widget',
      desc: '',
      unit: '',
      qty: 2,
      price: 200,
      disc: 20,
      tax: 5,
      taxAmt: 16,
      total: 320,
      batchNumber: '',
      image: '',
      voided: false,
    });
  });

  it('CHARACTERIZED BEHAVIOUR: a voided line with zeroed amounts passes them as undefined', () => {
    // Older POS posts stored voided lines with taxAmount/netAmount zeroed. Passing 0
    // would print 0.00; passing undefined makes the renderer re-derive from qty x price.
    const withZeroedVoid = buildPosPrintData({
      ...INVOICE_ZERO_TAX,
      items: [{
        itemCode: 'V', itemName: 'Voided', quantity: 1, unitPrice: 99,
        taxAmount: 0, netAmount: 0, voided: true,
      }],
    });
    expect(withZeroedVoid.items[0].taxAmt).toBeUndefined();
    expect(withZeroedVoid.items[0].total).toBeUndefined();
    expect(withZeroedVoid.items[0].voided).toBe(true);

    // A non-voided line with a genuine zero keeps the zero.
    const zeroNonVoid = buildPosPrintData({
      ...INVOICE_ZERO_TAX,
      items: [{ itemCode: 'Z', itemName: 'Free', quantity: 1, unitPrice: 0, taxAmount: 0, netAmount: 0 }],
    });
    expect(zeroNonVoid.items[0].taxAmt).toBe(0);
    expect(zeroNonVoid.items[0].total).toBe(0);
  });

  it('counts and totals voided lines for the disclosure row', () => {
    const withVoid = buildPosPrintData(INVOICE_PERSISTED_WITH_VOID);
    expect(withVoid.totals.voidedCount).toBe(1);
    expect(withVoid.totals.voidedTotal).toBe(99);
  });

  it('reads the line discount rate from any of the three field spellings', () => {
    const shape = (item) => buildPosPrintData({ items: [item], invoiceTotal: 0 }).items[0].disc;
    expect(shape({ discountPercent: 15 })).toBe(15);
    expect(shape({ discount: 12 })).toBe(12);
    expect(shape({ disc: 8 })).toBe(8);
    expect(shape({})).toBe(0);
    // discountPercent wins over the others.
    expect(shape({ discountPercent: 15, discount: 12, disc: 8 })).toBe(15);
  });

  it('carries the meta block through unchanged', () => {
    expect(data.meta).toEqual({
      notes: 'Terms apply',
      paymentMode: 'Cash',
      location: '',
      salesPerson: '',
    });
  });
});

describe('buildDraftPrintDataFromCart', () => {
  const draft = buildDraftPrintDataFromCart(CART_DRAFT, 'Terms apply');

  it('routes the live cart through the gross-basis totals branch', () => {
    // The cart tracks an ex-VAT taxable base; the preview must present the SAME
    // gross-basis Subtotal/Discount the posted invoice and A4 will show.
    expect(draft.totals.subTotal).toBe(450);        // rebuilt from per-line grossAmount
    expect(draft.totals.taxableAmount).toBe(360);
    expect(draft.totals.itemDiscountAmount).toBe(90);
    expect(draft.totals.tax).toBe(18);
    expect(draft.totals.grandTotal).toBe(378);
  });

  it('derives a per-line grossAmount from price x quantity', () => {
    expect(draft.items[0].price).toBe(200);
    expect(draft.items[0].qty).toBe(2);
    expect(draft.items[0].disc).toBe(20);
  });

  it('maps cart field spellings onto the invoice shape', () => {
    expect(draft.items[0].code).toBe('SKU-400');
    expect(draft.items[0].name).toBe('Discounted Widget');
    expect(draft.items[0].tax).toBe(5);
    expect(draft.items[0].batchNumber).toBe('BATCH-A');
  });

  it('resolves the customer, suppressing the code for a walk-in', () => {
    expect(draft.customer.name).toBe('Fatima Hassan');
    expect(draft.customer.code).toBe('CUST-001');

    const walkIn = buildDraftPrintDataFromCart({
      ...CART_DRAFT, customer: { id: 'walk-in', name: 'Walk-in Customer' },
    });
    expect(walkIn.customer.code).toBe('');
  });

  it('produces the same canonical shape as the posted-invoice path', () => {
    expect(Object.keys(draft).sort()).toEqual(Object.keys(buildPosPrintData(INVOICE_PERSISTED_EXCLUSIVE)).sort());
  });

  it('survives an entirely empty cart', () => {
    const empty = buildDraftPrintDataFromCart();
    expect(empty.items).toEqual([]);
    expect(empty.totals.grandTotal).toBe(0);
    expect(empty.customer.name).toBe('Walk-in Customer');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 10 · Template shaping
 * ══════════════════════════════════════════════════════════════════════════ */

describe('applyTaxAwareDisplayOptions', () => {
  const template = {
    id: 7,
    category: 'Sales Invoice',
    displayOptions: JSON.stringify({
      showLogo: true,
      colVAT: true,
      showTRN: true,
      salesDesignerSettings: { showLogo: true, colVAT: true, showCustomerTRN: true },
    }),
  };

  it('returns the template untouched when the sale has tax', () => {
    expect(applyTaxAwareDisplayOptions(template, true)).toBe(template);
  });

  it('returns null/undefined templates unchanged', () => {
    expect(applyTaxAwareDisplayOptions(null, false)).toBe(null);
    expect(applyTaxAwareDisplayOptions(undefined, false)).toBe(undefined);
  });

  it('forces every tax element off for a no-tax sale', () => {
    const parsed = JSON.parse(applyTaxAwareDisplayOptions(template, false).displayOptions);

    [
      'colVAT', 'colVATAmount', 'showVATPercent', 'showVATAmount',
      'colTaxableAmount', 'showTaxableAmount',
      'showVATTotal', 'showTaxTotal', 'showTaxableTotal',
      'showTRN', 'showCompanyTaxId', 'showCustomerTRN', 'showVendorTRN',
    ].forEach((key) => expect(parsed[key]).toBe(false));
  });

  it('applies the same suppression inside salesDesignerSettings', () => {
    const parsed = JSON.parse(applyTaxAwareDisplayOptions(template, false).displayOptions);
    expect(parsed.salesDesignerSettings.colVAT).toBe(false);
    expect(parsed.salesDesignerSettings.showCustomerTRN).toBe(false);
  });

  it('preserves every non-tax setting', () => {
    const parsed = JSON.parse(applyTaxAwareDisplayOptions(template, false).displayOptions);
    expect(parsed.showLogo).toBe(true);
    expect(parsed.salesDesignerSettings.showLogo).toBe(true);
  });

  it('never mutates the original template', () => {
    const before = template.displayOptions;
    applyTaxAwareDisplayOptions(template, false);
    expect(template.displayOptions).toBe(before);
    expect(JSON.parse(template.displayOptions).colVAT).toBe(true);
  });

  it('returns a template with no displayOptions as an all-off options blob', () => {
    const bare = applyTaxAwareDisplayOptions({ id: 1 }, false);
    expect(JSON.parse(bare.displayOptions).colVAT).toBe(false);
  });

  it('CHARACTERIZED QUIRK: malformed displayOptions returns the template with tax still ON', () => {
    // The catch silently returns the original, so a template whose JSON fails to parse
    // keeps printing VAT columns on a no-tax sale rather than failing loudly.
    const broken = { id: 2, displayOptions: '{not json' };
    expect(applyTaxAwareDisplayOptions(broken, false)).toBe(broken);
  });
});

describe('buildPosA4Template', () => {
  it('defaults every optional element to visible and every extra to hidden', () => {
    const t = buildPosA4Template('Terms apply');
    const parsed = JSON.parse(t.displayOptions);
    const ds = parsed.salesDesignerSettings;

    expect(t.category).toBe('Sales Invoice');
    expect(t.paperSize).toBe('A4');
    expect(t.orientation).toBe('Portrait');
    expect(t.termsContent).toBe('Terms apply');

    // "!== false" defaults — on unless explicitly disabled.
    ['showLogo', 'showCompanyName', 'showTRN', 'showBillTo', 'showTerms', 'showNotes',
      'showGrandTotalBanner', 'colItemCode', 'colDiscount', 'colVAT', 'colVATAmount', 'colUOM',
    ].forEach((key) => expect(ds[key]).toBe(true));

    // "!!" defaults — off unless explicitly enabled.
    ['showBankDetails', 'showQRCode', 'showCompanyStamp', 'showSignatures',
      'colProductImage', 'colBarcode', 'colBatchNumber',
    ].forEach((key) => expect(ds[key]).toBe(false));
  });

  it('carries the brand accent through', () => {
    const parsed = JSON.parse(buildPosA4Template().displayOptions);
    expect(parsed.primaryColor).toBe('#F5C742');
    expect(parsed.accentColor).toBe('#F5C742');
    expect(parsed.salesDesignerSettings.primaryColor).toBe('#F5C742');
  });

  it('maps the console toggle names onto renderer setting names', () => {
    const parsed = JSON.parse(buildPosA4Template('', {
      showCompanyDetails: false,
      showCustomerDetails: false,
      colVatPct: false,
      colVatAmt: false,
      colItemImage: true,
      colBatchNo: true,
      showStamp: true,
      showSignature: true,
    }).displayOptions);
    const ds = parsed.salesDesignerSettings;

    expect(ds.showCompanyName).toBe(false);
    expect(ds.showCompanyAddress).toBe(false);
    expect(ds.showBillTo).toBe(false);
    expect(ds.showCustomerName).toBe(false);
    expect(ds.colVAT).toBe(false);
    expect(ds.colVATAmount).toBe(false);
    expect(ds.colProductImage).toBe(true);
    expect(ds.colBatchNumber).toBe(true);
    expect(ds.showCompanyStamp).toBe(true);
    expect(ds.showSignatures).toBe(true);
  });

  it('accepts a category override', () => {
    expect(buildPosA4Template('', {}, 'Sales Return').category).toBe('Sales Return');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 11 · HTML helpers with deterministic, testable behaviour
 * ══════════════════════════════════════════════════════════════════════════ */

describe('stripForPreview', () => {
  it('removes script tags entirely', () => {
    const out = stripForPreview('<html><head></head><body><script>alert(1)</script><p>Hi</p></body></html>');
    expect(out).not.toContain('alert(1)');
    expect(out).not.toContain('<script>');
    expect(out).toContain('<p>Hi</p>');
  });

  it('relaxes the fixed millimetre page box to a fluid one', () => {
    const out = stripForPreview('<html><head><style>html,\nbody{width:210mm;min-height:297mm}</style></head><body></body></html>');
    expect(out).toContain('width:100%');
    expect(out).toContain('min-height:0');
    expect(out).not.toContain('210mm');
  });

  it('injects the preview reset stylesheet before </head>', () => {
    const out = stripForPreview('<html><head><title>x</title></head><body></body></html>');
    expect(out).toContain('<style id="__pr__">');
    expect(out.indexOf('__pr__')).toBeLessThan(out.indexOf('</head>'));
  });

  it('returns an empty string for null input rather than throwing', () => {
    expect(stripForPreview(null)).toBe('');
    expect(stripForPreview(undefined)).toBe('');
  });
});

describe('buildThermalPrintHtml — the designer preview shell', () => {
  it('sets the page box per paper size', () => {
    expect(buildThermalPrintHtml('80mm', {})).toContain('size:80mm auto');
    expect(buildThermalPrintHtml('80mm', {})).toContain('width:72mm');
    expect(buildThermalPrintHtml('58mm', {})).toContain('size:58mm auto');
    expect(buildThermalPrintHtml('58mm', {})).toContain('width:50mm');
  });

  it('CHARACTERIZED QUIRK: this builder uses exact equality, not includes("58")', () => {
    // Unlike every text builder in this module, buildThermalPrintHtml compares
    // paperSize === '58mm'. So '58 mm' or 'Epson TM-T58' render at 80mm HERE while the
    // text path treats them as 58mm — the preview and the print can disagree.
    expect(buildThermalPrintHtml('58 mm', {})).toContain('size:80mm auto');
    expect(buildThermalPrintHtml('Epson TM-T58 III', {})).toContain('size:80mm auto');
  });

  it('HTML-escapes every interpolated store field', () => {
    const html = buildThermalPrintHtml('80mm', {
      companyName: 'Tom & Jerry <script>alert(1)</script>',
      trn: '<b>1</b>',
      header: 'A & B',
      footer: '<i>bye</i>',
      showTrn: true,
    });
    expect(html).toContain('Tom &amp; Jerry &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('TRN: &lt;b&gt;1&lt;/b&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;i&gt;bye&lt;/i&gt;');
    // The only <script> substring left is the escaped one.
    expect(html).not.toMatch(/<script[^>]*>/);
  });

  it('omits the TRN, header and footer blocks when they are absent', () => {
    const html = buildThermalPrintHtml('80mm', { companyName: 'X', showTrn: false });
    expect(html).not.toContain('TRN:');
    expect(html).toContain('X');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 12 · Cross-builder invariants that must survive extraction
 * ══════════════════════════════════════════════════════════════════════════ */

describe('cross-builder invariants', () => {
  const allText = [
    ['sales receipt', buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, STORE)],
    ['layaway', buildLayawayReceiptText('80mm', LAYAWAY, { ...STORE, omitHeader: true })],
    ['voucher', buildReceiptVoucherThermalText('80mm', PAYMENT_VOUCHER, { ...VOUCHER_STORE, omitHeader: true })],
    ['statement', buildStatementThermalText('80mm', STATEMENT, { ...VOUCHER_STORE, omitHeader: true })],
    ['printer test', buildThermalTestReceiptText({})],
  ];

  it.each(allText)('%s ends with two blank feed lines', (_name, text) => {
    expect(linesOf(text).slice(-2)).toEqual(['', '']);
  });

  it.each(allText)('%s draws every horizontal rule at exactly one width', (_name, text) => {
    const rules = [...new Set(linesOf(text).filter((l) => /^-+$/.test(l)))];
    expect(rules).toHaveLength(1);
    // The rule length IS the document's declared paper width.
    expect(rules[0].length).toBeGreaterThan(0);
  });

  it.each(allText)('%s keeps every line inside the width its own rules declare', (_name, text) => {
    const width = linesOf(text).find((l) => /^-+$/.test(l)).length;
    linesOf(text).forEach((l) => expect(l.length).toBeLessThanOrEqual(width));
  });

  it('CHARACTERIZED QUIRK: a long customer NAME is never truncated and overruns the paper', () => {
    // Item names are cut with slice(0, width) and addresses are word-wrapped, but the
    // "Customer: <name>" row is pushed onto the line list unclipped. A 58-character
    // trade name prints a 68-column row on 42-column paper, which the printer wraps at
    // an arbitrary point (or drops) rather than at a word boundary.
    const l = linesOf(buildThermalReceiptText('80mm', INVOICE_LONG_TEXT, STORE));
    const nameRow = l.find((x) => x.startsWith('Customer: '));

    expect(nameRow).toBe('Customer: Al Madina General Trading and Contracting Establishment LLC');
    expect(nameRow.length).toBe(69);
    expect(nameRow.length).toBeGreaterThan(42);

    // The same name on 58mm paper overruns by even more.
    const narrow = linesOf(buildThermalReceiptText('58mm', INVOICE_LONG_TEXT, STORE))
      .find((x) => x.startsWith('Customer: '));
    expect(narrow.length).toBe(69);
  });

  it.each(allText)('%s contains no HTML and no ESC/POS control bytes', (_name, text) => {
    // These bodies are handed to buildEscPosDocument / buildEscPosFromPlainText, which
    // own every control sequence. A stray one here would be double-encoded.
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);

    const controlChars = [...text].filter((ch) => {
      const code = ch.codePointAt(0);
      return code < 0x20 && code !== 0x0a;
    });
    expect(controlChars).toEqual([]);
  });

  it('CHARACTERIZED RISK: receipts can carry characters the latin-1 ESC/POS path cannot encode', () => {
    // The store header fixture contains an em dash (U+2014). buildEscPosFromPlainText
    // encodes to WPC1252, where an em dash is representable (0x97) — but the statement's
    // description separator and any Arabic customer name are not. Nothing in this module
    // constrains its output to the printable set, so non-encodable text degrades to '?'
    // at the byte layer rather than being caught here.
    const text = buildThermalReceiptText('80mm', INVOICE_PERSISTED_EXCLUSIVE, STORE);
    expect(text).toContain('—');
    expect(text.codePointAt(text.indexOf('—'))).toBeGreaterThan(0x7f);
  });
});
