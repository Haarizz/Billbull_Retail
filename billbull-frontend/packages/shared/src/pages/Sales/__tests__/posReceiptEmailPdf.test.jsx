import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/axiosConfig', () => ({ default: { post: vi.fn() } }));

import api from '../../../api/axiosConfig';
import { sendSalesInvoiceEmail } from '../../../api/salesInvoiceApi';
import ReceiptShareModal from '../../../components/pos/ReceiptShareModal';
import {
  buildPosReceiptPdfHtml,
  buildThermalReceiptHtmlForSale,
  fitReceiptHtmlToPaper,
  RECEIPT_PDF_FALLBACK_PAGE_MM,
  RECEIPT_PDF_SLACK_MM,
  thermalPaperWidthMm,
} from '../POS/device/printing/buildReceiptPdfHtml';
import { buildThermalReceiptArtifacts } from '../POS/device/printing/buildThermalReceiptArtifacts';

/**
 * The till's "Email Receipt" attaches the receipt as a PDF: buildReceiptPdfHtml builds the
 * print HTML, the sales-invoice send-email endpoint renders and attaches it.
 *
 * POSSales.jsx is not rendered by this project's test setup, so handleReceiptShareSend is
 * pulled out of the real source and executed with mocked API calls (the same technique as
 * posShowFeedback.characterization) — the handler assertions run POSSales' own code.
 */

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = read('../POSSales.jsx');

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const TEMPLATE_SETTINGS = {
  tplOutletName: 'BillBull Trading LLC', tplOutletAddress: 'Shop 12, Dubai Mall',
  tplOutletPhone: '+971 4 123 4567', tplLogoDataUrl: LOGO, tplStampDataUrl: null,
  effectiveOutletTrn: '100123456700003',
  tplReceiptHeader: 'SALES RECEIPT', tplReceiptHeaderAr: 'إيصال',
  tplReceiptFooter: 'RECEIPT-FOOTER', tplReceiptPaper: '58mm',
  tplReceiptShowLogo: true, tplReceiptShowBarcode: true,
  tplReceiptShowCompanyDetails: true, tplReceiptShowCustomerDetails: true,
  tplReceiptShowTerms: true, tplReceiptShowNotes: false, tplReceiptShowBankDetails: false,
  tplReceiptShowQRCode: false, tplReceiptColDiscount: true,
  tplInvoiceHeader: 'TAX INVOICE', tplInvoiceHeaderAr: 'فاتورة ضريبية',
  tplInvoiceFooter: 'INVOICE-FOOTER', tplInvoicePaper: '80mm',
  tplInvoiceQrPlacement: 'before', tplInvoiceShowLogo: true,
  tplInvoiceShowCompanyDetails: true, tplInvoiceShowCustomerDetails: true,
  tplInvoiceShowTrn: true, tplInvoiceShowTerms: true, tplInvoiceShowNotes: true,
  tplInvoiceShowBankDetails: false, tplInvoiceShowQRCode: false,
  tplInvoiceShowGrandTotalBanner: true, tplInvoiceColDiscount: true, tplInvoiceColVatAmt: true,
  receiptTemplateId: 'native',
  t2ReceiptShowLogo: true, t2ReceiptShowCompanyDetails: true, t2ReceiptShowArabic: true,
  t2ReceiptShowCustomerDetails: true, t2ReceiptShowAccountBalance: true,
  t2ReceiptShowDelivery: true, t2ReceiptShowPaymentDetails: true, t2ReceiptShowLoyalty: true,
  t2ReceiptShowQRCode: false, t2ReceiptShowFooterText: true, t2ReceiptShowBarcode: true,
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
  customerOptions: [{ id: 'c1', code: 'CUST-1', name: 'Fatima Hassan', email: 'fatima@example.com' }],
  currentTerminal: { terminalId: 'TERM-01', counterName: 'Counter 1', branchName: 'Main Branch' },
  currentSession: { id: 9, branchName: 'Main Branch' },
};

