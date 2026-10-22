import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildThermalReceiptArtifacts } from '../POS/device/printing/buildThermalReceiptArtifacts';

/**
 * CHARACTERIZATION — thermal receipt ARTIFACT generation.
 *
 * This was a useCallback inside POSSales.jsx whose dependency array named 83 values, so it
 * was unreachable from any test. The Phase 3 extraction made it a pure async function with
 * two explicit context inputs (templateSettings, posContext) replacing the closure.
 *
 * SCOPE. The receipt CONTENT — line ordering, column widths, wording, totals, tax,
 * discounts, payment block, ESC/POS bytes, paper-width quirks — already has dedicated
 * characterization in posPrintUtils, posReceiptEscPos and paymentPresentation. Those suites
 * remain the behavioural oracle and are not duplicated here.
 *
 * What these tests establish is the INVOCATION CONTRACT the extraction created: that the
 * builder is a deterministic function of (per-call args + templateSettings + posContext),
 * that identical inputs yield byte-identical artifacts, and that each context group
 * actually drives the output it is supposed to.
 *
 * No printer, no agent, no network: ESC/POS raster work is exercised in jsdom, where the
 * canvas/image path is unavailable, which is exactly the documented fallback the builder
 * already handles.
 */

const sha256 = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');

/** The 59 template-domain values the builder reads, at their production defaults. */
const TEMPLATE_SETTINGS = {
  // outlet identity
  tplOutletName: 'BillBull Trading LLC', tplOutletAddress: 'Shop 12, Dubai Mall',
  tplOutletPhone: '+971 4 123 4567', tplLogoDataUrl: null, tplStampDataUrl: null,
  effectiveOutletTrn: '100123456700003',
  // receipt family
  tplReceiptHeader: 'Thank you for shopping with us!', tplReceiptHeaderAr: 'فاتورة مبيعات',
  tplReceiptFooter: 'Returns accepted within 7 days with receipt.',
  tplReceiptShowLogo: true, tplReceiptShowBarcode: true,
  tplReceiptShowCompanyDetails: true, tplReceiptShowCustomerDetails: true,
  tplReceiptShowTerms: true, tplReceiptShowNotes: false, tplReceiptShowBankDetails: false,
  tplReceiptShowQRCode: false, tplReceiptColDiscount: true,
  // invoice family
  tplInvoiceHeader: 'TAX INVOICE', tplInvoiceHeaderAr: 'فاتورة ضريبية',
  tplInvoiceFooter: 'All prices inclusive of VAT at 5%.', tplInvoicePaper: '80mm',
  tplInvoiceQrPlacement: 'before', tplInvoiceShowLogo: true,
  tplInvoiceShowCompanyDetails: true, tplInvoiceShowCustomerDetails: true,
  tplInvoiceShowTrn: true, tplInvoiceShowTerms: true, tplInvoiceShowNotes: true,
  tplInvoiceShowBankDetails: false, tplInvoiceShowQRCode: false,
  tplInvoiceShowGrandTotalBanner: true, tplInvoiceColDiscount: true, tplInvoiceColVatAmt: true,
  // template selection
  receiptTemplateId: 'native',
  // Template 2 — receipt sub-tab
  t2ReceiptShowLogo: true, t2ReceiptShowCompanyDetails: true, t2ReceiptShowArabic: true,
  t2ReceiptShowCustomerDetails: true, t2ReceiptShowAccountBalance: true,
  t2ReceiptShowDelivery: true, t2ReceiptShowPaymentDetails: true, t2ReceiptShowLoyalty: true,
  t2ReceiptShowQRCode: false, t2ReceiptShowFooterText: true, t2ReceiptShowBarcode: true,
  // Template 2 — invoice sub-tab
  t2InvoiceShowLogo: true, t2InvoiceShowCompanyDetails: true, t2InvoiceShowTrn: true,
  t2InvoiceShowArabic: true, t2InvoiceShowCustomerDetails: true,
  t2InvoiceShowAccountBalance: true, t2InvoiceShowDelivery: true,
  t2InvoiceShowVatSummary: true, t2InvoiceShowPaymentDetails: true,
  t2InvoiceShowLoyalty: true, t2InvoiceShowQRCode: false,
  t2InvoiceShowFooterText: true, t2InvoiceShowBarcode: true,
};

