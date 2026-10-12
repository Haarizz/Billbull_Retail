// Print HTML for the PDF attached to the till's "Email Receipt".
//
// The backend renders whatever HTML it is given with headless Chromium
// (HtmlPdfService, preferCSSPageSize). This module decides WHICH HTML that is, so the
// attachment is the receipt the customer was given rather than a generic A4 invoice:
//
//   * Sheet paper (A4 / A5 / pre-printed) — the exact buildInvoiceSheetHtml output the
//     till's Print Receipt button prints. It carries its own @page size.
//   * Thermal paper (58mm / 80mm) — the till prints raw ESC/POS there, which has no HTML,
//     so the HTML twin of the active receipt template is built instead: Template 1
//     (buildThermalReceiptHtml) or Template 2 (buildTemplate2Html), with the same
//     tax-split option resolution buildThermalReceiptArtifacts applies to the ESC/POS
//     bag (Tax Invoice tab for a taxed sale, POS Receipt tab for an untaxed one). That
//     builder is characterized and returns exactly { text, escPosBase64 }, so the
//     resolution is mirrored here rather than threaded out of it.
//
// Thermal receipt HTML asks for "@page{size:80mm auto}", which Chromium's PDF output does
// not support: it falls back to US Letter (Template 2 has no @page rule at all and
// stretches across the whole Letter width). fitReceiptHtmlToPaper pins the page to the
// configured paper width and to the measured length of the receipt, so the PDF is one
// continuous strip of receipt paper.
//
// The invoice is re-read from the server (as Print Receipt does) so the PDF shows the
// stored transaction; the till-side figures that are not persisted on the invoice (the
// settled payment block, cash/change, credit-account snapshot, deposit) come from the
// lastPaidInvoice snapshot taken at checkout, which is also what the auto-printed receipt
// used.
import QRCode from 'qrcode';

import { isTaxInvoiceDocument } from '../../../../../utils/documentTaxType';
import { buildQrContent } from '../../../../../utils/printGenerator';
import { buildPosPrintData, buildThermalReceiptHtml, USE_NEW_POS_PRINT_TEMPLATE } from '../../posPrintUtils';
import { buildTemplate2Html } from '../../receiptTemplates/buildTemplate2Html';
import { mapInvoiceToTxn, mapToTemplate2Data } from '../../receiptTemplates/billBullTaxInvoiceData';
import { isSheetPaper } from './posSheetTemplates';

const PX_PER_MM = 96 / 25.4;

/** Space added below the measured receipt so a sub-pixel rounding difference never spills a line onto a second page. */
export const RECEIPT_PDF_SLACK_MM = 6;

/** Page length used when the receipt could not be measured: the receipt keeps its width and breaks across pages of this length. */
export const RECEIPT_PDF_FALLBACK_PAGE_MM = 297;

/** 58mm paper for a "58mm" setting, 80mm for everything else (the ESC/POS and text builders apply the same rule). */
export const thermalPaperWidthMm = (paper) => (String(paper || '').includes('58') ? 58 : 80);

/**
 * Pins the PDF page of a thermal receipt to its paper: width from the paper setting,
 * height from the measured receipt (falling back to fixed-length pages). The rule is
 * appended after the receipt's own styles so it wins over their @page size.
 */
export function fitReceiptHtmlToPaper(html, { widthMm, heightMm = null }) {
  const pageHeight = Number.isFinite(heightMm) && heightMm > 0
    ? Math.ceil(heightMm + RECEIPT_PDF_SLACK_MM)
    : RECEIPT_PDF_FALLBACK_PAGE_MM;
  const rule = `<style>@page{size:${widthMm}mm ${pageHeight}mm;margin:0}html,body{background:#fff}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${rule}</head>`) : `${rule}${html}`;
}

/**
 * Lays the receipt out in an off-screen iframe of the paper's width and returns its
 * height in mm, or null when it cannot be measured (no DOM, a load timeout, zero height).
 */