/** The invoice as GET /api/sales/invoices/{id} returns it after checkout. */
const storedInvoice = (o = {}) => ({
  id: 42,
  invoiceNumber: 'SI-POS-000124',
  invoiceDate: '2026-10-12',
  createdAt: '2026-10-12T08:30:00Z',
  customerName: 'Fatima Hassan',
  customerCode: 'CUST-1',
  subTotal: 360,
  taxTotal: 18,
  invoiceTotal: 378,
  paymentMode: 'Cash + Card',
  posTerminalId: 'TERM-01',
  items: [{
    itemCode: 'SKU-400', itemName: 'Discounted Widget', quantity: 2,
    unitPrice: 200, grossAmount: 400, netAmount: 360, discountPercent: 10,
    taxPercent: 5, taxAmount: 18,
  }],
  ...o,
});

const PAYMENT_BLOCK = {
  summaryLabel: 'Cash + Visa',
  details: [
    { label: 'Cash', labelAr: 'نقداً', amount: 200, type: 'CASH', received: true, reference: null },
    { label: 'Visa', labelAr: 'بطاقة', amount: 178, type: 'CARD', received: true, reference: 'AUTH-9' },
  ],
  totalReceived: 378, transferredToAr: 0, hasReceivable: false, invoiceTotal: 378, changeAmount: 0,
};

/** useCheckout's lastPaidInvoice snapshot. */
const lastPaid = (o = {}) => ({
  id: 'SI-POS-000124',
  total: 378,
  invoice: { id: 42, invoiceNumber: 'SI-POS-000124' },
  customer: { id: 'c1', code: 'CUST-1', name: 'Fatima Hassan', email: 'fatima@example.com', phone: '+971 50 111 2222' },
  paymentMode: 'Cash + Card',
  paidAmount: 378,
  changeAmount: 0,
  depositAmount: 0,
  paymentBlock: PAYMENT_BLOCK,
  creditPreviousBalance: null, creditInvoiceCredit: null, creditAmountPaid: null, creditUpdatedBalance: null,
  ...o,
});

const pdfArgs = (o = {}) => ({
  lastPaidInvoice: lastPaid(),
  fetchInvoice: vi.fn(async () => storedInvoice()),
  paperForSale: (doc) => ((doc.taxTotal || 0) > 0 ? TEMPLATE_SETTINGS.tplInvoicePaper : TEMPLATE_SETTINGS.tplReceiptPaper),
  buildInvoiceSheetHtml: vi.fn(async () => '<html><head><style>@page{size:A4}</style></head><body>SHEET</body></html>'),
  company: { logoUrl: '/uploads/logo.png' },
  tplInvoiceShowStamp: false,
  templateSettings: TEMPLATE_SETTINGS,
  posContext: POS_CONTEXT,
  measureHeightMm: vi.fn(async () => 150),
  ...o,
});

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); api.post.mockReset(); });