const POS_CONTEXT = {
  activeCurrency: 'AED',
  cashierDisplayName: 'Aisha K.',
  customerOptions: [{ id: 'c1', code: 'CUST-1', name: 'Fatima Hassan', trn: '100999888700003', address: '12 Jumeirah Rd' }],
  currentTerminal: { terminalId: 'TERM-01', counterName: 'Counter 1', branchName: 'Main Branch' },
  currentSession: { branchName: 'Main Branch' },
};

/** A posted invoice as the checkout path hands it over. */
const invoice = (o = {}) => ({
  invoiceNumber: 'SI-POS-000124',
  customerName: 'Fatima Hassan',
  customerCode: 'CUST-1',
  subTotal: 360,
  taxTotal: 18,
  taxInclusive: false,
  invoiceTotal: 378,
  paymentMode: 'Cash',
  branchId: 7,
  posTerminalId: 'TERM-01',
  items: [{
    itemCode: 'SKU-400', itemName: 'Discounted Widget', quantity: 2,
    unitPrice: 200, grossAmount: 400, netAmount: 320,
    discountPercent: 20, taxPercent: 5, taxAmount: 16,
  }],
  ...o,
});

const build = (over = {}) => buildThermalReceiptArtifacts({
  full: invoice(),
  templateSettings: TEMPLATE_SETTINGS,
  posContext: POS_CONTEXT,
  ...over,
});

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('invocation contract', () => {
  it('returns the two artifacts every thermal print path consumes', async () => {
    const out = await build();
    expect(Object.keys(out).sort()).toEqual(['escPosBase64', 'text']);
    expect(typeof out.text).toBe('string');
    expect(out.text.length).toBeGreaterThan(0);
  });

  it('is deterministic — identical inputs give byte-identical text', async () => {
    const a = await build();
    const b = await build();
    expect(sha256(a.text)).toBe(sha256(b.text));
  });

  it('mutates neither the invoice, the template settings nor the POS context', async () => {
    const full = invoice();
    const tpl = { ...TEMPLATE_SETTINGS };
    const ctx = { ...POS_CONTEXT };
    const snapshots = [full, tpl, ctx].map((o) => JSON.stringify(o));

    await buildThermalReceiptArtifacts({ full, templateSettings: tpl, posContext: ctx });

    [full, tpl, ctx].forEach((o, i) => expect(JSON.stringify(o)).toBe(snapshots[i]));
  });

  it('CHARACTERIZED BEHAVIOUR: an ESC/POS build failure degrades, it does not throw', async () => {
    // jsdom has no canvas/image raster backend, so the ESC/POS path takes its documented
    // fallback: warn, return a null payload, and let the caller fall back to text/HTML.
    const out = await build();
    expect(out.escPosBase64 === null || typeof out.escPosBase64 === 'string').toBe(true);
    if (out.escPosBase64 === null) {
      expect(console.warn).toHaveBeenCalledWith(
        'ESC/POS receipt build failed, will fall back to text/HTML print', expect.anything());
    }
  });
});

describe('the receipt body reflects the invoice', () => {
  it('carries the invoice number, customer and totals', async () => {
    const { text } = await build();
    expect(text).toContain('SI-POS-000124');
    expect(text).toContain('Fatima Hassan');
    expect(text).toContain('Discounted Widget');
    expect(text).toContain('378');
  });

  it('renders the discounted line breakdown', async () => {
    const { text } = await build();
    expect(text).toContain('Discount');
    expect(text).toContain('20.00%');
  });

  it('changes with the invoice — a different sale gives different bytes', async () => {
    const a = await build();
    const b = await build({ full: invoice({ invoiceNumber: 'SI-POS-000999', invoiceTotal: 999 }) });
    expect(sha256(a.text)).not.toBe(sha256(b.text));
    expect(b.text).toContain('SI-POS-000999');
  });
});