export async function measureHtmlHeightMm(html, widthMm, { timeoutMs = 5000 } = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.round(widthMm * PX_PER_MM)}px;height:10px;border:0;opacity:0;pointer-events:none;`;
  document.body.appendChild(iframe);
  const withTimeout = (promise) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
  try {
    await withTimeout(new Promise((resolve) => {
      iframe.onload = resolve;
      iframe.srcdoc = html;
    }));
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) return null;
    try { await withTimeout(doc.fonts?.ready ?? Promise.resolve()); } catch { /* measure with what has loaded */ }
    try {
      await withTimeout(Promise.all(Array.from(doc.images || []).map((img) => (img.complete ? null
        : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; })))));
    } catch { /* measure with what has loaded */ }
    const px = Math.max(doc.documentElement.scrollHeight || 0, doc.body?.scrollHeight || 0);
    return px > 0 ? px / PX_PER_MM : null;
  } catch {
    return null;
  } finally {
    iframe.remove();
  }
}

/**
 * The HTML twin of the thermal receipt for a posted invoice — the same template, the
 * same tax-split toggles and the same per-call figures as the ESC/POS print.
 *
 * @returns {Promise<{html: string, widthMm: number}>}
 */
export async function buildThermalReceiptHtmlForSale({
  templateSettings,
  posContext,
  full: fullArg,
  cashGiven = null,
  changeAmount = null,
  paymentBlock = null,
  customerNameOverride = null,
  customerPhone = null,
  customerEmail = null,
  customerTrn = null,
  customerAddress = null,
  creditPreviousBalance = null,
  creditInvoiceCredit = null,
  creditAmountPaid = null,
  creditUpdatedBalance = null,
  depositApplied = null,
  balanceDue = null,
  shippingCharge = null,
}) {
  const {
    t2InvoiceShowAccountBalance, t2InvoiceShowArabic, t2InvoiceShowBarcode,
    t2InvoiceShowCompanyDetails, t2InvoiceShowCustomerDetails, t2InvoiceShowDelivery,
    t2InvoiceShowFooterText, t2InvoiceShowLogo, t2InvoiceShowLoyalty,
    t2InvoiceShowPaymentDetails, t2InvoiceShowQRCode, t2InvoiceShowTrn,
    t2InvoiceShowVatSummary, t2ReceiptShowAccountBalance, t2ReceiptShowArabic,
    t2ReceiptShowBarcode, t2ReceiptShowCompanyDetails, t2ReceiptShowCustomerDetails,
    t2ReceiptShowDelivery, t2ReceiptShowFooterText, t2ReceiptShowLogo,
    t2ReceiptShowLoyalty, t2ReceiptShowPaymentDetails, t2ReceiptShowQRCode,
    tplInvoiceColDiscount, tplInvoiceColVatAmt, tplInvoiceFooter,
    tplInvoiceHeader, tplInvoiceHeaderAr, tplInvoicePaper, tplReceiptPaper,
    tplInvoiceQrPlacement, tplInvoiceShowBankDetails, tplInvoiceShowCompanyDetails,
    tplInvoiceShowCustomerDetails, tplInvoiceShowGrandTotalBanner, tplInvoiceShowLogo,
    tplInvoiceShowNotes, tplInvoiceShowQRCode, tplInvoiceShowTerms,
    tplInvoiceShowTrn, tplLogoDataUrl, tplOutletAddress,
    tplOutletName, tplOutletPhone, tplReceiptColDiscount,
    tplReceiptFooter, tplReceiptHeader, tplReceiptHeaderAr,
    tplReceiptShowBankDetails, tplReceiptShowCompanyDetails,
    tplReceiptShowCustomerDetails, tplReceiptShowLogo, tplReceiptShowNotes,
    tplReceiptShowQRCode, tplReceiptShowTerms, tplStampDataUrl,
    receiptTemplateId, effectiveOutletTrn,
  } = templateSettings;
  const { activeCurrency, cashierDisplayName, customerOptions = [], currentTerminal, currentSession } = posContext;

  // Same customer resolution as buildThermalReceiptArtifacts: the live name beats the
  // stored one, and contact details fall back to the loaded customer record by code.
  const full = (customerNameOverride && customerNameOverride.trim())
    ? { ...fullArg, customerName: customerNameOverride.trim() }
    : fullArg;
  const custRec = full.customerCode
    ? customerOptions.find((c) => c.code === full.customerCode || c.id === full.customerCode)
    : (() => {
        const name = (full.customerName || '').trim().toLowerCase();
        if (!name || name === 'walk-in customer') return null;
        const matches = customerOptions.filter((c) => (c.name || '').trim().toLowerCase() === name);
        return matches.length === 1 ? matches[0] : null;
      })();
  const resolvedPhone = customerPhone || custRec?.phone || full.customerPhone || null;
  const resolvedEmail = customerEmail || custRec?.email || full.customerEmail || null;
  const resolvedTrn = customerTrn || custRec?.trn || full.customerTrn || null;
  const resolvedAddress = customerAddress || custRec?.address || full.customerAddress || null;

  // Tax Invoice tab for a taxed sale, POS Receipt tab for an untaxed one.
  const hasTax = isTaxInvoiceDocument(full);
  const thermalPaper = hasTax ? tplInvoicePaper : tplReceiptPaper;
  const activeHeader = hasTax ? tplInvoiceHeader : tplReceiptHeader;
  const activeHeaderAr = hasTax ? tplInvoiceHeaderAr : tplReceiptHeaderAr;
  const activeFooter = hasTax ? tplInvoiceFooter : tplReceiptFooter;
  const activeShowQRCode = hasTax ? tplInvoiceShowQRCode : tplReceiptShowQRCode;
  const activeT2 = hasTax
    ? {
        hasTax: true,
        showLogo: t2InvoiceShowLogo, showCompanyDetails: t2InvoiceShowCompanyDetails, showTrn: t2InvoiceShowTrn,
        showArabic: t2InvoiceShowArabic, showCustomerDetails: t2InvoiceShowCustomerDetails,
        showAccountBalance: t2InvoiceShowAccountBalance, showDelivery: t2InvoiceShowDelivery,
        showVatSummary: t2InvoiceShowVatSummary, showPaymentDetails: t2InvoiceShowPaymentDetails,
        showLoyalty: t2InvoiceShowLoyalty, showQRCode: t2InvoiceShowQRCode,
        showFooterText: t2InvoiceShowFooterText, showBarcode: t2InvoiceShowBarcode,
      }
    : {
        hasTax: false,
        showLogo: t2ReceiptShowLogo, showCompanyDetails: t2ReceiptShowCompanyDetails, showTrn: false,
        showArabic: t2ReceiptShowArabic, showCustomerDetails: t2ReceiptShowCustomerDetails,
        showAccountBalance: t2ReceiptShowAccountBalance, showDelivery: t2ReceiptShowDelivery,
        showVatSummary: false, showPaymentDetails: t2ReceiptShowPaymentDetails,
        showLoyalty: t2ReceiptShowLoyalty, showQRCode: t2ReceiptShowQRCode,
        showFooterText: t2ReceiptShowFooterText, showBarcode: t2ReceiptShowBarcode,
      };
  const isTemplate2 = receiptTemplateId === 'billbull-ar';
  const showQr = isTemplate2 ? activeT2.showQRCode : activeShowQRCode;
  // An uploaded stamp takes the QR's place, as on the printed receipt.
  const stampDataUrl = showQr && tplStampDataUrl ? tplStampDataUrl : null;
  // ESC/POS has the printer draw the QR itself; HTML needs the image. The receipt prints
  // one, so a QR that cannot be built stops the PDF rather than silently dropping it.
  const qrDataUrl = showQr && !stampDataUrl
    ? await QRCode.toDataURL(buildQrContent(buildPosPrintData(full, activeFooter), tplOutletName),
      { errorCorrectionLevel: 'L', width: 160, margin: 1 })
    : null;

  const cashierName = cashierDisplayName;
  const salespersonName = full.salespersonName || '';
  const terminalId = full.posTerminalId || currentTerminal?.terminalId;
  const widthMm = thermalPaperWidthMm(thermalPaper);

  if (isTemplate2) {
    const txn = mapInvoiceToTxn(full, {
      currency: activeCurrency, terminalId, cashierName, salespersonName,
      branchName: full.branchName || currentTerminal?.branchName || currentSession?.branchName || '',
      customerPhone: resolvedPhone, customerEmail: resolvedEmail,
      customerTrn: resolvedTrn, customerAddress: resolvedAddress,
      deliveryAddress: full.shippingAddress || null,
      shippingCharge, cashGiven, changeAmount, paymentBlock,
      // Template 2's own Account Balance toggle, as on its ESC/POS path.
      showCreditBalance: activeT2.showAccountBalance,
      creditPreviousBalance, creditInvoiceCredit, creditAmountPaid, creditUpdatedBalance,
    });
    const outlet = {
      name: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone,
      logoDataUrl: tplLogoDataUrl, qrDataUrl, stampDataUrl,
      footerText: activeFooter, titleEn: activeHeader, titleAr: activeHeaderAr,
    };
    return { html: buildTemplate2Html(mapToTemplate2Data(outlet, txn, activeT2)), widthMm };
  }

  const html = buildThermalReceiptHtml(thermalPaper, full, {
    companyName: tplOutletName,
    trn: effectiveOutletTrn,
    documentTitle: activeHeader,
    footer: activeFooter,
    // A no-tax sale never shows TRN / VAT summary.
    showTrn: hasTax ? tplInvoiceShowTrn : false,
    showVatSummary: hasTax ? tplInvoiceColVatAmt : false,
    hasTax,
    logoDataUrl: tplLogoDataUrl,
    showLogo: hasTax ? tplInvoiceShowLogo : tplReceiptShowLogo,
    showCompanyDetails: hasTax ? tplInvoiceShowCompanyDetails : tplReceiptShowCompanyDetails,
    outletAddress: tplOutletAddress,
    outletPhone: tplOutletPhone,
    showServiceCharge: tplInvoiceShowGrandTotalBanner,
    showPaymentDetails: hasTax ? tplInvoiceColDiscount : tplReceiptColDiscount,
    showQRCode: activeShowQRCode,
    zatcaQrDataUrl: qrDataUrl,
    stampDataUrl,
    qrPlacement: tplInvoiceQrPlacement,
    showCustomerDetails: hasTax ? tplInvoiceShowCustomerDetails : tplReceiptShowCustomerDetails,
    showFooterText: hasTax ? tplInvoiceShowTerms : tplReceiptShowTerms,
    showLoyaltyPoints: hasTax ? tplInvoiceShowNotes : tplReceiptShowNotes,
    showCreditBalance: hasTax ? tplInvoiceShowBankDetails : tplReceiptShowBankDetails,
    cashierName, salespersonName, terminalId,
    counterName: full.posCounterName || currentTerminal?.counterName,
    deliveryAddress: full.shippingAddress || null,
    cashGiven, changeAmount, paymentBlock, depositApplied, balanceDue, shippingCharge,
    customerPhone: resolvedPhone, customerEmail: resolvedEmail,
    customerTrn: resolvedTrn, customerAddress: resolvedAddress,
    creditPreviousBalance, creditInvoiceCredit, creditAmountPaid, creditUpdatedBalance,
    currency: activeCurrency,
  });
  return { html, widthMm };
}

const PDF_NOT_SENT = 'Could not prepare the receipt PDF, so the email was not sent.';

/**
 * Builds the pdfHtml for the completed sale in lastPaidInvoice. Throws (with a message
 * the share dialog shows) whenever the receipt cannot be built, so the caller never
 * sends an email without its attachment.
 *
 * @param {object}   args.lastPaidInvoice     the checkout snapshot (useCheckout)
 * @param {Function} args.fetchInvoice        id => Promise<invoice> — getSalesInvoiceById
 * @param {Function} args.paperForSale        usePosPrinting.paperForSale
 * @param {Function} args.buildInvoiceSheetHtml usePosPrinting.buildInvoiceSheetHtml
 * @param {object}   args.company             company profile (sheet logo fallback)
 * @param {boolean}  args.tplInvoiceShowStamp
 * @param {object}   args.templateSettings    useTemplateSettings.receiptArtifactTemplateSettings
 * @param {object}   args.posContext          { activeCurrency, cashierDisplayName, customerOptions, currentTerminal, currentSession }
 * @param {Function} [args.measureHeightMm]   (html, widthMm) => Promise<number|null>
 * @returns {Promise<string>}
 */
export async function buildPosReceiptPdfHtml({
  lastPaidInvoice,
  fetchInvoice,
  paperForSale,
  buildInvoiceSheetHtml,
  company = null,
  tplInvoiceShowStamp = false,
  templateSettings,
  posContext,
  measureHeightMm = measureHtmlHeightMm,
}) {
  const invoiceId = lastPaidInvoice?.invoice?.id;
  if (!invoiceId) throw new Error('Invoice is not available to email yet.');

  let html;
  try {
    const full = await fetchInvoice(invoiceId);
    if (!full || String(full.id ?? invoiceId) !== String(invoiceId) || !full.invoiceNumber) {
      throw new Error('the saved invoice could not be loaded');
    }

    if (isSheetPaper(paperForSale(full))) {
      // Exactly what Print Receipt prints for a sheet-paper till.
      const t = templateSettings;
      const data = buildPosPrintData(full, t.tplInvoiceFooter, posContext.customerOptions, isTaxInvoiceDocument(full) ? t.tplInvoiceHeader : t.tplReceiptHeader);
      const options = { companyProfile: { companyName: t.tplOutletName, trn: t.effectiveOutletTrn, address: t.tplOutletAddress, phone: t.tplOutletPhone, currency: 'AED', logoUrl: t.tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: t.tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!t.tplStampDataUrl : tplInvoiceShowStamp } };
      html = await buildInvoiceSheetHtml(full, data, options);
    } else {
      const customer = lastPaidInvoice.customer;
      const isWalkIn = !customer || customer.id === 'walk-in';
      const deposit = Number(lastPaidInvoice.depositAmount) || 0;
      const shipping = Number(full.shippingCharge) || 0;
      const receipt = await buildThermalReceiptHtmlForSale({
        templateSettings,
        posContext,
        full,
        cashGiven: lastPaidInvoice.paidAmount ?? null,
        changeAmount: lastPaidInvoice.changeAmount ?? null,
        paymentBlock: lastPaidInvoice.paymentBlock || null,
        customerNameOverride: isWalkIn ? null : customer.name,
        customerPhone: customer?.phone,
        customerEmail: customer?.email,
        customerTrn: customer?.trn,
        customerAddress: customer?.address,
        creditPreviousBalance: lastPaidInvoice.creditPreviousBalance ?? null,
        creditInvoiceCredit: lastPaidInvoice.creditInvoiceCredit ?? null,
        creditAmountPaid: lastPaidInvoice.creditAmountPaid ?? null,
        creditUpdatedBalance: lastPaidInvoice.creditUpdatedBalance ?? null,
        depositApplied: deposit > 0 ? deposit : null,
        balanceDue: deposit > 0 ? Math.max(0, (Number(full.invoiceTotal) || 0) - deposit) : null,
        shippingCharge: shipping > 0 ? shipping : null,
      });
      const heightMm = await measureHeightMm(receipt.html, receipt.widthMm);
      html = fitReceiptHtmlToPaper(receipt.html, { widthMm: receipt.widthMm, heightMm });
    }
  } catch (err) {
    console.warn('POS receipt PDF HTML could not be built', err);
    throw new Error(`${PDF_NOT_SENT} ${err?.message ? `(${err.message})` : ''}`.trim());
  }
  if (typeof html !== 'string' || !html.trim()) throw new Error(PDF_NOT_SENT);
  return html;
}

export default buildPosReceiptPdfHtml;