describe('buildPosReceiptPdfHtml — thermal receipt', () => {
  it('builds the completed sale from the stored invoice, pinned to 80mm paper', async () => {
    const args = pdfArgs();
    const html = await buildPosReceiptPdfHtml(args);

    expect(args.fetchInvoice).toHaveBeenCalledWith(42);
    expect(html).toContain('SI-POS-000124');
    expect(html).toContain('Discounted Widget');
    expect(html).toContain('378.00');
    expect(html).toContain('VAT');
    expect(html).toContain('18.00');
    // Settled payment block: one row per tender.
    expect(html).toContain('Visa');
    expect(html).toContain('Cash');
    expect(html).toContain('Fatima Hassan');
    expect(html).toContain(LOGO);
    expect(html).toContain('INVOICE-FOOTER');
    expect(html).toContain(`@page{size:80mm ${150 + RECEIPT_PDF_SLACK_MM}mm;margin:0}`);
    expect(args.measureHeightMm).toHaveBeenCalledWith(expect.stringContaining('SI-POS-000124'), 80);
    expect(args.buildInvoiceSheetHtml).not.toHaveBeenCalled();
  });

  it('shows the stored transaction even when the till snapshot disagrees', async () => {
    const html = await buildPosReceiptPdfHtml(pdfArgs({
      lastPaidInvoice: lastPaid({ total: 1, id: 'STALE-1' }),
    }));
    expect(html).toContain('SI-POS-000124');
    expect(html).not.toContain('STALE-1');
  });

  it('an untaxed sale uses the POS Receipt tab: its paper (58mm), title and footer, no tax rows', async () => {
    const args = pdfArgs({ fetchInvoice: vi.fn(async () => storedInvoice({ taxTotal: 0, invoiceTotal: 360, items: [{ itemCode: 'SKU-1', itemName: 'Plain Item', quantity: 1, unitPrice: 360, netAmount: 360 }] })) });
    const html = await buildPosReceiptPdfHtml(args);
    expect(html).toContain('RECEIPT-FOOTER');
    expect(html).not.toContain('INVOICE-FOOTER');
    expect(html).toContain('SALES RECEIPT');
    expect(html).not.toContain('Taxable Amount');
    expect(html).toContain('@page{size:58mm');
    expect(args.measureHeightMm).toHaveBeenCalledWith(expect.any(String), 58);
  });

  it('Template 2 builds the bilingual receipt on its configured width', async () => {
    const html = await buildPosReceiptPdfHtml(pdfArgs({
      templateSettings: { ...TEMPLATE_SETTINGS, receiptTemplateId: 'billbull-ar' },
    }));
    expect(html).toContain('bb-receipt');
    expect(html).toContain('SI-POS-000124');
    expect(html).toContain('فاتورة ضريبية');
    expect(html).toContain('@page{size:80mm');
  });

  it('carries the cash/change rows and the layaway deposit when the sale had them', async () => {
    const html = await buildPosReceiptPdfHtml(pdfArgs({
      lastPaidInvoice: lastPaid({ paymentBlock: null, paidAmount: 400, changeAmount: 22, depositAmount: 100 }),
    }));
    expect(html).toContain('Cash Received');
    expect(html).toContain('400.00');
    expect(html).toContain('Change Returned');
    expect(html).toContain('22.00');
    expect(html).toContain('Deposit Paid');
    expect(html).toContain('278.00');
  });

  it('draws the ZATCA QR as an image when the receipt prints one, and the stamp in its place when uploaded', async () => {
    const withQr = await buildPosReceiptPdfHtml(pdfArgs({ templateSettings: { ...TEMPLATE_SETTINGS, tplInvoiceShowQRCode: true } }));
    expect(withQr).toMatch(/<img src="data:image\/png;base64,[^"]+" style="width:80px;height:80px" alt="ZATCA QR"/);

    const stamp = 'data:image/png;base64,U1RBTVA=';
    const withStamp = await buildPosReceiptPdfHtml(pdfArgs({ templateSettings: { ...TEMPLATE_SETTINGS, tplInvoiceShowQRCode: true, tplStampDataUrl: stamp } }));
    expect(withStamp).toContain(stamp);
    expect(withStamp).not.toContain('alt="ZATCA QR"');
  });

  it('falls back to fixed-length pages of the same width when the receipt cannot be measured', async () => {
    const html = await buildPosReceiptPdfHtml(pdfArgs({ measureHeightMm: vi.fn(async () => null) }));
    expect(html).toContain(`@page{size:80mm ${RECEIPT_PDF_FALLBACK_PAGE_MM}mm;margin:0}`);
  });

  it('says the same thing as the thermal print artifacts for the same sale', async () => {
    const full = storedInvoice();
    // No logo: jsdom cannot decode images, so the ESC/POS logo raster would never settle.
    const templateSettings = { ...TEMPLATE_SETTINGS, tplLogoDataUrl: null };
    const { html } = await buildThermalReceiptHtmlForSale({ templateSettings, posContext: POS_CONTEXT, full });
    const { text } = await buildThermalReceiptArtifacts({ templateSettings, posContext: POS_CONTEXT, full });
    for (const fact of ['SI-POS-000124', 'Discounted Widget', '378.00', 'INVOICE-FOOTER', 'BillBull Trading LLC', 'TERM-01', 'Aisha K.']) {
      expect(text, fact).toContain(fact);
      expect(html, fact).toContain(fact);
    }
  });
});

