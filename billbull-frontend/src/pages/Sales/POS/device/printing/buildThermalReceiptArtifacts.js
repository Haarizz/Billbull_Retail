// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// Receipt ARTIFACT GENERATION: turns a posted/preview invoice into the two artifacts every
// thermal print path needs — the plain-text receipt body and the base64 ESC/POS payload.
//
// This is document generation, NOT print orchestration. It resolves no printer, opens no
// agent connection and dispatches nothing; usePosPrinting owns all of that and consumes
// what this returns.
//
// WHY IT IS NOW A PURE FUNCTION. In POSSales this was a useCallback whose dependency array
// named 83 values, 74 of them template flags. It was a callback only because it closed over
// component state — it mutates nothing, touches no ref, sets no state, and its identity was
// not depended on by any other hook (verified: it appeared in no dependency array). The two
// closure groups are now explicit inputs, so the generation itself is pure and directly
// testable. POSSales keeps a thin useCallback wrapper that injects them, which is why all
// six call sites are unchanged.
//
// PRESERVED VERBATIM: line ordering, column widths, wording, tax and total rendering,
// discount and payment display, QR/barcode behaviour, paper-width quirks, the hasTax
// routing, the Template-1/Template-2 split and the ESC/POS build-failure fallback (which
// still only console.warns and returns a null payload so callers fall back to text/HTML).
import { isTaxInvoiceDocument } from '../../../../../utils/documentTaxType';
import { buildEscPosReceiptBase64 } from '../../../../../utils/escPosReceipt';
import { buildQrContent } from '../../../../../utils/printGenerator';
import { buildPosPrintData, buildThermalReceiptText } from '../../posPrintUtils';
import { getReceiptTemplate } from '../../receiptTemplates';

/**
 * The template-domain values this builder reads. Projected by useTemplateSettings; see
 * RECEIPT_ARTIFACT_TEMPLATE_FIELDS there for the exact list.
 * @typedef {object} ReceiptTemplateSettings
 */

/**
 * The POS-wide (non-template) context this builder reads.
 * @typedef {object} ReceiptPosContext
 * @property {string} activeCurrency
 * @property {string} cashierDisplayName
 * @property {Array}  customerOptions
 * @property {object|null} currentTerminal
 * @property {object|null} currentSession
 */

/**
 * @param {object} args  the per-call invoice/customer/payment data (unchanged from the
 *                       original signature), plus:
 * @param {ReceiptTemplateSettings} args.templateSettings
 * @param {ReceiptPosContext}       args.posContext
 * @returns {Promise<{text: string, escPosBase64: string|null, ...}>}
 */