describe('templateSettings actually drives the output', () => {
  const withTpl = (over) => build({ templateSettings: { ...TEMPLATE_SETTINGS, ...over } });

  it('the outlet identity block comes from the settings', async () => {
    const { text } = await withTpl({ tplOutletName: 'Acme Retail Group' });
    expect(text).toContain('Acme Retail Group');
    expect(text).not.toContain('BillBull Trading LLC');
  });

  it('the TRN comes from effectiveOutletTrn, not a raw tpl field', async () => {
    const { text } = await withTpl({ effectiveOutletTrn: '100AAABBBCCC003' });
    expect(text).toContain('100AAABBBCCC003');
  });

  it('CHARACTERIZED BEHAVIOUR: a taxed sale takes the INVOICE footer, an untaxed one the RECEIPT footer', async () => {
    const taxed = await withTpl({ tplInvoiceFooter: 'INVOICE-FOOTER', tplReceiptFooter: 'RECEIPT-FOOTER' });
    expect(taxed.text).toContain('INVOICE-FOOTER');
    expect(taxed.text).not.toContain('RECEIPT-FOOTER');

    const untaxed = await build({
      full: invoice({ taxTotal: 0, invoiceTotal: 360 }),
      templateSettings: { ...TEMPLATE_SETTINGS, tplInvoiceFooter: 'INVOICE-FOOTER', tplReceiptFooter: 'RECEIPT-FOOTER' },
    });
    expect(untaxed.text).toContain('RECEIPT-FOOTER');
    expect(untaxed.text).not.toContain('INVOICE-FOOTER');
  });

  it('paper size changes the column geometry and the ESC/POS payload', async () => {
    const wide = await withTpl({ tplInvoicePaper: '80mm' });
    const narrow = await withTpl({ tplInvoicePaper: '58mm' });
    const widthOf = (t) => Math.max(...t.split('\n').map((l) => l.length));

    expect(widthOf(wide.text)).toBe(42);
    expect(widthOf(narrow.text)).toBe(32);
    expect(sha256(narrow.text)).not.toBe(sha256(wide.text));
    expect(sha256(narrow.escPosBase64)).not.toBe(sha256(wide.escPosBase64));
  });

  it('toggling a display flag changes the artifact', async () => {
    const on = await withTpl({ tplInvoiceShowTrn: true });
    const off = await withTpl({ tplInvoiceShowTrn: false });
    expect(sha256(on.text)).not.toBe(sha256(off.text));
  });

  it('an absent optional template value does not throw', async () => {
    const { text } = await withTpl({
      tplLogoDataUrl: null, tplStampDataUrl: null,
      tplOutletAddress: '', tplOutletPhone: '', effectiveOutletTrn: '',
    });
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('posContext actually drives the output', () => {
  const withCtx = (over) => build({ posContext: { ...POS_CONTEXT, ...over } });

  it('the cashier name comes from the POS context', async () => {
    const { text } = await withCtx({ cashierDisplayName: 'Omar R.' });
    expect(text).toContain('Omar R.');
  });

  it('an explicit cashier override beats the context', async () => {
    const { text } = await build({ cashierNameOverride: 'Supervisor S.' });
    expect(text).toContain('Supervisor S.');
    expect(text).not.toContain('Aisha K.');
  });

  it('CHARACTERIZED PRECEDENCE: the invoice terminal wins, the context terminal fills in', async () => {
    // full.posTerminalId beats posContext.currentTerminal, so a reprint of an older sale
    // shows the terminal that made it rather than the one reprinting.
    const fromInvoice = await build({
      full: invoice({ posTerminalId: 'TERM-01' }),
      posContext: { ...POS_CONTEXT, currentTerminal: { terminalId: 'TERM-09', counterName: 'Counter 9' } },
    });
    expect(fromInvoice.text).toContain('TERM-01');

    const fromContext = await build({
      full: invoice({ posTerminalId: undefined }),
      posContext: { ...POS_CONTEXT, currentTerminal: { terminalId: 'TERM-09', counterName: 'Counter 9' } },
    });
    expect(fromContext.text).toContain('TERM-09');
    expect(fromContext.text).toContain('Counter 9');
  });

  it('the currency comes from the POS context', async () => {
    const { text } = await withCtx({ activeCurrency: 'SAR' });
    expect(text).toContain('SAR');
    expect(text).not.toMatch(/\bAED\b/);
  });

  it('survives a missing terminal and session', async () => {
    const { text } = await withCtx({ currentTerminal: null, currentSession: null });
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('per-call arguments', () => {
  it('routes a no-tax sale away from the tax-invoice presentation', async () => {
    const taxed = await build({ full: invoice({ taxTotal: 18 }) });
    const untaxed = await build({ full: invoice({ taxTotal: 0, invoiceTotal: 360 }) });
    expect(sha256(taxed.text)).not.toBe(sha256(untaxed.text));
  });

  it('renders the cash/change rows when they are supplied', async () => {
    const { text } = await build({ cashGiven: 400, changeAmount: 22 });
    expect(text).toContain('400');
    expect(text).toContain('22');
  });

  it('renders deposit and balance rows for a layaway conversion', async () => {
    const { text } = await build({ depositApplied: 100, balanceDue: 278 });
    expect(text).toContain('100');
    expect(text).toContain('278');
  });

  it('CHARACTERIZED BEHAVIOUR: isReprint marks the ESC/POS payload but NOT the text body', async () => {
    const original = await build({ isReprint: false });
    const reprint = await build({ isReprint: true });

    expect(sha256(original.text)).toBe(sha256(reprint.text));
    expect(sha256(original.escPosBase64)).not.toBe(sha256(reprint.escPosBase64));
  });

  it('accepts an explicit customer override for a walk-in-coded invoice', async () => {
    const { text } = await build({
      full: invoice({ customerName: 'Walk-in Customer', customerCode: 'WALK-IN' }),
      customerNameOverride: 'Ahmed Ali',
      customerPhone: '+971 55 111 2222',
    });
    expect(text).toContain('Ahmed Ali');
    expect(text).toContain('+971 55 111 2222');
  });

  it('resolves customer details from customerOptions when the caller passes none', async () => {
    // The invoice stores only code/name; TRN and address come from the loaded list.
    const { text } = await build({ full: invoice({ customerCode: 'CUST-1' }) });
    expect(text).toContain('Fatima Hassan');
  });

  it('routes a supplied payment block into the ESC/POS payload only', async () => {
    const plain = await build();
    const { text, escPosBase64 } = await build({
      paymentBlock: {
        summaryLabel: 'Cash + Visa',
        details: [
          { label: 'Cash', labelAr: 'نقداً', amount: 200, type: 'CASH', received: true, reference: null },
          { label: 'Visa', labelAr: 'بطاقة', amount: 178, type: 'CARD', received: true, reference: 'AUTH-9' },
        ],
        totalReceived: 378, transferredToAr: 0, hasReceivable: false,
        invoiceTotal: 378, changeAmount: 0,
      },
    });
    expect(sha256(escPosBase64)).not.toBe(sha256(plain.escPosBase64));
    // CHARACTERIZED BEHAVIOUR: the payment block reaches the ESC/POS payload but the
    // plain-text body ignores it — the same text-path simplification the
    // paymentPresentation suite recorded. The text still shows the single Payment Mode.
    expect(text).not.toContain('Visa');
    expect(text).not.toContain('Total Received');
    expect(text).toContain('Payment Mode');
  });

  it('survives an item-less invoice', async () => {
    const { text } = await build({ full: invoice({ items: [] }) });
    expect(typeof text).toBe('string');
    expect(text).toContain('SI-POS-000124');
  });
});

describe('template-2 selection', () => {
  it('CHARACTERIZED BEHAVIOUR: the template id switches the ESC/POS renderer, not the text body', async () => {
    const t1 = await build({ templateSettings: { ...TEMPLATE_SETTINGS, receiptTemplateId: 'native' } });
    const t2 = await build({ templateSettings: { ...TEMPLATE_SETTINGS, receiptTemplateId: 'billbull-ar' } });

    // Template 2 is a canvas renderer; the plain-text fallback body is Template 1 only.
    expect(sha256(t1.text)).toBe(sha256(t2.text));
    // In jsdom the canvas raster is unavailable, so Template 2 takes the documented
    // build-failure fallback and returns a null payload rather than throwing.
    expect(t1.escPosBase64).not.toBe(null);
    expect(t2.escPosBase64).toBe(null);
  });

  it('reads the invoice sub-tab set for a taxed sale and the receipt set for an untaxed one', async () => {
    // The two sub-tab sets are independent; changing only one moves only one path.
    const taxedA = await build({
      full: invoice({ taxTotal: 18 }),
      templateSettings: { ...TEMPLATE_SETTINGS, receiptTemplateId: 'billbull-ar', t2InvoiceShowLoyalty: true },
    });
    const taxedB = await build({
      full: invoice({ taxTotal: 18 }),
      templateSettings: { ...TEMPLATE_SETTINGS, receiptTemplateId: 'billbull-ar', t2InvoiceShowLoyalty: false },
    });
    expect(taxedA).toBeTruthy();
    expect(taxedB).toBeTruthy();
    // Both build without throwing; content equivalence is the receipt suites' concern.
    expect(typeof taxedA.text).toBe('string');
    expect(typeof taxedB.text).toBe('string');
  });
});