describe('buildPosReceiptPdfHtml — sheet paper', () => {
  it('returns exactly the sheet HTML Print Receipt prints, with the same template inputs', async () => {
    const args = pdfArgs({ paperForSale: () => 'A4' });
    const html = await buildPosReceiptPdfHtml(args);

    expect(html).toBe('<html><head><style>@page{size:A4}</style></head><body>SHEET</body></html>');
    const [doc, data, options] = args.buildInvoiceSheetHtml.mock.calls[0];
    expect(doc.invoiceNumber).toBe('SI-POS-000124');
    expect(data).toBeTruthy();
    expect(options.companyProfile).toMatchObject({
      companyName: 'BillBull Trading LLC', trn: '100123456700003', currency: 'AED', logoUrl: LOGO,
    });
    expect(args.measureHeightMm).not.toHaveBeenCalled();
  });
});

describe('buildPosReceiptPdfHtml — failures stop the email', () => {
  it.each([
    ['the invoice fetch fails', { fetchInvoice: vi.fn(async () => { throw new Error('Network Error'); }) }],
    ['a different invoice comes back', { fetchInvoice: vi.fn(async () => storedInvoice({ id: 43 })) }],
    ['the sheet template fails', { paperForSale: () => 'A4', buildInvoiceSheetHtml: vi.fn(async () => { throw new Error('no template'); }) }],
    ['the sheet template returns nothing', { paperForSale: () => 'A4', buildInvoiceSheetHtml: vi.fn(async () => '') }],
  ])('throws when %s', async (_, over) => {
    await expect(buildPosReceiptPdfHtml(pdfArgs(over))).rejects.toThrow('Could not prepare the receipt PDF, so the email was not sent.');
  });

  it('throws when there is no settled invoice', async () => {
    await expect(buildPosReceiptPdfHtml(pdfArgs({ lastPaidInvoice: lastPaid({ invoice: null }) })))
      .rejects.toThrow('Invoice is not available to email yet.');
  });
});

describe('page geometry helpers', () => {
  it('pins width and measured height, after the receipt styles', () => {
    const out = fitReceiptHtmlToPaper('<html><head><style>@page{margin:0;size:80mm auto}</style></head><body>x</body></html>', { widthMm: 80, heightMm: 120.2 });
    expect(out.indexOf('size:80mm auto')).toBeLessThan(out.indexOf(`size:80mm ${Math.ceil(120.2 + RECEIPT_PDF_SLACK_MM)}mm`));
    expect(out).toContain('</style></head><body>x</body>');
  });

  it('maps the paper setting to its width', () => {
    expect(thermalPaperWidthMm('58mm')).toBe(58);
    expect(thermalPaperWidthMm('80mm')).toBe(80);
    expect(thermalPaperWidthMm(undefined)).toBe(80);
  });
});

describe('sendSalesInvoiceEmail', () => {
  it('posts pdfHtml and pdfKind next to the unchanged email fields', async () => {
    api.post.mockResolvedValue({ data: { message: 'ok' } });
    await sendSalesInvoiceEmail(42, { toEmail: 'a@b.co', subject: 'S', htmlBody: '<p>x</p>', pdfHtml: '<html>r</html>', pdfKind: 'POS_RECEIPT' });
    expect(api.post).toHaveBeenCalledWith('/api/sales/invoices/42/send-email', {
      toEmail: 'a@b.co', subject: 'S', htmlBody: '<p>x</p>', inlineAttachments: [], pdfHtml: '<html>r</html>', pdfKind: 'POS_RECEIPT',
    });
  });

  it('leaves pdfKind out for the back-office callers that do not send one', async () => {
    api.post.mockResolvedValue({ data: {} });
    await sendSalesInvoiceEmail(42, { toEmail: 'a@b.co', htmlBody: '<p>x</p>', pdfHtml: '<html>p</html>' });
    expect(JSON.parse(JSON.stringify(api.post.mock.calls[0][1]))).not.toHaveProperty('pdfKind');
  });
});

// ---------------------------------------------------------------------------------------
// POSSales' handleReceiptShareSend, executed from the real source.

const DECL_START = '  const handleReceiptShareSend = useCallback(async (value) => {';
const extractHandler = () => {
  const start = POS_SALES.indexOf(DECL_START);
  const end = POS_SALES.indexOf(']);', start);
  expect(start, 'handleReceiptShareSend declaration').toBeGreaterThan(-1);
  return POS_SALES.slice(start, end + ']);'.length);
};