export async function buildThermalReceiptArtifacts({
  templateSettings,
  posContext,
  full: fullArg,
  isReprint = false,
  cashGiven = null,
  changeAmount = null,
  // Allocation-driven payment block (POS/payments/paymentPresentation) — one row per
  // tender in the order the cashier took them, plus the totals footer. Every renderer
  // prints the same rows from it. Null when reprinting a historical invoice that has
  // no recorded allocations, where the cashGiven fallback still applies.
  paymentBlock = null,
  customerNameOverride = null,
  customerPhone = null,
  customerEmail = null,
  // TRN + address of the selected customer. Neither is persisted on
  // SalesInvoice (it stores only customerCode/customerName), so callers pass
  // them from the live customer object; when they don't, they're resolved
  // below from the loaded customer list by code — see resolvedCustomer*.
  customerTrn = null,
  customerAddress = null,
  creditPreviousBalance = null,
  creditInvoiceCredit = null,
  creditAmountPaid = null,
  creditUpdatedBalance = null,
  cashierNameOverride = null,
  depositApplied = null,
  balanceDue = null,
  shippingCharge = null,
  // Per-call override of the CREDIT ACCOUNT block visibility. Normally the block
  // follows the tplInvoiceShowBankDetails template toggle, but specific workflows
  // pin it: a Delivery Order print (Out for Delivery) hides it (null → suppressed),
  // while a Delivery Settlement print shows it. null = defer to template toggle.
  showCreditBalanceOverride = null,
}) {

  // Named locals so the body below is byte-identical to the original closure version.
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
    tplInvoiceHeader, tplInvoiceHeaderAr, tplInvoicePaper,
    tplInvoiceQrPlacement, tplInvoiceShowBankDetails, tplInvoiceShowCompanyDetails,
    tplInvoiceShowCustomerDetails, tplInvoiceShowGrandTotalBanner, tplInvoiceShowLogo,
    tplInvoiceShowNotes, tplInvoiceShowQRCode, tplInvoiceShowTerms,
    tplInvoiceShowTrn, tplLogoDataUrl, tplOutletAddress,
    tplOutletName, tplOutletPhone, tplReceiptColDiscount,
    tplReceiptFooter, tplReceiptHeader, tplReceiptHeaderAr,
    tplReceiptShowBankDetails, tplReceiptShowBarcode, tplReceiptShowCompanyDetails,
    tplReceiptShowCustomerDetails, tplReceiptShowLogo, tplReceiptShowNotes,
    tplReceiptShowQRCode, tplReceiptShowTerms, tplStampDataUrl,
    receiptTemplateId, effectiveOutletTrn,
  } = templateSettings;
  const {
    activeCurrency, cashierDisplayName, customerOptions,
    currentTerminal, currentSession,
  } = posContext;

    // Customer name (client item 3): the printed receipt must show the SAME
    // customer the checkout preview shows. The preview reads the selected customer
    // object directly (customer.name), while the print path was reading it off the
    // round-tripped backend invoice — which reads "Walk-in Customer" whenever the
    // saved customerName came back blank. When the caller passes the live selected
    // name, override it onto a shallow copy so BOTH the ESC/POS and HTML builders
    // (which read invoice.customerName) print the real customer, not "Walk-in".
    const full = (customerNameOverride && customerNameOverride.trim())
      ? { ...fullArg, customerName: customerNameOverride.trim() }
      : fullArg;
    // Customer contact block (Name / Mobile / Email / TRN / Address): only the
    // code + name round-trip on the invoice, so everything else is read off the
    // loaded customer record. Callers that hold the live `customer` object pass
    // it explicitly; reprints (and any site that doesn't) fall back to this
    // lookup by code so a reprint prints the same block the original sale did.
    // `address` is mapPosCustomer's default *shipping* address (its own
    // preference chain already falls back to billing) — the customer's address
    // on file, distinct from the sale's own DELIVERY ADDRESS section.
    // Falls back to an exact name match when customerCode is blank (seen on some
    // older/edge-case invoices) — only when exactly one loaded customer shares that
    // name, so an ambiguous name never attaches the wrong customer's contact block.
    const custRecForPrint = full.customerCode
      ? customerOptions.find(c => c.code === full.customerCode || c.id === full.customerCode)
      : (() => {
          const name = (full.customerName || '').trim().toLowerCase();
          if (!name || name === 'walk-in customer') return null;
          const matches = customerOptions.filter(c => (c.name || '').trim().toLowerCase() === name);
          return matches.length === 1 ? matches[0] : null;
        })();
    const resolvedCustomerPhone = customerPhone || custRecForPrint?.phone || full.customerPhone || null;
    const resolvedCustomerEmail = customerEmail || custRecForPrint?.email || full.customerEmail || null;
    const resolvedCustomerTrn = customerTrn || custRecForPrint?.trn || full.customerTrn || null;
    const resolvedCustomerAddress = customerAddress || custRecForPrint?.address || full.customerAddress || null;
    // Tax-registered sales keep today's Tax Invoice template untouched; a
    // no-tax sale (e.g. a zero-rated/exempt walk-in) prints the POS Receipt
    // tab's own header/footer/TRN/VAT-summary config instead. Computed here
    // (not hoisted to the caller) because `full` — and therefore its tax
    // total — is only known once the customerName override above is applied.
    // Read BOTH field names: a round-tripped backend invoice carries `taxTotal`
    // (SalesInvoice entity), while a live cart/draft object carries `tax`. Reading
    // only `full.tax` yielded NaN>0=false on every posted invoice, so the real
    // print/reprint always fell back to the POS Receipt tab config regardless of
    // tax — diverging from the checkout preview (which reads currentInvoice.tax)
    // and from buildPosPrintData/the A4 sites (which already read taxTotal).
    const hasTax = isTaxInvoiceDocument(full);
    // Credit/Account Balance toggle is per-sub-tab too (POS Receipt tab's
    // tplReceiptShowBankDetails vs Tax Invoice tab's tplInvoiceShowBankDetails) —
    // same rule as activeShowLogo etc. below. Previously this always read the
    // Tax Invoice tab's toggle even for a no-tax POS Receipt print, so enabling
    // "Credit Balance" on the POS Receipt tab never showed up at checkout/print.
    const resolvedShowCreditBalance = showCreditBalanceOverride != null
      ? showCreditBalanceOverride
      : (hasTax ? tplInvoiceShowBankDetails : tplReceiptShowBankDetails);
    const activeHeader = hasTax ? tplInvoiceHeader : tplReceiptHeader;
    const activeHeaderAr = hasTax ? tplInvoiceHeaderAr : tplReceiptHeaderAr;
    const activeFooter = hasTax ? tplInvoiceFooter : tplReceiptFooter;
    // A no-tax sale never shows TRN/VAT summary, regardless of the (disabled)
    // POS Receipt tab toggle state — these aren't just defaulted off, they're
    // structurally irrelevant once hasTax is false, so force them here rather
    // than trusting whatever tplReceiptShowTrn/tplReceiptColVatAmt happen to hold.
    const activeShowTrn = hasTax ? tplInvoiceShowTrn : false;
    const activeShowVatSummary = hasTax ? tplInvoiceColVatAmt : false;
    const activeShowFooterText = hasTax ? tplInvoiceShowTerms : tplReceiptShowTerms;
    const activeShowLogo = hasTax ? tplInvoiceShowLogo : tplReceiptShowLogo;
    const activeShowCompanyDetails = hasTax ? tplInvoiceShowCompanyDetails : tplReceiptShowCompanyDetails;
    const activeShowCustomerDetails = hasTax ? tplInvoiceShowCustomerDetails : tplReceiptShowCustomerDetails;
    const activeShowQRCode = hasTax ? tplInvoiceShowQRCode : tplReceiptShowQRCode;
    const activeShowPaymentDetails = hasTax ? tplInvoiceColDiscount : tplReceiptColDiscount;
    const activeShowLoyaltyPoints = hasTax ? tplInvoiceShowNotes : tplReceiptShowNotes;
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
          // hasTax:false drops ALL tax content (Taxable/VAT rows, per-line VAT
          // label, Customer TRN, VAT summary) in both the canvas (ESC/POS) and
          // HTML renderers. showTrn/showVatSummary also forced off — see
          // activeShowTrn note above; same rule applies to Template 2's no-tax path.
          hasTax: false,
          showLogo: t2ReceiptShowLogo, showCompanyDetails: t2ReceiptShowCompanyDetails, showTrn: false,
          showArabic: t2ReceiptShowArabic, showCustomerDetails: t2ReceiptShowCustomerDetails,
          showAccountBalance: t2ReceiptShowAccountBalance, showDelivery: t2ReceiptShowDelivery,
          showVatSummary: false, showPaymentDetails: t2ReceiptShowPaymentDetails,
          showLoyalty: t2ReceiptShowLoyalty, showQRCode: t2ReceiptShowQRCode,
          showFooterText: t2ReceiptShowFooterText, showBarcode: t2ReceiptShowBarcode,
        };
    const qrContent = buildQrContent(buildPosPrintData(full, activeFooter), tplOutletName);

    // Only the raw qrContent *string* is needed here — the ESC/POS path has the
    // printer render its own QR natively (GS ( k), so no rasterised QR image is
    // built on this path. (The QR *image* is only meaningful to an HTML renderer;
    // the checkout A4/preview sites build their own via generatePrintHtmlAsync.)
    const escPosOpts = {
      companyName: tplOutletName,
      trn: effectiveOutletTrn,
      header: activeHeader,
      footer: activeFooter,
      showTrn: activeShowTrn,
      isReprint,
      logoDataUrl: tplLogoDataUrl,
      showLogo: activeShowLogo,
      showCompanyDetails: activeShowCompanyDetails,
      outletAddress: tplOutletAddress,
      outletPhone: tplOutletPhone,
      showServiceCharge: tplInvoiceShowGrandTotalBanner,
      showVatSummary: activeShowVatSummary,
      // No-tax sale ⇒ suppress ALL tax content on the ESC/POS (raw thermal) path
      // too, matching the HTML preview and text fallback.
      hasTax,
      showPaymentDetails: activeShowPaymentDetails,
      showQRCode: activeShowQRCode,
      qrContent: activeShowQRCode ? qrContent : null,
      // Social/stamp image + placement — same values the HTML preview below gets,
      // so a merchant-uploaded social image prints (and suppresses the QR) on the
      // ESC/POS path too, honouring the configured before/after-footer placement.
      stampDataUrl: activeShowQRCode ? tplStampDataUrl : null,
      qrPlacement: tplInvoiceQrPlacement,
      showCustomerDetails: activeShowCustomerDetails,
      showFooterText: activeShowFooterText,
      cashierName: cashierNameOverride || cashierDisplayName,
      terminalId: full.posTerminalId || currentTerminal?.terminalId,
      counterName: full.posCounterName || currentTerminal?.counterName,
      // Template 2 (bilingual canvas) reads these extras; Template 1's ESC/POS
      // builder ignores them, so it's safe to always pass them on the shared bag.
      branchName: full.branchName || currentTerminal?.branchName || currentSession?.branchName || '',
      saleType: full.salesType || full.saleType || '',
      showBarcode: tplReceiptShowBarcode !== false,
      showLoyaltyPoints: activeShowLoyaltyPoints,
      deliveryAddress: full.shippingAddress || null,
      cashGiven,
      changeAmount,
      paymentBlock,
      depositApplied,
      balanceDue,
      shippingCharge,
      customerPhone: resolvedCustomerPhone,
      customerEmail: resolvedCustomerEmail,
      customerTrn: resolvedCustomerTrn,
      customerAddress: resolvedCustomerAddress,
      showCreditBalance: resolvedShowCreditBalance,
      creditPreviousBalance,
      creditInvoiceCredit,
      creditAmountPaid,
      creditUpdatedBalance,
      currency: activeCurrency,
    };

    // Template 2 (Arabic/bilingual) carries its OWN independent Show/Hide
    // toggles, now split per sub-tab (activeT2 already resolved above by
    // hasTax). When it's the active template, override the shared opts bag's
    // toggle flags with the activeT2 values so the real checkout print honours
    // the Template 2 designer settings for the sub-tab that applies to THIS
    // invoice — not always the Tax Invoice tab's. These keys are consumed by
    // the bilingual canvas renderer (ESC/POS).
    if (receiptTemplateId === 'billbull-ar') {
      escPosOpts.showLogo = activeT2.showLogo;
      escPosOpts.showCompanyDetails = activeT2.showCompanyDetails;
      escPosOpts.showTrn = activeT2.showTrn;
      escPosOpts.showArabic = activeT2.showArabic;
      escPosOpts.showCustomerDetails = activeT2.showCustomerDetails;
      escPosOpts.showVatSummary = activeT2.showVatSummary;
      escPosOpts.showPaymentDetails = activeT2.showPaymentDetails;
      escPosOpts.showLoyaltyPoints = activeT2.showLoyalty;
      escPosOpts.showDelivery = activeT2.showDelivery;
      escPosOpts.showFooterText = activeT2.showFooterText;
      escPosOpts.showBarcode = activeT2.showBarcode;
      escPosOpts.showQRCode = activeT2.showQRCode;
      escPosOpts.qrContent = activeT2.showQRCode ? qrContent : null;
      escPosOpts.stampDataUrl = activeT2.showQRCode ? tplStampDataUrl : null;
      // Template 2 has its own independent Account Balance toggle — don't AND it
      // with Template 1's (unrelated) resolvedShowCreditBalance, or enabling ONLY
      // the Template 2 toggle (leaving Template 1's off, its default) silently
      // suppresses the section again.
      escPosOpts.showCreditBalance = activeT2.showAccountBalance;
    }
    // documentTitle/documentTitleAr drive Template 2's canvas (ESC/POS) title;
    // Template 1 ignores these keys (it reads `header` instead), so it's safe
    // to always set them on the shared opts bag.
    escPosOpts.documentTitle = activeHeader;
    escPosOpts.documentTitleAr = activeHeaderAr;
    // Whichever template is SAVED in Print Templates (Template 1 "native" vs
    // Template 2 "billbull-ar") drives the actual checkout print — not just the
    // designer's own Test Print. Both builders share the same
    // (paperSize, invoice, opts) signature, so this is a straight swap.
    const activeReceiptTemplate = getReceiptTemplate(receiptTemplateId);
    const buildReceiptEscPosBase64 = activeReceiptTemplate.buildEscPosBase64 || buildEscPosReceiptBase64;
    const escPosPromise = buildReceiptEscPosBase64(tplInvoicePaper, full, escPosOpts).catch((err) => {
      console.warn('ESC/POS receipt build failed, will fall back to text/HTML print', err);
      return null;
    });

    const escPosBase64 = await escPosPromise;

    // NOTE (perf): this builder previously also rendered the full receipt HTML
    // (Template 1 buildThermalReceiptHtml / Template 2 buildTemplate2Html) plus a
    // rasterised QR data-URL purely to feed it. Nothing consumed that `html` — every
    // call site here destructures only { text, escPosBase64 }, and the checkout
    // preview / A4 sites build their own HTML from their own memos. Rendering it on
    // the print critical path was pure dead work on every sale and every reprint, so
    // it is gone. `text` below is still built: it is the real ESC/POS→text/GDI
    // compatibility fallback payload AND the print-job audit payload.
    const text = buildThermalReceiptText(tplInvoicePaper, full, {
      companyName: tplOutletName,
      trn: effectiveOutletTrn,
      documentTitle: activeHeader,
      footer: activeFooter,
      showTrn: activeShowTrn,
      cashierName: cashierNameOverride || cashierDisplayName,
      terminalId: full.posTerminalId || currentTerminal?.terminalId,
      counterName: full.posCounterName || currentTerminal?.counterName,
      cashGiven,
      changeAmount,
      depositApplied,
      balanceDue,
      shippingCharge,
      customerPhone: resolvedCustomerPhone,
      customerEmail: resolvedCustomerEmail,
      customerTrn: resolvedCustomerTrn,
      customerAddress: resolvedCustomerAddress,
      showCustomerDetails: activeShowCustomerDetails,
      // Match the HTML/ESC-POS path: no tax content on a no-tax sale.
      hasTax,
      currency: activeCurrency,
    });
    return { text, escPosBase64 };
}

export default buildThermalReceiptArtifacts;