const HANDLER_DEPS = [
  'useCallback', 'lastPaidInvoice', 'receiptShareChannel', 'formatCurrencyStr', 'setReceiptShareFeedback',
  'buildPosReceiptPdfHtml', 'getSalesInvoiceById', 'sendSalesInvoiceEmail', 'paperForSale', 'buildInvoiceSheetHtml',
  'company', 'tplInvoiceShowStamp', 'receiptArtifactTemplateSettings', 'activeCurrency', 'cashierDisplayName',
  'customerOptions', 'currentTerminal', 'currentSession', 'WALK_IN_CUSTOMER',
];

const makeHandler = (over = {}) => {
  const deps = {
    useCallback: (fn) => fn,
    lastPaidInvoice: lastPaid(),
    receiptShareChannel: 'email',
    formatCurrencyStr: (n) => `AED ${Number(n).toFixed(2)}`,
    setReceiptShareFeedback: vi.fn(),
    // The real builder; only the DOM measurement is stubbed (jsdom has no layout).
    buildPosReceiptPdfHtml: (args) => buildPosReceiptPdfHtml({ ...args, measureHeightMm: async () => 150 }),
    getSalesInvoiceById: vi.fn(async () => storedInvoice()),
    sendSalesInvoiceEmail: vi.fn(async () => ({ message: 'Email sent successfully' })),
    paperForSale: (doc) => ((doc.taxTotal || 0) > 0 ? '80mm' : '58mm'),
    buildInvoiceSheetHtml: vi.fn(async () => '<html>SHEET</html>'),
    company: null,
    tplInvoiceShowStamp: false,
    receiptArtifactTemplateSettings: TEMPLATE_SETTINGS,
    activeCurrency: POS_CONTEXT.activeCurrency,
    cashierDisplayName: POS_CONTEXT.cashierDisplayName,
    customerOptions: POS_CONTEXT.customerOptions,
    currentTerminal: POS_CONTEXT.currentTerminal,
    currentSession: POS_CONTEXT.currentSession,
    WALK_IN_CUSTOMER: { id: 'walk-in' },
    ...over,
  };
  const declare = new Function(...HANDLER_DEPS, `${extractHandler()}\nreturn handleReceiptShareSend;`);
  return { handler: declare(...HANDLER_DEPS.map((k) => deps[k])), deps };
};

describe('handleReceiptShareSend — email channel (POSSales source, executed)', () => {
  it('sends the receipt print HTML as pdfHtml with the POS receipt kind, then reports success', async () => {
    const { handler, deps } = makeHandler();
    await handler('customer@example.com');

    expect(deps.getSalesInvoiceById).toHaveBeenCalledWith(42);
    expect(deps.sendSalesInvoiceEmail).toHaveBeenCalledTimes(1);
    const [id, payload] = deps.sendSalesInvoiceEmail.mock.calls[0];
    expect(id).toBe(42);
    expect(payload.toEmail).toBe('customer@example.com');
    expect(payload.pdfKind).toBe('POS_RECEIPT');
    expect(payload.pdfHtml).toContain('SI-POS-000124');
    expect(payload.pdfHtml).toContain('Discounted Widget');
    expect(payload.pdfHtml).toContain('@page{size:80mm');
    expect(payload.pdfHtml).toContain(LOGO);
    expect(payload.pdfHtml).not.toContain('cid:');
    expect(deps.setReceiptShareFeedback).toHaveBeenCalledWith({ type: 'success', message: 'Receipt emailed to customer@example.com.' });
    expect(deps.getSalesInvoiceById.mock.invocationCallOrder[0]).toBeLessThan(deps.sendSalesInvoiceEmail.mock.invocationCallOrder[0]);
  });

  it('keeps the email subject and body exactly as before', async () => {
    const { handler, deps } = makeHandler();
    await handler('customer@example.com');
    const payload = deps.sendSalesInvoiceEmail.mock.calls[0][1];
    expect(payload.subject).toBe('Receipt SI-POS-000124');
    expect(payload.htmlBody).toBe('<p>Invoice: SI-POS-000124, Total: AED 378.00</p>');
    expect(payload).not.toHaveProperty('inlineAttachments');
    expect(Object.keys(payload).sort()).toEqual(['htmlBody', 'pdfHtml', 'pdfKind', 'subject', 'toEmail']);
  });

  it('a sheet-paper till attaches its sheet print HTML', async () => {
    const { handler, deps } = makeHandler({ paperForSale: () => 'A4' });
    await handler('customer@example.com');
    expect(deps.sendSalesInvoiceEmail.mock.calls[0][1].pdfHtml).toBe('<html>SHEET</html>');
  });

  it('a receipt that cannot be built is never sent and never reported as sent', async () => {
    const { handler, deps } = makeHandler({ getSalesInvoiceById: vi.fn(async () => { throw new Error('Network Error'); }) });
    await expect(handler('customer@example.com')).rejects.toThrow('Could not prepare the receipt PDF, so the email was not sent.');
    expect(deps.sendSalesInvoiceEmail).not.toHaveBeenCalled();
    expect(deps.setReceiptShareFeedback).not.toHaveBeenCalled();
  });

  it('a server-side failure (PDF render or SMTP) is not reported as sent', async () => {
    const { handler, deps } = makeHandler({
      sendSalesInvoiceEmail: vi.fn(async () => { throw new Error('Failed to send email: 535 Authentication failed'); }),
    });
    await expect(handler('customer@example.com')).rejects.toThrow('535 Authentication failed');
    expect(deps.setReceiptShareFeedback).not.toHaveBeenCalled();
  });

  it('a sale with no stored invoice id is refused before anything is built', async () => {
    const { handler, deps } = makeHandler({ lastPaidInvoice: lastPaid({ invoice: null }) });
    await expect(handler('customer@example.com')).rejects.toThrow('Invoice is not available to email yet.');
    expect(deps.getSalesInvoiceById).not.toHaveBeenCalled();
    expect(deps.sendSalesInvoiceEmail).not.toHaveBeenCalled();
  });
});

describe('handleReceiptShareSend — the other channels are untouched', () => {
  it('WhatsApp still opens wa.me and builds no PDF', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { handler, deps } = makeHandler({ receiptShareChannel: 'whatsapp' });
    await handler('+971 50 111 2222');
    expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/971501112222?text='), '_blank');
    expect(deps.getSalesInvoiceById).not.toHaveBeenCalled();
    expect(deps.sendSalesInvoiceEmail).not.toHaveBeenCalled();
  });

  it('SMS keeps its stub notice and builds no PDF', async () => {
    const { handler, deps } = makeHandler({ receiptShareChannel: 'sms' });
    await handler('0501112222');
    expect(deps.setReceiptShareFeedback).toHaveBeenCalledWith({ type: 'success', message: 'Receipt SI-POS-000124 – AED 378.00 — SMS queued for 0501112222.' });
    expect(deps.getSalesInvoiceById).not.toHaveBeenCalled();
  });
});

describe('Send by Email dialog with the real handler', () => {
  const openDialog = (handler) => {
    const onClose = vi.fn();
    render(<ReceiptShareModal channel="email" initialValue="customer@example.com" onSend={handler} onClose={onClose} />);
    return onClose;
  };

  it('a PDF that cannot be prepared shows the error and keeps the dialog open', async () => {
    const { handler, deps } = makeHandler({ getSalesInvoiceById: vi.fn(async () => { throw new Error('Network Error'); }) });
    const onClose = openDialog(handler);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /send/i })); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not prepare the receipt PDF, so the email was not sent.');
    expect(onClose).not.toHaveBeenCalled();
    expect(deps.sendSalesInvoiceEmail).not.toHaveBeenCalled();
    expect(deps.setReceiptShareFeedback).not.toHaveBeenCalled();
  });

  it('an SMTP failure shows the server message and no success', async () => {
    const { handler, deps } = makeHandler({
      sendSalesInvoiceEmail: vi.fn(async () => { throw new Error('Failed to send email: 535 Authentication failed'); }),
    });
    const onClose = openDialog(handler);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /send/i })); });
    expect(await screen.findByRole('alert')).toHaveTextContent('535 Authentication failed');
    expect(onClose).not.toHaveBeenCalled();
    expect(deps.setReceiptShareFeedback).not.toHaveBeenCalled();
  });

  it('a successful send closes the dialog', async () => {
    const { handler, deps } = makeHandler();
    const onClose = openDialog(handler);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /send/i })); });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(deps.sendSalesInvoiceEmail).toHaveBeenCalledTimes(1);
  });
});
