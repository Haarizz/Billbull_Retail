import { generateDocumentPrintHtml } from '../../../utils/documentTemplateRenderer';
import { ROBOTO_MONO_FONT_FACE } from '../../../utils/receiptFont';
import { buildFixedWidthLine, resolveLineDiscount, wrapToWidth } from '../../../utils/escPosReceipt';
import { voidedLineNet } from '../../../utils/documentSummaryUtils';

/**
 * Build-time cutover switch for the POS <-> Back Office PrintTemplate unification
 * (Phase 3). Off by default: POS keeps using buildPosA4Template's fabricated
 * in-memory template. Flip VITE_USE_NEW_POS_PRINT_TEMPLATE=true to resolve real,
 * branch-scoped PrintTemplate rows instead — an env flag was chosen over a runtime
 * DB toggle so rollback needs no redeploy of backend state, only a rebuild.
 */
export const USE_NEW_POS_PRINT_TEMPLATE = String(import.meta.env.VITE_USE_NEW_POS_PRINT_TEMPLATE || '').toLowerCase() === 'true';

/**
 * Reconstructs gross (pre-discount) Subtotal / Discount / Taxable Amount from a
 * persisted invoice the same way for every POS print surface. SalesInvoiceService
 * #finalizeInvoiceTotals sums (netAmount − taxAmount) per line into invoice.subTotal,
 * i.e. that field is already the TAXABLE base net of per-item discounts — the entity
 * stores no top-level gross/discount aggregate at all — so Subtotal must be rebuilt
 * from each line's own grossAmount, matching Back Office's summarizeSalesItems.
 */
export const resolveInvoiceGrossTotals = (invoice = {}) => {
  const items = invoice.items || [];
  if (invoice.discountTotal != null) {
    // Caller already computed an explicit discount total (checkout preview's mock
    // invoice, Sales Return receipts) — in that shape invoice.subTotal IS the gross
    // pre-discount amount, so derive the taxable base the old way.
    const subTotal = invoice.subTotal || 0;
    const discountTotal = parseFloat(invoice.discountTotal) || 0;
    const billDiscountTotal = parseFloat(invoice.billDiscountAmount || 0) || 0;
    const netAfterDiscount = subTotal - discountTotal;
    // Under INCLUSIVE VAT, subTotal/discountTotal are tax-laden figures, so
    // (subTotal - discountTotal) is the NET INCLUSIVE amount, not the ex-VAT
    // taxable base — VAT must still be extracted from it (matches the A4
    // invoice's summarizeSalesItems, which always re-derives taxableAmount
    // rather than a flat subtraction). Since taxableAmount + taxTotal always
    // equals netAfterDiscount by definition, subtracting the already-computed
    // taxTotal is exact and mode/rate-agnostic (works even with mixed VAT
    // rates across lines, unlike re-deriving from a single item's rate).
    // EXCLUSIVE mode has no VAT embedded in netAfterDiscount, so the flat
    // subtraction already IS the taxable amount.
    const taxTotalForExtraction = parseFloat(invoice.taxTotal || 0) || 0;
    const taxableAmount = invoice.taxInclusive
      ? Math.max(0, netAfterDiscount - taxTotalForExtraction)
      : netAfterDiscount;
    return {
      subTotal,
      discountTotal,
      lineDiscountTotal: Math.max(0, discountTotal - billDiscountTotal),
      billDiscountTotal,
      taxableAmount,
    };
  }
  const taxableAmount = invoice.subTotal || 0;
  const taxTotal = parseFloat(invoice.taxTotal || 0) || 0;
  const grossSubtotal = items.reduce((sum, it) => {
    if (it.voided || it.isVoided) return sum;
    const qty = it.quantity || 0;
    const unit = parseFloat(it.unitPrice ?? it.price ?? 0);
    const gross = parseFloat(it.grossAmount ?? (qty * unit));
    return sum + (Number.isFinite(gross) ? gross : 0);
  }, 0);
  // Line discount, expressed on the same VAT basis as gross so it matches the
  // Sales Invoice presentation (a "20% off 3,500" line reads as −700, not −636).
  // INCLUSIVE: gross is VAT-laden, so compare against the VAT-laden net
  // (taxable + tax). EXCLUSIVE: gross is ex-VAT, compare against taxable.
  const billDiscountTotal = parseFloat(invoice.billDiscountAmount || 0) || 0;
  const netAfterDiscount = invoice.taxInclusive ? (taxableAmount + taxTotal) : taxableAmount;
  const lineDiscountTotal = Math.max(0, grossSubtotal - netAfterDiscount - billDiscountTotal);
  const discountTotal = lineDiscountTotal + billDiscountTotal;
  const subTotal = grossSubtotal > 0 ? grossSubtotal : taxableAmount;
  return { subTotal, discountTotal, lineDiscountTotal, billDiscountTotal, taxableAmount };
};

export const stripForPreview = (html) => {
  let out = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/(html\s*,\s*\n?\s*body\s*\{[^}]*?)(width\s*:\s*[\d.]+mm)/g, '$1width:100%');
  out = out.replace(/(html\s*,\s*\n?\s*body\s*\{[^}]*?)(min-height\s*:\s*[\d.]+mm)/g, '$1min-height:0');
  out = out.replace(/(\s\.document-shell\s*\{[^}]*?)(width\s*:\s*[\d.]+mm)/g, '$1width:100%');
  out = out.replace(/(\s\.document-shell\s*\{[^}]*?)(min-height\s*:\s*[\d.]+mm)/g, '$1min-height:0');
  out = out.replace(/(\s\.document-footer-group\s*\{[^}]*?)(margin-top\s*:\s*auto)/g, '$1margin-top:16px');
  const reset = `<style id="__pr__">html,body{min-height:0!important;height:auto!important;background:#fff!important}.document-shell{min-height:0!important;height:auto!important}.document-footer-group{margin-top:16px!important}.content-stack{flex:none!important}#footer-push-spacer,#footer-inner-spacer{display:none!important}</style>`;
  return out.replace(/<\/head>/i, reset + '</head>');
};

export const buildDocumentPreviewHtml = (category, { companyName, trn, address, phone, footerNote }, toggles = {}) => {
  const isReturn = category === 'Sales Return';
  const t = toggles;
  const salesDesignerSettings = {
    showLogo:              t.showLogo             !== false,
    showCompanyName:       t.showCompanyDetails    !== false,
    showCompanyAddress:    t.showCompanyDetails    !== false,
    showTRN:               t.showTrn               !== false,
    showCustomerDetails:   t.showCustomerDetails   !== false,
    showBillTo:            t.showCustomerDetails   !== false,
    showTerms:             t.showTerms             !== false && !!footerNote,
    showNotes:             t.showNotes             !== false,
    showBankDetails:       !!t.showBankDetails,
    showQRCode:            !!t.showQRCode,
    showQR:                !!t.showQRCode,
    showCompanyStamp:      !!t.showStamp,
    showStamp:             !!t.showStamp,
    showSignatures:        !!t.showSignature,
    showSignatureStrip:    !!t.showSignature,
    showGrandTotalBanner:  t.showGrandTotalBanner  !== false,
    showSummaryBar:        t.showGrandTotalBanner  !== false,
    showSubtotal:          true,
    showVATTotal:          true,
    showGrandTotal:        true,
    colProductImage:       !!t.colItemImage,
    colBarcode:            !!t.colBarcode,
    colBatchNumber:        t.colBatchNo      !== false,
    colDiscount:           t.colDiscount     !== false,
    colVAT:                t.colVatPct       !== false,
    colVATAmount:          t.colVatAmt       !== false,
    colItemCode:           t.colItemCode     !== false,
    primaryColor:          '#F5C742',
    accentColor:           '#F5C742',
    logoUrl:               t.logoDataUrl  || undefined,
    companyLogoUrl:        t.logoDataUrl  || undefined,
    stampUrl:              t.stampDataUrl || undefined,
    stampImage:            t.stampDataUrl || undefined,
  };
  const columns = JSON.stringify({
    productId:      t.colItemCode     !== false,
    description:    true,
    qty:            true,
    unitPrice:      true,
    taxableAmount:  true,
    barcode:        !!t.colBarcode,
    batchNumber:    t.colBatchNo      !== false,
    discount:       t.colDiscount     !== false,
    taxPercent:     t.colVatPct       !== false,
    tax:            t.colVatAmt       !== false,
    total:          true,
  });
  const displayOptions = JSON.stringify({
    showLogo:            t.showLogo            !== false,
    showCompanyDetails:  t.showCompanyDetails  !== false,
    showCustomerDetails: t.showCustomerDetails !== false,
    showTerms:           t.showTerms           !== false && !!footerNote,
    showBankDetails:     !!t.showBankDetails,
    showQRCode:          !!t.showQRCode,
    primaryColor:        '#F5C742',
    accentColor:         '#F5C742',
    salesDesignerSettings,
  });
  const template = {
    category,
    paperSize: 'A4',
    orientation: 'Portrait',
    termsContent: footerNote || '',
    columns,
    displayOptions,
    salesDesignerSettings,
  };
  const items = isReturn
    ? [{ code: 'SGAL-A55', name: 'Samsung Galaxy A55', desc: '128GB · Black', qty: 1, price: 1380, disc: 0, tax: 5, taxAmt: 69, total: 1449, batchNumber: 'SGAL-120526' }]
    : [
        { code: 'SGAL-A55', name: 'Samsung Galaxy A55', desc: '128GB · Black', qty: 1, price: 1380, disc: 0, tax: 5, taxAmt: 69, total: 1449, batchNumber: 'SGAL-120526' },
        { code: 'IPH-CASE', name: 'iPhone Leather Case', desc: 'Brown · Genuine leather', qty: 2, price: 22.5, disc: 0, tax: 5, taxAmt: 2.25, total: 47.25, batchNumber: '' },
      ];
  const data = {
    title: isReturn ? 'CREDIT NOTE' : 'TAX INVOICE',
    docNo: isReturn ? 'SR-POS-000042' : 'SI-POS-000001',
    date: '22 Jun 2026',
    customer: { name: 'Fatima Hassan', address: 'Dubai, UAE', phone: '+971 50 123 4567' },
    items,
    totals: isReturn
      ? { subTotal: 1380, tax: 69, grandTotal: 1449, discountAmount: 0, billDiscountAmount: 0 }
      : { subTotal: 1425, tax: 71.25, grandTotal: 1496.25, discountAmount: 0, billDiscountAmount: 0 },
    meta: { notes: t.showNotes !== false ? (footerNote || 'Sample note line') : '', paymentTerm: '', dueDate: '', salesPerson: '', location: companyName || '' },
  };
  const options = {
    companyProfile: {
      companyName: companyName || 'Your Company',
      trn: trn || '',
      address: address || '',
      phone: phone || '',
      currency: 'AED',
      logoUrl: t.logoDataUrl || undefined,
      stampUrl: t.stampDataUrl || undefined,
    },
  };
  try { return stripForPreview(generateDocumentPrintHtml(template, data, options)); }
  catch (e) {
    console.warn('A4 preview generation failed:', e);
    return `<html><body style="padding:20px;font-family:Arial,sans-serif;color:#666;text-align:center;padding-top:60px"><p>Preview unavailable</p></body></html>`;
  }
};

export const buildThermalPrintHtml = (paperSize, { companyName, trn, header, footer, showTrn }) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${w} auto}
*{margin:0;padding:0;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${pw};margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;font-weight:600;line-height:1.5;padding:4px 0;color:#000}
.c{text-align:center}.b{font-weight:bold}.d{border-top:2px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between}
</style></head><body>
<div class="c b" style="font-size:13px">${esc(companyName)}</div>
${showTrn ? `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>` : ''}
${header ? `<div class="c" style="font-size:9px;margin:3px 0">${esc(header)}</div>` : ''}
<div class="d"></div>
<div>INV: SI-POS-000001</div><div>22 Jun 2026  10:30 AM</div>
<div>Cust: Fatima Hassan</div>
<div class="d"></div>
<div class="row"><span>Samsung A55 x1</span><span>AED 1,380</span></div>
<div class="row"><span>iPhone Case x2</span><span>AED 45</span></div>
<div class="d"></div>
<div class="row"><span>Subtotal</span><span>AED 1,425</span></div>
<div class="row"><span>VAT 5%</span><span>AED 71.25</span></div>
<div class="row b" style="font-size:13px"><span>TOTAL</span><span>AED 1,496.25</span></div>
<div class="d"></div>
${footer ? `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>` : ''}
</body></html>`;
};

// Encodes UAE FTA ZATCA Phase-1 QR data as base64 TLV (mirrors ZatcaQrGenerator.java).
export const buildZatcaTlvBase64 = (sellerName, trn, isoTimestamp, totalWithVat, vatTotal) => {
  const enc = new TextEncoder();
  const tlvField = (tag, value) => {
    const bytes = enc.encode(String(value || ''));
    return [tag, bytes.length, ...bytes];
  };
  const bytes = new Uint8Array([
    ...tlvField(0x01, sellerName || ''),
    ...tlvField(0x02, trn && trn.trim() ? trn.trim() : 'N/A'),
    ...tlvField(0x03, isoTimestamp || new Date().toISOString()),
    ...tlvField(0x04, parseFloat(totalWithVat || 0).toFixed(2)),
    ...tlvField(0x05, parseFloat(vatTotal || 0).toFixed(2)),
  ]);
  return btoa(String.fromCharCode(...bytes));
};

export const buildThermalReceiptHtml = (paperSize, invoice, {
  companyName, trn, header, footer,
  showTrn = true, isReprint = false, isReturn = false, documentTitle = null,
  zatcaQrDataUrl = null, logoDataUrl = null, footerLogoDataUrl = null,
  stampDataUrl = null,
  showLogo = true, showCompanyDetails = true, showCompanyAddress = true,
  showServiceCharge = false, showVatSummary = true, showPaymentDetails = true,
  showQRCode = true, showCustomerDetails = true,
  showLoyaltyPoints = false, showCreditBalance = false, showFooterText = true,
  outletAddress = '', outletPhone = '',
  cashGiven = null, changeAmount = null,
  // Mixed (cash + card) split — how much was tendered on each tender.
  mixedCashGiven = null, mixedCardGiven = null, mixedCardType = null,
  // Layaway/Hold deposit already collected, shown as a reduction with the remaining
  // balance due, when this sale settles a reserved order (§Layaway conversion).
  depositApplied = null, balanceDue = null,
  // Flat (untaxed) shipping charge shown as its own line before TOTAL. invoice.invoiceTotal
  // is expected to already include it.
  shippingCharge = null,
  cashierName = '', terminalId = '', counterName = '',
  customerPhone = null, customerEmail = null,
  creditPreviousBalance = null, creditInvoiceCredit = null,
  creditAmountPaid = null, creditUpdatedBalance = null,
  // Delivery address (ported from Template 2) — printed as its own section when a
  // shipping address is present on the sale.
  deliveryAddress = null,
  currency = 'AED',
  // QR/stamp/footer-image placement relative to the footer text: 'before' | 'after' (§4).
  qrPlacement = 'before',
}) => {
  // Configured currency code/symbol shown before amounts (§6).
  const cur = currency || 'AED';
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fmtAmt = fmt; // Removed negative override at user request
  // Collapse a multi-line / comma address into one continuous line (§1).
  const oneLineAddress = (addr) => String(addr || '')
    .split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
  const items = invoice.items || [];
  const taxTotal = invoice.taxTotal || 0;
  const grandTotal = invoice.invoiceTotal || 0;
  const { subTotal, discountTotal, taxableAmount } = resolveInvoiceGrossTotals(invoice);
  const payMode = invoice.paymentMode || '';
  const invDate = invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const invTime = invoice.createdAt ? new Date(invoice.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
  const customerName = invoice.customerName || 'Walk-in Customer';
  // Cashier = logged-in user (§2A); falls back to audit createdBy. NOT the counter name.
  const cashier = cashierName || invoice.createdBy || '';
  const terminal = terminalId || invoice.posTerminalId || '';
  const counter = counterName || invoice.posCounterName || '';
  const D = `<div class="d"></div>`;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${w} auto}
*{margin:0;padding:0;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${pw};margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;font-weight:600;line-height:1.5;padding:4px 0;color:#000}
.c{text-align:center}.b{font-weight:bold}.d{border-top:2px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.row .lbl{flex:0 0 auto;white-space:nowrap}
.row .val{flex:1;min-width:0;text-align:right;word-break:break-word;overflow-wrap:anywhere}
.row .num{flex:1;min-width:0;text-align:right;white-space:nowrap}
.s{font-size:9px;text-transform:uppercase;color:#000;margin:3px 0 1px;letter-spacing:.08em}
</style></head><body>`;

  // ── Header (§1): logo, title, company name, single-line address, phone, TRN ──
  if (showLogo && logoDataUrl) {
    html += `<div class="c" style="margin:4px 0 6px"><img src="${logoDataUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`;
  }
  html += `<div class="c b" style="font-size:10px;margin-bottom:2px">${esc(documentTitle || (isReturn ? 'CREDIT NOTE' : 'TAX INVOICE'))}</div>`;
  if (header) html += `<div class="c" style="font-size:9px;margin:2px 0">${esc(header)}</div>`;
  html += `<div class="c b" style="font-size:13px">${esc(companyName)}</div>`;
  if (showCompanyDetails && showCompanyAddress) {
    const addrLine = oneLineAddress(outletAddress);
    if (addrLine) html += `<div class="c" style="font-size:9px">${esc(addrLine)}</div>`;
    if (outletPhone) html += `<div class="c" style="font-size:9px">Tel: ${esc(outletPhone)}</div>`;
  }
  if (showTrn && trn) html += `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>`;
  if (isReprint) html += `<div class="c b" style="font-size:9px;margin:2px 0">*** COPY / REPRINT ***</div>`;

  // ── Invoice info (§2): Invoice No, Date, Cashier, Terminal ID, Counter ──
  html += D;
  html += `<div class="row"><span class="lbl">Invoice No:</span><span class="num">${esc(invoice.invoiceNumber || '')}</span></div>`;
  html += `<div class="row"><span class="lbl">Date:</span><span class="num">${esc(invDate)}${invTime ? '  ' + esc(invTime) : ''}</span></div>`;
  if (cashier) html += `<div class="row"><span class="lbl">Cashier:</span><span class="val">${esc(cashier)}</span></div>`;
  if (terminal) html += `<div class="row"><span class="lbl">Terminal ID:</span><span class="num">${esc(terminal)}</span></div>`;
  if (counter) html += `<div class="row"><span class="lbl">Counter:</span><span class="num">${esc(counter)}</span></div>`;
  // Sale Type (ported from Template 2) — retail / delivery / etc. when present.
  const saleType = invoice.salesType || invoice.saleType || '';
  if (saleType) html += `<div class="row"><span class="lbl">Sale Type:</span><span class="val">${esc(saleType)}</span></div>`;
  html += D;

  // ── Line items (§5): "Qty x Name" on row 1, then "@ unit  =  line total" on
  // row 2 so unit price is always visible (was: qty×name + total only). When a
  // line discount applies (BBQA-5.3-015), show the actual/base unit price, the
  // discount %/amount, and the net (discounted) unit price as separate rows so
  // the discounted price never gets reprinted as if it were the base price. ──
  // Voided lines are kept on the receipt (audit trail) but shown with a [VOID]
  // tag + negative amounts and a muted red colour — no strike-through, which
  // reads poorly on thermal paper. They are excluded from the total; the
  // "Voided Items" row below discloses what was voided.
  let voidedLineTotal = 0;
  let voidedLineCount = 0;
  items.forEach(it => {
    const isVoid = !!it.voided || !!it.isVoided;
    const qty = it.quantity || 0;
    const unit = parseFloat(it.unitPrice || it.price || 0);
    const total = it.netAmount || it.lineTotal || (qty * unit);
    if (isVoid) { voidedLineTotal += parseFloat(total) || 0; voidedLineCount += 1; }
    // Amounts render with a leading "-" for voided lines (informational).
    const sgn = (text) => (isVoid ? `- ${text}` : text);
    const discountPercent = parseFloat(it.discountPercent ?? it.discount ?? 0) || 0;
    const grossAmount = parseFloat(it.grossAmount ?? (qty * unit)) || 0;
    // gross × discount% (backend basis), NOT gross − net which understates the
    // discount by the VAT-on-discount portion in exclusive mode. See resolveLineDiscount.
    const lineDiscountAmount = resolveLineDiscount(it, grossAmount, discountPercent, total);
    const netUnit = qty > 0 ? total / qty : unit;
    const batch = it.batchNumber || it.pinnedBatchNumber || '';
    const serial = it.serialNumber || '';
    const desc = it.description || '';
    const sku = it.sku || it.itemCode || '';
    const nameDisplay = `${qty}x ${esc(it.itemName || it.productName || it.name || '')}${isVoid ? ' [VOID]' : ''}`;
    const nameStyle = isVoid ? 'text-align:left; color:#dc2626;' : 'text-align:left;';
    const amtColor = isVoid ? '#dc2626' : '#000';

    // Row 1: quantity × product name (name wraps if long).
    html += `<div class="row"><span class="val b" style="${nameStyle}">${nameDisplay}</span></div>`;
    if (lineDiscountAmount > 0) {
      // Discounted line: base price, discount detail, and net (discounted) total each on their own row.
      html += `<div class="row"><span class="lbl" style="font-size:10px;color:${amtColor};padding-left:8px">Price @ ${cur} ${fmt(unit)}</span><span class="num" style="font-size:10px;color:${amtColor}">${sgn(`${cur} ${fmtAmt(grossAmount)}`)}</span></div>`;
      html += `<div class="row"><span class="lbl" style="font-size:10px;color:${amtColor};padding-left:8px">Discount${discountPercent > 0 ? ` (${fmt(discountPercent)}%)` : ''}</span><span class="num" style="font-size:10px;color:${amtColor}">- ${cur} ${fmt(lineDiscountAmount)}</span></div>`;
      html += `<div class="row"><span class="lbl" style="padding-left:8px${isVoid ? `;color:${amtColor}` : ''}">Net @ ${cur} ${fmt(netUnit)}</span><span class="num"${isVoid ? ` style="color:${amtColor}"` : ''}>${sgn(`${cur} ${fmtAmt(total)}`)}</span></div>`;
    } else {
      // Row 2: unit price → line total, right-aligned and aligned with the total column.
      html += `<div class="row"><span class="lbl" style="font-size:10px;color:${amtColor};padding-left:8px">@ ${cur} ${fmt(unit)}</span><span class="num"${isVoid ? ` style="color:${amtColor}"` : ''}>${sgn(`${cur} ${fmtAmt(total)}`)}</span></div>`;
    }
    const vatRate = parseFloat(it.taxPercent ?? it.taxRate ?? it.vatPercent ?? NaN);
    if (Number.isFinite(vatRate)) html += `<div style="font-size:10px;color:${amtColor};padding-left:8px">VAT: ${fmt(vatRate)}%</div>`;
    if (sku) html += `<div style="font-size:10px;color:${amtColor};padding-left:8px">SKU: ${esc(sku)}</div>`;
    if (desc) html += `<div style="font-size:10px;color:${amtColor};padding-left:8px">${esc(desc)}</div>`;
    if (serial) html += `<div style="font-size:10px;color:${amtColor};padding-left:8px">S/N: ${esc(serial)}</div>`;
    else if (batch) html += `<div style="font-size:10px;color:${amtColor};padding-left:8px">Batch: ${esc(batch)}</div>`;
  });
  html += D;

  // ── Totals (§3): Subtotal, Discount (if any), VAT (no hardcoded %), TOTAL ──
  html += `<div class="row"><span class="lbl">Subtotal:</span><span class="num">${cur} ${fmtAmt(subTotal)}</span></div>`;
  if (discountTotal > 0) {
    html += `<div class="row"><span class="lbl">Discount:</span><span class="num">${cur} ${fmtAmt(discountTotal)}</span></div>`;
    html += `<div class="row"><span class="lbl">Taxable Amount:</span><span class="num">${cur} ${fmtAmt(taxableAmount)}</span></div>`;
  }
  if (showServiceCharge && invoice.serviceChargeAmount) html += `<div class="row"><span class="lbl">Service Charge:</span><span class="num">${cur} ${fmtAmt(invoice.serviceChargeAmount)}</span></div>`;
  if (showVatSummary) html += `<div class="row"><span class="lbl">VAT${invoice.taxInclusive ? ' (incl.)' : ''}:</span><span class="num">${cur} ${fmtAmt(taxTotal)}</span></div>`;
  // Delivery + shipping are flat charges already folded into invoiceTotal; surface them
  // as their own lines so the total always ties out on the printed invoice.
  if (parseFloat(invoice.deliveryCharge || 0) > 0) html += `<div class="row"><span class="lbl">Delivery Charge:</span><span class="num">${cur} ${fmtAmt(invoice.deliveryCharge)}</span></div>`;
  if (shippingCharge != null && parseFloat(shippingCharge) > 0) html += `<div class="row"><span class="lbl">Shipping:</span><span class="num">${cur} ${fmtAmt(shippingCharge)}</span></div>`;
  const roundOffAmt = parseFloat(invoice.roundOff ?? invoice.roundOffAmount ?? 0) || 0;
  if (Math.abs(roundOffAmt) >= 0.005) html += `<div class="row"><span class="lbl">Round Off:</span><span class="num">${cur} ${fmtAmt(roundOffAmt)}</span></div>`;
  // Informational disclosure of voided lines — excluded from TOTAL, shown only
  // when at least one line was voided.
  if (voidedLineCount > 0) {
    html += `<div class="row" style="color:#dc2626"><span class="lbl">Voided Items (${voidedLineCount}):</span><span class="num">- ${cur} ${fmtAmt(voidedLineTotal)}</span></div>`;
  }
  html += D;
  html += `<div class="row b" style="font-size:13px"><span>TOTAL:</span><span class="num">${cur} ${fmtAmt(grandTotal)}</span></div>`;
  // Layaway/Hold deposit already paid → show it as a reduction with the balance due.
  if (depositApplied != null && parseFloat(depositApplied) > 0) {
    const bal = balanceDue != null ? parseFloat(balanceDue) : (parseFloat(grandTotal) - parseFloat(depositApplied));
    html += `<div class="row"><span class="lbl">Deposit Paid:</span><span class="num">- ${cur} ${fmt(depositApplied)}</span></div>`;
    html += `<div class="row b"><span>Balance Due:</span><span class="num">${cur} ${fmt(Math.max(0, bal))}</span></div>`;
  }
  html += D;

  // ── Payment details (§4): mode, cash received, change (only when change > 0) ──
  if (showPaymentDetails) {
    if (payMode) html += `<div class="row"><span class="lbl">${isReturn ? 'Refund Method:' : 'Payment Mode:'}</span><span class="val">${esc(payMode)}</span></div>`;
    // Mixed (cash + card) split — surface each tender's portion so the receipt
    // reconciles with the drawer + card batch. Otherwise fall back to Cash Received.
    const hasMixedSplit = (mixedCashGiven != null && parseFloat(mixedCashGiven) > 0) ||
      (mixedCardGiven != null && parseFloat(mixedCardGiven) > 0);
    if (hasMixedSplit) {
      if (parseFloat(mixedCashGiven) > 0) html += `<div class="row"><span class="lbl">Cash Paid:</span><span class="num">${cur} ${fmt(mixedCashGiven)}</span></div>`;
      if (parseFloat(mixedCardGiven) > 0) html += `<div class="row"><span class="lbl">Card Paid${mixedCardType ? ` (${esc(mixedCardType)})` : ''}:</span><span class="num">${cur} ${fmt(mixedCardGiven)}</span></div>`;
    } else if (cashGiven != null && parseFloat(cashGiven) > 0) {
      html += `<div class="row"><span class="lbl">Cash Received:</span><span class="num">${cur} ${fmt(cashGiven)}</span></div>`;
    }
    if (changeAmount != null && parseFloat(changeAmount) > 0) html += `<div class="row"><span class="lbl">Change Returned:</span><span class="num">${cur} ${fmt(changeAmount)}</span></div>`;
    if (payMode || hasMixedSplit || (cashGiven != null && parseFloat(cashGiven) > 0)) html += D;
  }

  // ── QR / Stamp / footer image (§4+§5) ──
  // Build the block once; placement (before/after footer text) is applied later
  // via qrPlacement. Stamp uploaded → show stamp ONLY and hide QR; else real QR.
  let qrStampHtml = '';
  if (stampDataUrl) {
    qrStampHtml += `<div class="c" style="margin:6px 0"><img src="${stampDataUrl}" style="height:80px;max-width:70%;object-fit:contain;display:block;margin:0 auto" alt="Stamp" /></div>`;
    if (footerLogoDataUrl) qrStampHtml += `<div class="c" style="margin:4px 0"><img src="${footerLogoDataUrl}" style="height:48px;max-width:70%;object-fit:contain;display:block;margin:0 auto" /></div>`;
    qrStampHtml += D;
  } else if (showQRCode && zatcaQrDataUrl) {
    qrStampHtml += `<div class="c" style="margin:6px 0"><img src="${zatcaQrDataUrl}" style="width:80px;height:80px" alt="ZATCA QR" /><div style="font-size:8px;color:#000;margin-top:2px">Scan to verify</div></div>`;
    if (footerLogoDataUrl) qrStampHtml += `<div class="c" style="margin:4px 0"><img src="${footerLogoDataUrl}" style="height:48px;max-width:70%;object-fit:contain;display:block;margin:0 auto" /></div>`;
    qrStampHtml += D;
  } else if (footerLogoDataUrl) {
    qrStampHtml += `<div class="c" style="margin:4px 0"><img src="${footerLogoDataUrl}" style="height:48px;max-width:70%;object-fit:contain;display:block;margin:0 auto" /></div>`;
    qrStampHtml += D;
  }
  // ── Customer (§6): label fixed-width, name/email wrap gracefully within width ──
  // Gated on the toggle alone (matches the settings preview) — a walk-in sale still
  // prints "Walk-in Customer" as the name when the merchant has this section enabled,
  // rather than silently dropping the whole block regardless of the toggle state.
  if (showCustomerDetails) {
    const custPhone = customerPhone || invoice.customerPhone || '';
    const custEmail = customerEmail || invoice.customerEmail || '';
    html += `<div class="s">CUSTOMER</div>`;
    html += `<div class="row"><span class="lbl">Name:</span><span class="val">${esc(customerName)}</span></div>`;
    if (custPhone) html += `<div class="row"><span class="lbl">Mobile:</span><span class="num">${esc(custPhone)}</span></div>`;
    if (custEmail) html += `<div class="row"><span class="lbl">Email:</span><span class="val">${esc(custEmail)}</span></div>`;
    // Customer Code (ported from Template 2) — skip the walk-in sentinel.
    // Use .val (wraps) not .num (white-space:nowrap) so a long code/name wraps
    // within the paper width instead of overflowing off the right edge.
    const custCode = invoice.customerCode && invoice.customerCode !== 'WALK-IN' ? invoice.customerCode : '';
    if (custCode) html += `<div class="row"><span class="lbl">Customer Code:</span><span class="val">${esc(custCode)}</span></div>`;
    html += D;
  }

  // ── Delivery address (ported from Template 2) — collapsed to one line, wrapped
  // within the paper width. Only shown when a shipping address exists on the sale.
  const deliveryAddr = oneLineAddress(deliveryAddress || invoice.shippingAddress || '');
  if (deliveryAddr) {
    html += `<div class="s">DELIVERY ADDRESS</div>`;
    html += `<div style="word-break:break-word;overflow-wrap:anywhere">${esc(deliveryAddr)}</div>`;
    html += D;
  }

  if (showLoyaltyPoints && invoice.loyaltyPointsEarned != null) {
    html += `<div class="s">LOYALTY POINTS</div>`;
    if (invoice.loyaltyPointsEarned) html += `<div class="row"><span class="lbl">Points Earned:</span><span class="num">+ ${invoice.loyaltyPointsEarned} pts</span></div>`;
    if (invoice.loyaltyPointsUsed) html += `<div class="row"><span class="lbl">Points Used:</span><span class="num">${invoice.loyaltyPointsUsed} pts</span></div>`;
    if (invoice.loyaltyBalance != null) html += `<div class="row"><span class="lbl">Remaining Balance:</span><span class="num">${invoice.loyaltyBalance} pts</span></div>`;
    html += D;
  }

  // ── Credit account (§7): mandatory 4-field structure when a credit account exists ──
  // Invoice Credit = this invoice's amount (the receivable it adds to the account);
  // Amount Paid = what was actually collected against it right now. The same formula
  // holds for every payment mode: a fully-settled cash/card/online sale nets Invoice
  // Credit − Amount Paid to 0 (balance unchanged), while an unpaid/partially-paid
  // Credit sale carries the remainder forward — see POSSales.jsx checkout.
  if (showCreditBalance && creditPreviousBalance != null) {
    const invCredit  = creditInvoiceCredit != null ? creditInvoiceCredit : grandTotal;
    const amtPaid    = creditAmountPaid    != null ? creditAmountPaid    : 0;
    const updatedBal = creditUpdatedBalance != null
      ? creditUpdatedBalance
      : (parseFloat(creditPreviousBalance) + parseFloat(invCredit) - parseFloat(amtPaid));
    html += `<div class="s">CREDIT ACCOUNT</div>`;
    html += `<div class="row"><span class="lbl">Previous Balance:</span><span class="num">${cur} ${fmt(creditPreviousBalance)}</span></div>`;
    html += `<div class="row"><span class="lbl">Invoice Credit:</span><span class="num">${cur} ${fmt(invCredit)}</span></div>`;
    html += `<div class="row"><span class="lbl">Amount Paid:</span><span class="num">${cur} ${fmt(amtPaid)}</span></div>`;
    html += `<div class="row"><span class="lbl">Updated Balance:</span><span class="num">${cur} ${fmt(updatedBal)}</span></div>`;
    html += D;
  }

  // 'before' (default): QR/stamp renders immediately above the footer text.
  if (qrPlacement !== 'after') html += qrStampHtml;

  if (showFooterText && footer) {
    html += `<div class="c" style="font-size:9px;margin-top:4px;white-space:pre-line">${esc(footer)}</div>`;
  }

  // 'after': QR/stamp renders below the footer text.
  if (qrPlacement === 'after') { html += D; html += qrStampHtml; }

  html += '</body></html>';
  return html;
};

// Thermal (58mm/80mm) credit-note receipt for Sales Return. Independent of
// buildThermalReceiptHtml (POS tax-invoice shape) since a return doc carries
// different fields (returnNumber, linkedInvoice, per-line discount/tax already
// resolved by SalesReturn.jsx) rather than a POS invoice/session object.
export const buildSalesReturnThermalHtml = (paperSize, ret, {
  companyName, trn, header, footer,
  showTrn = true, showLogo = true, showCompanyDetails = true,
  showCompanyAddress = true, showCustomerDetails = true, showFooterText = true,
  logoDataUrl = null, stampDataUrl = null,
  outletAddress = '', outletPhone = '',
  currency = 'AED',
  // Extended toggles (parity with buildThermalReceiptHtml / POSConsole settings)
  showServiceCharge = true, showVatSummary = true, showPaymentDetails = true,
  showQRCode = false, zatcaQrDataUrl = null, qrPlacement = 'before',
  showStamp = true, showSignature = false,
}) => {
  const cur = currency || 'AED';
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const oneLineAddress = (addr) => String(addr || '')
    .split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
  const items = ret.items || [];
  const subTotal = items.reduce((s, i) => s + Number(i.price) * Number(i.returnQty), 0);
  const discountTotal = items.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0);
  const taxTotal = Number(ret.taxAmount) || items.reduce((s, i) => s + (Number(i.taxAmount) || 0), 0);
  const grandTotal = Number(ret.totalAmount) || (subTotal - discountTotal + taxTotal);
  const retDate = ret.returnDate ? new Date(ret.returnDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const customerName = ret.customerName || '';
  const D = `<div class="d"></div>`;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${w} auto}
*{margin:0;padding:0;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${pw};max-width:${pw};overflow-x:hidden;margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;font-weight:600;line-height:1.5;padding:4px 0;color:#000;filter:contrast(1.35)}
.c{text-align:center}.b{font-weight:bold}.d{border-top:2px dashed #444;margin:4px 0}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.row .lbl{flex:0 0 auto;white-space:nowrap}
.row .val{flex:1;min-width:0;text-align:right;word-break:break-word;overflow-wrap:anywhere}
.row .num{flex:1;min-width:0;text-align:right;white-space:nowrap}
.s{font-size:9px;text-transform:uppercase;color:#000;margin:3px 0 1px;letter-spacing:.08em}
</style></head><body>`;

  if (showLogo && logoDataUrl) {
    html += `<div class="c" style="margin:4px 0 6px"><img src="${logoDataUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`;
  }
  html += `<div class="c b" style="font-size:10px;margin-bottom:2px">CREDIT NOTE</div>`;
  if (header) html += `<div class="c" style="font-size:9px;margin:2px 0">${esc(header)}</div>`;
  html += `<div class="c b" style="font-size:13px">${esc(companyName)}</div>`;
  if (showCompanyDetails && showCompanyAddress) {
    const addrLine = oneLineAddress(outletAddress);
    if (addrLine) html += `<div class="c" style="font-size:9px">${esc(addrLine)}</div>`;
    if (outletPhone) html += `<div class="c" style="font-size:9px">Tel: ${esc(outletPhone)}</div>`;
  }
  if (showTrn && trn) html += `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>`;

  html += D;
  html += `<div class="row"><span class="lbl">Credit Note No:</span><span class="num">${esc(ret.returnNumber || '')}</span></div>`;
  html += `<div class="row"><span class="lbl">Date:</span><span class="num">${esc(retDate)}</span></div>`;
  if (ret.linkedInvoice) html += `<div class="row"><span class="lbl">Original Invoice:</span><span class="num">${esc(ret.linkedInvoice)}</span></div>`;
  if (ret.reason) html += `<div class="row"><span class="lbl">Reason:</span><span class="val">${esc(ret.reason)}</span></div>`;
  html += D;

  items.forEach(it => {
    const qty = Number(it.returnQty) || 0;
    const unit = Number(it.price) || 0;
    const lineDiscount = Number(it.discountAmount) || 0;
    const lineTax = Number(it.taxAmount) || 0;
    const total = Number(it.total) || (qty * unit - lineDiscount + lineTax);
    const nameDisplay = `${qty}x ${esc(it.itemName || it.itemCode || '')}`;

    html += `<div class="row"><span class="val b" style="text-align:left;">${nameDisplay}</span></div>`;
    html += `<div class="row"><span class="lbl" style="font-size:10px;color:#000;padding-left:8px">@ ${cur} ${fmt(unit)}</span><span class="num">${cur} ${fmt(total)}</span></div>`;
    if (it.itemCode) html += `<div style="font-size:10px;color:#000;padding-left:8px">SKU: ${esc(it.itemCode)}</div>`;
    if (lineDiscount > 0) html += `<div class="row" style="font-size:10px;color:#000;padding-left:8px"><span class="lbl">Discount:</span><span class="num">- ${cur} ${fmt(lineDiscount)}</span></div>`;
    if (lineTax > 0) html += `<div class="row" style="font-size:10px;color:#000;padding-left:8px"><span class="lbl">VAT${it.taxRate ? ` (${it.taxRate}%)` : ''}:</span><span class="num">${cur} ${fmt(lineTax)}</span></div>`;
  });
  html += D;

  html += `<div class="row"><span class="lbl">Subtotal:</span><span class="num">${cur} ${fmt(subTotal)}</span></div>`;
  if (discountTotal > 0) html += `<div class="row"><span class="lbl">Discount:</span><span class="num">- ${cur} ${fmt(discountTotal)}</span></div>`;
  if (showVatSummary) html += `<div class="row"><span class="lbl">VAT:</span><span class="num">${cur} ${fmt(taxTotal)}</span></div>`;
  html += D;
  if (showServiceCharge) {
    html += `<div class="row b" style="font-size:13px"><span>CREDIT TOTAL:</span><span class="num">${cur} ${fmt(grandTotal)}</span></div>`;
    html += D;
  }

  // Refund method
  if (showPaymentDetails && ret.refundMethod) {
    html += `<div class="row"><span class="lbl">Refund Method:</span><span class="val">${esc(ret.refundMethod)}</span></div>`;
    html += D;
  }

  if (showStamp && stampDataUrl) {
    html += `<div class="c" style="margin:6px 0"><img src="${stampDataUrl}" style="height:80px;max-width:70%;object-fit:contain;display:block;margin:0 auto" alt="Stamp" /></div>`;
    html += D;
  }

  if (showCustomerDetails && customerName) {
    html += `<div class="s">CUSTOMER</div>`;
    html += `<div class="row"><span class="lbl">Name:</span><span class="val">${esc(customerName)}</span></div>`;
    html += D;
  }

  if (showSignature) {
    html += `<div style="margin:12px 0 4px"><div class="s">Authorized Signature</div><div style="border-bottom:1px solid #000;width:60%;margin:18px auto 2px"></div></div>`;
    html += D;
  }

  // QR code — immediately above the footer text
  if (showQRCode && zatcaQrDataUrl && qrPlacement !== 'after') {
    html += `<div class="c" style="margin:6px 0"><img src="${zatcaQrDataUrl}" style="height:100px;max-width:70%;object-fit:contain;display:block;margin:0 auto" /></div>`;
    html += D;
  }

  if (showFooterText && footer) {
    html += `<div class="c" style="font-size:9px;margin-top:4px;white-space:pre-line">${esc(footer)}</div>`;
  }

  // QR code — immediately below the footer text
  if (showQRCode && zatcaQrDataUrl && qrPlacement === 'after') {
    html += `<div class="c" style="margin:6px 0"><img src="${zatcaQrDataUrl}" style="height:100px;max-width:70%;object-fit:contain;display:block;margin:0 auto" /></div>`;
  }

  html += '</body></html>';
  return html;
};

export const buildThermalReceiptText = (paperSize, invoice, {
  companyName, trn, header, footer,
  showTrn = true,
  documentTitle = null,
  cashierName = '',
  terminalId = '',
  counterName = '',
  cashGiven = null,
  changeAmount = null,
  depositApplied = null,
  balanceDue = null,
  shippingCharge = null,
  currency = 'AED',
  customerPhone = null,
  customerEmail = null,
  showCustomerDetails = true,
} = {}) => {
  const width = String(paperSize || '').includes('58') ? 32 : 42;
  const hr = '-'.repeat(width);
  const fmt = (n) => {
    const v = parseFloat(n) || 0;
    return `${currency} ${v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const lines = [];
  // Center each embedded line separately — multi-line values (e.g. a footer
  // with \n) used to be padded once for the whole string, leaving every line
  // after the first left-shifted.
  const pushCentered = (value = '') => {
    String(value).split('\n').forEach((text) => {
      if (!text) return;
      const pad = Math.max(0, Math.floor((width - text.length) / 2));
      lines.push(`${' '.repeat(pad)}${text}`.slice(0, width));
    });
  };

  pushCentered(companyName || 'BillBull');
  if (showTrn && trn) pushCentered(`TRN: ${trn}`);
  if (header) pushCentered(header);
  lines.push(hr);
  pushCentered(documentTitle || 'TAX INVOICE');
  lines.push(buildFixedWidthLine('Invoice', invoice.invoiceNumber || invoice.id || '', width));
  if (invoice.createdAt || invoice.invoiceDate) {
    // invoiceDate is date-only (no time component) — parsing it as a Date and
    // calling toLocaleString would show a fabricated UTC-midnight time shifted
    // by the viewer's UTC offset. Only show a time when createdAt (the real
    // sale timestamp) is available.
    if (invoice.createdAt) {
      lines.push(buildFixedWidthLine('Date', new Date(invoice.createdAt).toLocaleString('en-GB'), width));
    } else {
      lines.push(buildFixedWidthLine('Date', new Date(invoice.invoiceDate).toLocaleDateString('en-GB'), width));
    }
  }
  if (cashierName) lines.push(buildFixedWidthLine('Cashier', cashierName, width));
  if (terminalId) lines.push(buildFixedWidthLine('Terminal', terminalId, width));
  if (counterName) lines.push(buildFixedWidthLine('Counter', counterName, width));
  lines.push(hr);
  if (showCustomerDetails) {
    lines.push(`Customer: ${invoice.customerName || 'Walk-in Customer'}`);
    if (customerPhone) lines.push(`Mobile: ${customerPhone}`);
    if (customerEmail) lines.push(`Email: ${customerEmail}`);
    lines.push(hr);
  }

  // Voided lines are kept on the receipt (audit trail) with a [VOID] tag +
  // negative amounts, but excluded from the total. Tally for the Voided Items row.
  let voidedTextTotal = 0;
  let voidedTextCount = 0;
  (invoice.items || []).forEach((item) => {
    const isVoid = Boolean(item.voided || item.isVoided);
    const sgn = (text) => (isVoid ? `- ${text}` : text);
    const qty = item.quantity || 0;
    const name = item.itemName || item.productName || item.name || 'Item';
    const unitPrice = parseFloat(item.unitPrice ?? item.price ?? 0);
    const lineTotal = parseFloat(item.netAmount ?? item.lineTotal ?? (qty * unitPrice));
    if (isVoid) { voidedTextTotal += Number.isFinite(lineTotal) ? lineTotal : 0; voidedTextCount += 1; }
    // Same per-line discount breakdown as the HTML preview / ESC/POS builder
    // (BBQA-5.3-015) so the text fallback matches the checkout preview too.
    const discountPercent = parseFloat(item.discountPercent ?? item.discount ?? 0) || 0;
    const grossAmount = parseFloat(item.grossAmount ?? (qty * unitPrice)) || 0;
    // gross × discount% (backend basis) — NOT gross − net, which understates the
    // discount by the VAT-on-discount portion in exclusive mode. See resolveLineDiscount.
    const lineDiscountAmount = resolveLineDiscount(item, grossAmount, discountPercent, lineTotal);
    const netUnit = qty > 0 ? lineTotal / qty : unitPrice;
    lines.push(`${qty}x ${name}${isVoid ? ' [VOID]' : ''}`.slice(0, width));
    if (lineDiscountAmount > 0) {
      lines.push(buildFixedWidthLine(`Price @ ${fmt(unitPrice)}`, sgn(fmt(grossAmount)), width));
      lines.push(buildFixedWidthLine(`Discount${discountPercent > 0 ? ` (${discountPercent.toFixed(2)}%)` : ''}`, `- ${fmt(lineDiscountAmount)}`, width));
      lines.push(buildFixedWidthLine(`Net @ ${fmt(netUnit)}`, sgn(fmt(lineTotal)), width));
    } else {
      lines.push(buildFixedWidthLine(`@ ${fmt(unitPrice)}`, sgn(fmt(lineTotal)), width));
    }
    const sku = item.sku || item.itemCode || '';
    if (sku) lines.push(`SKU: ${sku}`.slice(0, width));
    const serial = item.serialNumber || '';
    const batch = item.batchNumber || item.pinnedBatchNumber || '';
    if (serial) lines.push(`S/N: ${serial}`.slice(0, width));
    else if (batch) lines.push(`Batch: ${batch}`.slice(0, width));
  });

  lines.push(hr);
  // Single source of truth for Subtotal / Discount / Taxable (gross-basis,
  // VAT-mode aware) — same as the HTML thermal + A4 renderers so all three tie
  // out identically to the Sales Invoice.
  const {
    subTotal: resolvedSubTotal,
    discountTotal: resolvedDiscountTotal,
    taxableAmount: resolvedTaxableAmount,
  } = resolveInvoiceGrossTotals(invoice);
  lines.push(buildFixedWidthLine('Subtotal', fmt(resolvedSubTotal), width));
  if (resolvedDiscountTotal > 0) {
    lines.push(buildFixedWidthLine('Discount', fmt(resolvedDiscountTotal), width));
    lines.push(buildFixedWidthLine('Taxable Amount', fmt(resolvedTaxableAmount), width));
  }
  lines.push(buildFixedWidthLine(invoice.taxInclusive ? 'VAT (incl.)' : 'VAT', fmt(invoice.taxTotal), width));
  if (parseFloat(invoice.deliveryCharge || 0) > 0) {
    lines.push(buildFixedWidthLine('Delivery Charge', fmt(invoice.deliveryCharge), width));
  }
  if (shippingCharge != null && parseFloat(shippingCharge) > 0) {
    lines.push(buildFixedWidthLine('Shipping', fmt(shippingCharge), width));
  }
  // Informational disclosure of voided lines — excluded from TOTAL, shown only
  // when at least one line was voided.
  if (voidedTextCount > 0) {
    lines.push(buildFixedWidthLine(`Voided Items (${voidedTextCount})`, `- ${fmt(voidedTextTotal)}`, width));
  }
  lines.push(hr);
  lines.push(buildFixedWidthLine('TOTAL', fmt(invoice.invoiceTotal), width));
  if (depositApplied != null && parseFloat(depositApplied) > 0) {
    const bal = balanceDue != null ? parseFloat(balanceDue) : (parseFloat(invoice.invoiceTotal || 0) - parseFloat(depositApplied));
    lines.push(buildFixedWidthLine('Deposit Paid', `- ${fmt(depositApplied)}`, width));
    lines.push(buildFixedWidthLine('Balance Due', fmt(Math.max(0, bal)), width));
  }
  if (invoice.paymentMode) {
    lines.push(buildFixedWidthLine('Payment Mode', invoice.paymentMode, width));
  }
  if (cashGiven != null && parseFloat(cashGiven) > 0) {
    lines.push(buildFixedWidthLine('Cash Received', fmt(cashGiven), width));
  }
  if (changeAmount != null && parseFloat(changeAmount) > 0) {
    lines.push(buildFixedWidthLine('Change Returned', fmt(changeAmount), width));
  }
  lines.push(hr);
  if (footer) pushCentered(footer);
  lines.push('');
  lines.push('');
  return lines.join('\n');
};

export const buildThermalTestReceiptText = ({
  companyName = 'BillBull',
  branchName = '',
  terminalId = '',
  counterName = '',
  printerName = '',
  paperSize = '80mm',
  currency = 'AED',
} = {}) => {
  const width = String(paperSize || '').includes('58') ? 32 : 42;
  const hr = '-'.repeat(width);
  const lines = [];
  // Center each embedded line separately — multi-line values (e.g. a footer
  // with \n) used to be padded once for the whole string, leaving every line
  // after the first left-shifted.
  const pushCentered = (value = '') => {
    String(value).split('\n').forEach((text) => {
      if (!text) return;
      const pad = Math.max(0, Math.floor((width - text.length) / 2));
      lines.push(`${' '.repeat(pad)}${text}`.slice(0, width));
    });
  };
  pushCentered(companyName);
  pushCentered('POS PRINTER TEST');
  lines.push(hr);
  if (branchName) lines.push(`Branch: ${branchName}`.slice(0, width));
  if (terminalId) lines.push(`Terminal: ${terminalId}`.slice(0, width));
  if (counterName) lines.push(`Counter: ${counterName}`.slice(0, width));
  if (printerName) lines.push(`Printer: ${printerName}`.slice(0, width));
  lines.push(`Paper: ${paperSize}`.slice(0, width));
  lines.push(`Currency: ${currency}`.slice(0, width));
  lines.push(hr);
  pushCentered(new Date().toLocaleString('en-GB'));
  pushCentered('If you can read this,');
  pushCentered('the configured printer is working.');
  lines.push('');
  lines.push('');
  return lines.join('\n');
};

export const buildLayawayReceiptHtml = (paperSize, layaway, { companyName, trn, header, footer, showTrn }) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const layDate = layaway.createdAt
    ? new Date(layaway.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const dueStr = layaway.dueDate
    ? new Date(layaway.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const items = layaway.items || [];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${w} auto}
*{margin:0;padding:0;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${pw};margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;font-weight:600;line-height:1.5;padding:4px 0;color:#000}
.c{text-align:center}.b{font-weight:bold}.d{border-top:2px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between}
</style></head><body>
<div class="c b" style="font-size:13px">${esc(companyName)}</div>
${showTrn ? `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>` : ''}
${header ? `<div class="c" style="font-size:9px;margin:3px 0">${esc(header)}</div>` : ''}
<div class="d"></div>
<div class="c b" style="font-size:10px;margin:2px 0">NOT A TAX INVOICE</div>
<div class="c b" style="font-size:10px">LAYAWAY RECEIPT</div>
<div class="d"></div>
<div>LAY: ${esc(layaway.layawayNumber || 'Auto')}</div>
<div>${esc(layDate)}</div>
<div>Cust: ${esc(layaway.customerName || '')}</div>
${layaway.customerPhone ? `<div>Tel: ${esc(layaway.customerPhone)}</div>` : ''}
<div class="d"></div>
${items.map(it => {
  const qty = it.quantity || 0;
  const price = it.price || it.unitPrice || 0;
  const total = it.lineTotal || it.netAmount || (qty * price);
  return `<div class="row"><span>${esc(it.itemName || '')} x${qty}</span><span>AED ${fmt(total)}</span></div>`;
}).join('')}
<div class="d"></div>
<div class="row"><span>Sale Total</span><span>AED ${fmt(layaway.saleTotal)}</span></div>
${parseFloat(layaway.depositAmount || 0) > 0 ? `<div class="row"><span>Deposit (${esc(layaway.depositPaymentMode || '')})</span><span>AED ${fmt(layaway.depositAmount)}</span></div>` : ''}
<div class="row b" style="font-size:13px"><span>BALANCE DUE</span><span>AED ${fmt(layaway.balanceAmount)}</span></div>
${dueStr ? `<div class="d"></div><div>Due Date: ${esc(dueStr)}</div>` : ''}
${layaway.remarks ? `<div style="font-size:9px;margin-top:2px">Note: ${esc(layaway.remarks)}</div>` : ''}
<div class="d"></div>
<div class="c" style="font-size:9px">Items reserved until due date.</div>
<div class="c" style="font-size:9px">Balance must be paid on collection.</div>
${footer ? `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>` : ''}
</body></html>`;
};

export const buildLayawayReceiptText = (paperSize, layaway, { companyName, trn, header, footer, showTrn, omitHeader = false }) => {
  // Usable width after the shared symmetric page inset (see buildReceiptVoucherThermalText).
  const width = String(paperSize || '').includes('58') ? 30 : 46;
  const hr = '-'.repeat(width);
  const fmt = n => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const lines = [];
  // Center each embedded line separately — multi-line values (e.g. a footer
  // with \n) used to be padded once for the whole string, leaving every line
  // after the first left-shifted.
  const pushCentered = (value = '') => {
    String(value).split('\n').forEach((text) => {
      if (!text) return;
      const pad = Math.max(0, Math.floor((width - text.length) / 2));
      lines.push(`${' '.repeat(pad)}${text}`.slice(0, width));
    });
  };
  const layDate = layaway.createdAt
    ? new Date(layaway.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const dueStr = layaway.dueDate
    ? new Date(layaway.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const items = layaway.items || [];

  // omitHeader: the branded ESC/POS header (logo + company name/address/TRN,
  // Arabic-safe via canvas raster) already prints this block — see
  // buildEscPosDocument / emitEscPosBrandedHeader. Printing it again here in
  // plain ASCII would duplicate it and mangle any non-Latin-1 text into '?'.
  if (!omitHeader) {
    pushCentered(companyName || 'BillBull');
    if (showTrn && trn) pushCentered(`TRN: ${trn}`);
    if (header) pushCentered(header);
    lines.push(hr);
  }
  pushCentered('NOT A TAX INVOICE');
  pushCentered('LAYAWAY RECEIPT');
  lines.push(hr);
  lines.push(`LAY: ${layaway.layawayNumber || 'Auto'}`.slice(0, width));
  lines.push(layDate);
  lines.push(`Cust: ${layaway.customerName || ''}`.slice(0, width));
  if (layaway.customerPhone) lines.push(`Tel: ${layaway.customerPhone}`.slice(0, width));
  lines.push(hr);
  items.forEach((it) => {
    const qty = it.quantity || 0;
    const price = it.price || it.unitPrice || 0;
    const total = it.lineTotal || it.netAmount || (qty * price);
    // Wrap long item names across lines instead of truncating with "…" (matches
    // the standard invoice's item block — see buildEscPosReceipt).
    const nameLines = wrapToWidth(`${it.itemName || ''} x${qty}`, width, '  ');
    nameLines.slice(0, -1).forEach((ln) => lines.push(ln));
    const lastLine = nameLines[nameLines.length - 1] || '';
    lines.push(buildFixedWidthLine(lastLine, `AED ${fmt(total)}`, width));
  });
  lines.push(hr);
  lines.push(buildFixedWidthLine('Sale Total', `AED ${fmt(layaway.saleTotal)}`, width));
  if (parseFloat(layaway.depositAmount || 0) > 0) {
    lines.push(buildFixedWidthLine(`Deposit (${layaway.depositPaymentMode || ''})`, `AED ${fmt(layaway.depositAmount)}`, width));
  }
  lines.push(buildFixedWidthLine('BALANCE DUE', `AED ${fmt(layaway.balanceAmount)}`, width));
  if (dueStr) {
    lines.push(hr);
    lines.push(`Due Date: ${dueStr}`.slice(0, width));
  }
  if (layaway.remarks) lines.push(`Note: ${layaway.remarks}`.slice(0, width));
  lines.push(hr);
  pushCentered('Items reserved until due date.');
  pushCentered('Balance must be paid on collection.');
  if (footer) pushCentered(footer);
  lines.push('');
  lines.push('');
  return lines.join('\n');
};

// Customer payment receipt (Customer Management → Customer Receipt tab).
// Deliberately simpler than buildThermalReceiptHtml — no line items, just the
// amount received against a customer's outstanding balance.
export const buildReceiptVoucherThermalHtml = (paperSize, payment, {
  companyName, trn, address, phone, header, footer, showTrn = true,
  logoDataUrl = null, currency = 'AED', customer = null,
  // Heading shown at the top of the voucher. Defaults to the customer-payment
  // wording; the Receive-Advance flow passes 'ADVANCE RECEIPT' so the same layout
  // serves both receipt types without a second template.
  documentTitle = 'PAYMENT RECEIPT',
}) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => (parseFloat(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const oneLineAddress = (addr) => String(addr || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
  const receiptNo = payment?.paymentNumber || payment?.receiptNumber || payment?.id || '';
  const dateStr = payment?.paymentDate
    ? new Date(payment.paymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const custName = payment?.customerName || customer?.name || 'Walk-in Customer';
  const custCode = payment?.customerCode || customer?.code || '';
  const mode = payment?.paymentMode || '';
  const bankName = payment?.bankName || '';
  const ref = payment?.referenceNumber || '';
  const amount = payment?.amount || 0;
  const appliedInvoice = payment?.appliedInvoice || payment?.linkedInvoice || '';
  // Multiple invoices settled in one transaction (POS multi-invoice payment) —
  // takes priority over the single appliedInvoice line below.
  const settledInvoices = Array.isArray(payment?.settledInvoices) ? payment.settledInvoices : [];
  const D = `<div class="d"></div>`;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${w} auto}
*{margin:0;padding:0;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${pw};max-width:${pw};overflow-x:hidden;margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;font-weight:600;line-height:1.5;padding:4px 0;color:#000;filter:contrast(1.35)}
.c{text-align:center}.b{font-weight:bold}.d{border-top:2px dashed #444;margin:4px 0}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.row .lbl{flex:0 0 auto;white-space:nowrap}
.row .val{flex:1;min-width:0;text-align:right;word-break:break-word;overflow-wrap:anywhere}
.row .num{flex:1;min-width:0;text-align:right;white-space:nowrap}
</style></head><body>`;

  if (logoDataUrl) html += `<div class="c" style="margin:4px 0 6px"><img src="${logoDataUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`;
  html += `<div class="c b" style="font-size:10px;margin-bottom:6px">${esc(documentTitle)}</div>`;
  if (header) html += `<div class="c" style="font-size:9px;margin:2px 0">${esc(header)}</div>`;
  html += `<div class="c b" style="font-size:13px;margin-top:4px">${esc(companyName)}</div>`;
  const addrLine = oneLineAddress(address);
  if (addrLine) html += `<div class="c" style="font-size:9px">${esc(addrLine)}</div>`;
  if (phone) html += `<div class="c" style="font-size:9px">Tel: ${esc(phone)}</div>`;
  if (showTrn && trn) html += `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>`;
  html += D;
  html += `<div class="row"><span class="lbl">Receipt No:</span><span class="num">${esc(receiptNo)}</span></div>`;
  html += `<div class="row"><span class="lbl">Date:</span><span class="num">${esc(dateStr)}</span></div>`;
  html += `<div class="row"><span class="lbl">Customer:</span><span class="val">${esc(custName)}</span></div>`;
  if (custCode) html += `<div class="row"><span class="lbl">Code:</span><span class="val">${esc(custCode)}</span></div>`;
  html += D;
  html += `<div class="row"><span class="lbl">Payment Mode:</span><span class="num">${esc(mode)}</span></div>`;
  if (bankName) html += `<div class="row"><span class="lbl">Bank Account:</span><span class="val">${esc(bankName)}</span></div>`;
  if (ref) html += `<div class="row"><span class="lbl">Reference:</span><span class="val">${esc(ref)}</span></div>`;
  if (settledInvoices.length > 0) {
    html += D;
    html += `<div class="c b" style="font-size:9px">INVOICES SETTLED</div>`;
    settledInvoices.forEach(si => {
      html += `<div class="row"><span class="lbl">${esc(si.invoiceNumber)}</span><span class="num">${esc(currency)} ${fmt(si.amount)}</span></div>`;
    });
  } else if (appliedInvoice) {
    html += `<div class="row"><span class="lbl">Applied to Invoice:</span><span class="val">${esc(appliedInvoice)}</span></div>`;
  }
  html += D;
  html += `<div class="row b" style="font-size:14px"><span class="lbl">AMOUNT RECEIVED</span><span class="num">${esc(currency)} ${fmt(amount)}</span></div>`;
  html += D;
  html += `<div class="c" style="font-size:9px">Received with thanks.</div>`;
  if (footer) html += `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>`;
  html += `</body></html>`;
  return html;
};

// Customer statement of account (Customer Management → Customer Statement tab).
// Prints the running transaction history as a continuous thermal roll — no page
// breaks needed since @page height is "auto".
export const buildStatementThermalHtml = (paperSize, statement, {
  companyName, trn, address, phone, header, footer, showTrn = true,
  logoDataUrl = null, currency = 'AED', customer = null,
  startDate = '', endDate = '',
}) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => (parseFloat(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const oneLineAddress = (addr) => String(addr || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
  const typeLabel = (type) => !type ? '' : String(type).toLowerCase().split('_').filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const custName = customer?.name || statement?.accountName || 'Customer';
  const custCode = customer?.code || statement?.accountCode || '';
  const entries = (Array.isArray(statement?.entries) ? statement.entries : [])
    .filter(e => e?.type !== 'OPENING_BALANCE'); // opening balance is already shown separately below
  const D = `<div class="d"></div>`;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${w} auto}
*{margin:0;padding:0;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${pw};max-width:${pw};overflow-x:hidden;margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;font-weight:600;line-height:1.5;padding:4px 0;color:#000;filter:contrast(1.35)}
.c{text-align:center}.b{font-weight:bold}.d{border-top:2px dashed #444;margin:4px 0}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.row .lbl{flex:0 0 auto;white-space:nowrap}
.row .val{flex:1;min-width:0;text-align:right;word-break:break-word;overflow-wrap:anywhere}
.row .num{flex:1;min-width:0;text-align:right;white-space:nowrap}
.desc{font-size:9px;color:#000;margin:1px 0;word-break:break-word}
</style></head><body>`;

  if (logoDataUrl) html += `<div class="c" style="margin:4px 0 6px"><img src="${logoDataUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`;
  html += `<div class="c b" style="font-size:10px;margin-bottom:6px">CUSTOMER STATEMENT</div>`;
  if (header) html += `<div class="c" style="font-size:9px;margin:2px 0">${esc(header)}</div>`;
  html += `<div class="c b" style="font-size:13px;margin-top:4px">${esc(companyName)}</div>`;
  const addrLine = oneLineAddress(address);
  if (addrLine) html += `<div class="c" style="font-size:9px">${esc(addrLine)}</div>`;
  if (phone) html += `<div class="c" style="font-size:9px">Tel: ${esc(phone)}</div>`;
  if (showTrn && trn) html += `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>`;
  html += D;
  html += `<div class="row"><span class="lbl">Customer:</span><span class="val">${esc(custName)}</span></div>`;
  if (custCode) html += `<div class="row"><span class="lbl">Code:</span><span class="val">${esc(custCode)}</span></div>`;
  if (startDate || endDate) html += `<div class="row"><span class="lbl">Period:</span><span class="val">${esc(startDate)} to ${esc(endDate)}</span></div>`;
  html += D;
  html += `<div class="row b"><span class="lbl">Opening Balance</span><span class="num">${fmt(statement?.openingBalance)}</span></div>`;
  html += D;

  if (entries.length === 0) {
    html += `<div class="c" style="font-size:9px;margin:6px 0">No transactions in this period.</div>${D}`;
  }
  entries.forEach(e => {
    const debit = parseFloat(e.debit || 0);
    const credit = parseFloat(e.credit || 0);
    const balance = parseFloat(e.runningBalance || 0);
    html += `<div class="row"><span class="lbl">${esc(e.transactionDate || '')}</span><span class="num">${esc(typeLabel(e.type))}</span></div>`;
    const descLine = [e.description, (e.documentNo && !String(e.description || '').includes(e.documentNo)) ? e.documentNo : null]
      .filter(Boolean).join(' — ');
    if (descLine) html += `<div class="desc">${esc(descLine)}</div>`;
    html += `<div class="row"><span class="lbl">${debit > 0 ? 'Dr ' + fmt(debit) : credit > 0 ? 'Cr ' + fmt(credit) : '—'}</span><span class="num">Bal ${fmt(balance)}</span></div>`;
    html += D;
  });

  html += `<div class="row b" style="font-size:13px"><span class="lbl">CLOSING BAL.</span><span class="num">${esc(currency)} ${fmt(statement?.closingBalance)}</span></div>`;
  html += D;
  html += `<div class="row"><span class="lbl">Total Invoiced</span><span class="num">${fmt(statement?.totalDebit)}</span></div>`;
  html += `<div class="row"><span class="lbl">Total Paid</span><span class="num">${fmt(statement?.totalCredit)}</span></div>`;
  if (footer) { html += D; html += `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>`; }
  html += `</body></html>`;
  return html;
};

// Plain-text companion to buildReceiptVoucherThermalHtml, for the print-agent path
// (which sends raw text to the configured printer — no browser print dialog).
export const buildReceiptVoucherThermalText = (paperSize, payment, {
  companyName, trn, address, phone, header, footer, showTrn = true,
  currency = 'AED', customer = null,
  documentTitle = 'PAYMENT RECEIPT',
  // When true, skip the plain-text company header block — the caller prepends the
  // shared branded ESC/POS header (logo + company block) via buildEscPosDocument
  // instead, so the header isn't printed twice.
  omitHeader = false,
} = {}) => {
  // Usable column count after the shared symmetric page inset (MARGIN_COLS=1 each
  // side, applied by buildEscPosDocument via GS L / GS W): 46 @ 80mm, 30 @ 58mm.
  // Building to this width lines the body up inside the same left/right gutters as
  // every other 80mm print instead of floating short of the right gutter.
  const width = String(paperSize || '').includes('58') ? 30 : 46;
  const hr = '-'.repeat(width);
  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const oneLineAddress = (addr) => String(addr || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(', ');
  const receiptNo = payment?.paymentNumber || payment?.receiptNumber || payment?.id || '';
  const dateStr = payment?.paymentDate
    ? new Date(payment.paymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const custName = payment?.customerName || customer?.name || 'Walk-in Customer';
  const custCode = payment?.customerCode || customer?.code || '';
  const mode = payment?.paymentMode || '';
  const bankName = payment?.bankName || '';
  const ref = payment?.referenceNumber || '';
  const amount = payment?.amount || 0;
  const appliedInvoice = payment?.appliedInvoice || payment?.linkedInvoice || '';
  const settledInvoices = Array.isArray(payment?.settledInvoices) ? payment.settledInvoices : [];

  const lines = [];
  // Center each embedded line separately — multi-line values (e.g. a footer
  // with \n) used to be padded once for the whole string, leaving every line
  // after the first left-shifted.
  const pushCentered = (value = '') => {
    String(value).split('\n').forEach((text) => {
      if (!text) return;
      const pad = Math.max(0, Math.floor((width - text.length) / 2));
      lines.push(`${' '.repeat(pad)}${text}`.slice(0, width));
    });
  };

  if (!omitHeader) {
    pushCentered(documentTitle);
    lines.push('');
    if (header) pushCentered(header);
    pushCentered(companyName || '');
    const addrLine = oneLineAddress(address);
    if (addrLine) pushCentered(addrLine);
    if (phone) pushCentered(`Tel: ${phone}`);
    if (showTrn && trn) pushCentered(`TRN: ${trn}`);
    lines.push(hr);
  }
  lines.push(buildFixedWidthLine('Receipt No:', receiptNo, width));
  lines.push(buildFixedWidthLine('Date:', dateStr, width));
  lines.push(buildFixedWidthLine('Customer:', custName, width));
  if (custCode) lines.push(buildFixedWidthLine('Code:', custCode, width));
  lines.push(hr);
  lines.push(buildFixedWidthLine('Payment Mode:', mode, width));
  if (bankName) lines.push(buildFixedWidthLine('Bank Account:', bankName, width));
  if (ref) lines.push(buildFixedWidthLine('Reference:', ref, width));
  if (settledInvoices.length > 0) {
    lines.push(hr);
    pushCentered('INVOICES SETTLED');
    settledInvoices.forEach((si) => {
      lines.push(buildFixedWidthLine(si.invoiceNumber, fmt(si.amount), width));
    });
  } else if (appliedInvoice) {
    lines.push(buildFixedWidthLine('Applied to Invoice:', appliedInvoice, width));
  }
  lines.push(hr);
  lines.push(buildFixedWidthLine('AMOUNT RECEIVED', fmt(amount), width));
  lines.push(hr);
  pushCentered('Received with thanks.');
  if (footer) pushCentered(footer);
  lines.push('');
  lines.push('');
  return lines.join('\n');
};

// Plain-text companion to buildStatementThermalHtml, for the print-agent path.
export const buildStatementThermalText = (paperSize, statement, {
  companyName, trn, address, phone, header, footer, showTrn = true,
  currency = 'AED', customer = null,
  startDate = '', endDate = '',
  // See buildReceiptVoucherThermalText: when true, skip the plain-text company
  // header so the caller's shared branded ESC/POS header isn't duplicated.
  omitHeader = false,
} = {}) => {
  // Usable width after the shared symmetric page inset (see buildReceiptVoucherThermalText).
  const width = String(paperSize || '').includes('58') ? 30 : 46;
  const hr = '-'.repeat(width);
  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const oneLineAddress = (addr) => String(addr || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(', ');
  const typeLabel = (type) => !type ? '' : String(type).toLowerCase().split('_').filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const custName = customer?.name || statement?.accountName || 'Customer';
  const custCode = customer?.code || statement?.accountCode || '';
  const entries = (Array.isArray(statement?.entries) ? statement.entries : [])
    .filter((e) => e?.type !== 'OPENING_BALANCE');

  const lines = [];
  // Center each embedded line separately — multi-line values (e.g. a footer
  // with \n) used to be padded once for the whole string, leaving every line
  // after the first left-shifted.
  const pushCentered = (value = '') => {
    String(value).split('\n').forEach((text) => {
      if (!text) return;
      const pad = Math.max(0, Math.floor((width - text.length) / 2));
      lines.push(`${' '.repeat(pad)}${text}`.slice(0, width));
    });
  };

  if (!omitHeader) {
    pushCentered('CUSTOMER STATEMENT');
    lines.push('');
    if (header) pushCentered(header);
    pushCentered(companyName || '');
    const addrLine = oneLineAddress(address);
    if (addrLine) pushCentered(addrLine);
    if (phone) pushCentered(`Tel: ${phone}`);
    if (showTrn && trn) pushCentered(`TRN: ${trn}`);
    lines.push(hr);
  }
  lines.push(buildFixedWidthLine('Customer:', custName, width));
  if (custCode) lines.push(buildFixedWidthLine('Code:', custCode, width));
  if (startDate || endDate) lines.push(buildFixedWidthLine('Period:', `${startDate} to ${endDate}`, width));
  lines.push(hr);
  lines.push(buildFixedWidthLine('Opening Balance', fmt(statement?.openingBalance), width));
  lines.push(hr);

  if (entries.length === 0) {
    pushCentered('No transactions in this period.');
    lines.push(hr);
  }
  entries.forEach((e) => {
    const debit = parseFloat(e.debit || 0);
    const credit = parseFloat(e.credit || 0);
    const balance = parseFloat(e.runningBalance || 0);
    lines.push(buildFixedWidthLine(e.transactionDate || '', typeLabel(e.type), width));
    const descLine = [e.description, (e.documentNo && !String(e.description || '').includes(e.documentNo)) ? e.documentNo : null]
      .filter(Boolean).join(' — ');
    if (descLine) lines.push(descLine.slice(0, width));
    lines.push(buildFixedWidthLine(debit > 0 ? `Dr ${fmt(debit)}` : credit > 0 ? `Cr ${fmt(credit)}` : '—', `Bal ${fmt(balance)}`, width));
    lines.push(hr);
  });

  lines.push(buildFixedWidthLine('CLOSING BAL.', `${currency} ${fmt(statement?.closingBalance)}`, width));
  lines.push(hr);
  lines.push(buildFixedWidthLine('Total Invoiced', fmt(statement?.totalDebit), width));
  lines.push(buildFixedWidthLine('Total Paid', fmt(statement?.totalCredit), width));
  if (footer) { lines.push(hr); pushCentered(footer); }
  lines.push('');
  lines.push('');
  return lines.join('\n');
};

export const buildThermalJobCardHtml = (paperSize, job, { companyName, trn, footer, showTrn }) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const jobDate = job.createdAt
    ? new Date(job.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${w} auto}
*{margin:0;padding:0;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${pw};margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;font-weight:600;line-height:1.5;padding:4px 0;color:#000}
.c{text-align:center}.b{font-weight:bold}.d{border-top:2px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between}
</style></head><body>
<div class="c b" style="font-size:13px">${esc(companyName)}</div>
${showTrn ? `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>` : ''}
<div class="d"></div>
<div class="c b" style="font-size:11px">SERVICE JOB CARD</div>
<div class="d"></div>
<div>Job: ${esc(job.jobNumber || '')}</div>
<div>${esc(jobDate)}</div>
${job.technicianName ? `<div>Tech: ${esc(job.technicianName)}</div>` : ''}
<div class="d"></div>
<div>Cust: ${esc(job.customerName || '')}</div>
${job.customerPhone ? `<div>Tel: ${esc(job.customerPhone)}</div>` : ''}
<div>Item: ${esc(job.deviceName || job.itemName || '')}</div>
${job.serialNumber ? `<div>S/N: ${esc(job.serialNumber)}</div>` : ''}
${job.warranty ? `<div>Warranty: ${esc(job.warranty)}</div>` : ''}
<div class="d"></div>
${job.problemDescription ? `<div style="font-size:9px">Problem: ${esc(job.problemDescription)}</div>` : ''}
${job.expectedDate ? `<div style="font-size:9px">Expected: ${esc(job.expectedDate)}</div>` : ''}
<div class="d"></div>
<div style="font-size:9px">Cust. Signature: _________________</div>
${footer ? `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>` : ''}
</body></html>`;
};

export const buildServiceJobA4Html = ({ companyName, trn, address, phone, footerNote }) => {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const abbr = n => esc(n || 'BB').substring(0, 2).toUpperCase();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:9px;color:#222;background:#fff;padding:20px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:10px;border-bottom:2.5px solid #F5C742}
.logo{width:52px;height:52px;background:linear-gradient(135deg,#F5C742,#e6b838);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff}
.dt{font-size:13px;font-weight:900;color:#1E293B;letter-spacing:.5px;margin-left:10px;align-self:center}
.co{text-align:right;font-size:8px;color:#555;line-height:1.5}.co-n{font-size:12px;font-weight:700;color:#1E293B}
.meta{display:flex;gap:6px;margin-bottom:12px}.mb{flex:1;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:5px 7px}
.ml{font-size:7px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px}.mv{font-size:8.5px;color:#1E293B;font-weight:600}
.srow{display:flex;gap:6px;margin-bottom:8px}.sbox{flex:1;border:1px solid #E5E7EB;border-radius:6px;padding:6px 8px}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:7px;font-weight:700;background:#F0FDF4;color:#16A34A}
.sig{border-top:1px solid #D1D5DB;margin-top:30px;font-size:7px;color:#9CA3AF;padding-top:3px;text-align:center}
.fn{margin-top:10px;padding:6px 10px;background:#FFFBEB;border-left:3px solid #F5C742;font-size:8px;color:#666;line-height:1.4}
@page{size:A4 portrait;margin:15mm}
</style></head><body>
<div class="hdr">
  <div style="display:flex;align-items:center"><div class="logo">${abbr(companyName)}</div><div class="dt">SERVICE JOB CARD</div></div>
  <div class="co"><div class="co-n">${esc(companyName || 'Your Company')}</div><div>TRN: ${esc(trn)}</div><div>${esc(address)}</div><div>${esc(phone)}</div></div>
</div>
<div class="meta">
  <div class="mb"><div class="ml">Job No</div><div class="mv">SRV-000028</div></div>
  <div class="mb"><div class="ml">Date</div><div class="mv">22 Jun 2026</div></div>
  <div class="mb"><div class="ml">Technician</div><div class="mv">Mohammed Ali</div></div>
</div>
<div class="srow">
  <div class="sbox"><div class="ml">Customer</div><div class="mv">Fatima Hassan</div><div style="font-size:8px;color:#555;margin-top:2px">+971 50 123 4567</div></div>
  <div class="sbox"><div class="ml">Device / Item</div><div class="mv">Samsung Galaxy A55</div><div style="font-size:8px;color:#555;margin-top:2px">Serial: SNSA55-20260312</div></div>
</div>
<div style="border:1px solid #E5E7EB;border-radius:6px;padding:8px 10px;margin-bottom:10px">
  <div class="ml" style="margin-bottom:4px">Problem Description</div>
  <div style="font-size:8.5px;color:#1E293B">Display issue — screen flickering when brightness above 70%.</div>
  <div style="margin-top:6px"><span class="badge">Under Warranty</span></div>
</div>
<div style="border:1px solid #E5E7EB;border-radius:6px;padding:8px 10px;margin-bottom:10px">
  <div class="ml" style="margin-bottom:4px">Service Notes / Work Done</div>
  <div style="font-size:8px;color:#bbb;font-style:italic">To be filled after diagnosis...</div>
</div>
<div class="sig">Customer Signature ___________________</div>
${footerNote ? `<div class="fn">${esc(footerNote)}</div>` : ''}
</body></html>`;
};

// Generates a full-featured thermal receipt HTML that mirrors ThermalMock, respecting all toggles.
// Used by Full Preview and Test Print so they always match the live preview.
export const buildThermalSampleHtml = (paperSize, {
  companyName, trn, header, footer,
  showLogo = true, showTrn = true, showCompanyDetails = true,
  showServiceCharge = true, showVatSummary = true, showPaymentDetails = true,
  showQRCode = true, showCustomerDetails = true, showLoyaltyPoints = true,
  showCreditBalance = true, showFooterText = true,
  logoDataUrl = null, stampDataUrl = null,
  isReturn = false, qrPlacement = 'before',
}) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const D = `<div style="border-top:2px dashed #444;margin:4px 0"></div>`;
  const sec = t => `<div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#000;margin:4px 0 2px">${t}</div>`;
  const invNo = isReturn ? 'SR-28-042' : 'DI-28-042';
  const total = isReturn ? 'AED -1,449.00' : 'AED 102.80';

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${w} auto}
*{margin:0;padding:0;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{width:${pw};margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;font-weight:600;line-height:1.5;padding:4px 2px;color:#000}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.row .lbl{flex:0 0 auto;white-space:nowrap}
.row .val{flex:1;min-width:0;text-align:right;word-break:break-word;overflow-wrap:anywhere}
</style></head><body>`;

  const srow = (l, r, bold) => `<div class="row"${bold?' style="font-weight:bold"':''}><span class="lbl">${esc(l)}</span><span class="val">${esc(r)}</span></div>`;

  if (showLogo) {
    html += logoDataUrl
      ? `<div style="text-align:center;margin:4px 0 6px"><img src="${logoDataUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`
      : `<div style="text-align:center;margin:4px 0 6px"><div style="width:52px;height:52px;border-radius:50%;border:1px solid #ccc;display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:#999">Logo</div></div>`;
  }
  html += `<div style="text-align:center;font-weight:bold;font-size:10px;margin-bottom:2px">${esc(header || (isReturn ? 'CREDIT NOTE' : 'TAX INVOICE'))}</div>`;
  html += `<div style="text-align:center;font-size:13px;font-weight:bold">${esc(companyName || 'Branch Name')}</div>`;
  if (showCompanyDetails) {
    html += `<div style="text-align:center;font-size:9px">Shop 12, Dubai Mall, Downtown Dubai, UAE</div>`;
    html += `<div style="text-align:center;font-size:9px">Tel: +971 4 123 4567</div>`;
  }
  if (showTrn) html += `<div style="text-align:center;font-size:9px">TRN: ${esc(trn || '100123456700003')}</div>`;
  html += D;
  html += srow('Invoice No:', invNo);
  html += srow('Date:', '24-Jun-2026 03:15 PM');
  html += srow('Cashier:', 'Hari K');
  html += srow('Terminal ID:', 'POS-01');
  html += srow('Counter:', 'Counter-01');
  html += D;
  // Item rows mirror the live receipt (§5): "Qty x Name" then "@ unit  =  total".
  const itemRow = (qty, name, unit, total, note) => {
    let h = `<div class="row"><span class="val b" style="text-align:left">${qty}x ${esc(name)}</span></div>`;
    h += `<div class="row"><span class="lbl" style="font-size:10px;color:#000;padding-left:8px">@ ${unit}</span><span class="val">${total}</span></div>`;
    if (note) h += `<div style="font-size:10px;padding-left:8px;color:#000">${esc(note)}</div>`;
    return h;
  };
  if (isReturn) {
    html += itemRow(1, 'Samsung A55', '1,380.00', '-1,380.00', 'VAT Reversal  -69.00');
  } else {
    html += itemRow(1, 'Margherita Pizza', '45.00', '45.00', 'Extra cheese, No olives');
    html += itemRow(2, 'Coke', '8.00', '16.00');
    html += itemRow(1, 'Caesar Salad', '28.00', '28.00');
  }
  html += D;
  html += srow('Subtotal:', isReturn ? '-1,380.00' : 'AED 89.00');
  if (!isReturn)         html += srow('Discount:', 'AED 0.00');
  if (!isReturn)         html += srow('Taxable Amount:', 'AED 89.00');
  if (showServiceCharge) html += srow('Service Charge:', isReturn ? '-138.00' : 'AED 8.90');
  if (showVatSummary)    html += srow('VAT:', isReturn ? '-69.00' : 'AED 4.90');
  html += D;
  html += `<div class="row" style="font-weight:bold;font-size:13px"><span>TOTAL:</span><span>${total}</span></div>`;
  html += D;
  if (showPaymentDetails && !isReturn) {
    html += srow('Payment Mode:', 'Cash');
    html += srow('Cash Received:', 'AED 150.00');
    html += srow('Change Returned:', 'AED 47.20');
    html += D;
  }
  if (isReturn) {
    html += srow('Refund Method:', 'Cash');
    html += D;
  }
  // §5 stamp-replaces-QR: a stamp image hides the QR; otherwise the QR is shown.
  // Placement (before/after footer text) is applied later via qrPlacement.
  let qrStampHtml = '';
  if (stampDataUrl) {
    qrStampHtml += `<div style="text-align:center;margin:6px 0"><img src="${stampDataUrl}" style="height:80px;max-width:70%;object-fit:contain" alt="Stamp" /></div>`;
    qrStampHtml += D;
  } else if (showQRCode) {
    qrStampHtml += `<div style="text-align:center;margin:6px 0"><div style="width:80px;height:80px;border:1px solid #ccc;display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:#999">QR Code</div><div style="font-size:8px;color:#000;margin-top:2px">Scan to verify</div></div>`;
    qrStampHtml += D;
  }
  if (showCustomerDetails) {
    html += sec('CUSTOMER');
    html += srow('Name:', 'Sarah Johnson');
    html += srow('Mobile:', '+971 50 123 4567');
    html += srow('Email:', 'sarah@email.com');
    html += D;
  }
  if (showLoyaltyPoints) {
    html += sec('LOYALTY POINTS');
    html += srow('Points Earned:', '+ 10 pts');
    html += srow('Points Used:', '0 pts');
    html += srow('Remaining Balance:', '1,250 pts');
    html += D;
  }
  if (showCreditBalance) {
    html += sec('CREDIT ACCOUNT');
    html += srow('Previous Balance:', 'AED 245.50');
    html += srow('Invoice Credit:', 'AED 102.80');
    html += srow('Amount Paid:', 'AED 0.00');
    html += srow('Updated Balance:', 'AED 348.30');
    html += D;
  }
  // 'before' (default): QR/stamp renders immediately above the footer text.
  if (qrPlacement !== 'after') html += qrStampHtml;

  if (showFooterText && footer) {
    html += `<div style="text-align:center;font-size:9px;margin-top:4px;white-space:pre-line">${esc(footer)}</div>`;
  }

  // 'after': QR/stamp renders below the footer text.
  if (qrPlacement === 'after') { html += D; html += qrStampHtml; }

  html += '</body></html>';
  return html;
};

/**
 * @param customersList optional live customer directory (POSSales' customerOptions)
 *   used to backfill address/phone/email/trn when the invoice's own snapshot fields
 *   are blank — common for POS walk-in/quick sales that only persist customerName.
 *   Mirrors the cross-reference Back Office's SalesInvoice print builder already does
 *   against its own customersList.
 */
export const buildPosPrintData = (full, footerNote = '', customersList = []) => {
  const custRec = full.customerCode
    ? (customersList || []).find(c => c.code === full.customerCode || c.id === full.customerCode)
    : null;
  const { subTotal, discountTotal, lineDiscountTotal, billDiscountTotal, taxableAmount } = resolveInvoiceGrossTotals(full);
  return {
    title: Number(full.taxTotal) > 0 ? 'TAX INVOICE' : 'SALES INVOICE',
    docNo: full.invoiceNumber || '',
    date: full.invoiceDate || '',
    customer: {
      name: full.customerName || 'Walk-in Customer',
      code: full.customerCode || custRec?.code || '',
      address: full.customerAddress || custRec?.address || custRec?.billingAddress || '',
      phone: full.customerPhone || custRec?.phone || custRec?.mobile || '',
      email: full.customerEmail || custRec?.email || '',
      trn: full.customerTrn || custRec?.trn || '',
    },
    // Voided lines keep their REAL qty/price/tax/total (no longer zeroed): the
    // renderer prints them with a leading "-" + [VOID] tag via the `voided`
    // flag. They're already excluded from subTotal/taxable by
    // resolveInvoiceGrossTotals and disclosed in the Voided Items totals row.
    items: (full.items || []).map(it => {
      const isVoided = Boolean(it.voided ?? it.isVoided ?? false);
      return {
        code: it.itemCode || '',
        name: it.itemName || it.productName || '',
        desc: it.description || '',
        unit: it.unit || it.uom || '',
        qty: it.quantity || 0,
        price: it.unitPrice || it.price || 0,
        // Backend persists the line discount rate under `discount` (a percentage);
        // fall back to discountPercent/disc for cart-shaped inputs.
        disc: it.discountPercent ?? it.discount ?? it.disc ?? 0,
        tax: it.taxPercent || it.taxRate || 5,
        // When a stored voided line came back with taxAmount/netAmount zeroed
        // (older POS posts), pass them as undefined so the renderer re-derives
        // taxable/tax/total from qty×price×disc rather than printing 0.00.
        taxAmt: (Number(it.taxAmount || 0) === 0 && isVoided) ? undefined : (it.taxAmount || 0),
        total: (Number(it.netAmount || it.lineTotal || 0) === 0 && isVoided) ? undefined : (it.netAmount || it.lineTotal || 0),
        batchNumber: it.batchNumber || '',
        image: it.image || '',
        voided: isVoided,
      };
    }),
    totals: {
      subTotal,
      // True ex-VAT taxable base — passed explicitly so the renderer doesn't
      // (mis)derive it as subTotal − discount under VAT-inclusive pricing.
      taxableAmount,
      tax: full.taxTotal || 0,
      grandTotal: full.invoiceTotal || 0,
      discountAmount: discountTotal,
      // Split so the renderer shows distinct Discount (line) + Footer Discount
      // rows. Line discount is derived VAT-mode-aware in resolveInvoiceGrossTotals;
      // footer/bill discount comes from the persisted invoice aggregate.
      itemDiscountAmount: lineDiscountTotal,
      footerDiscountAmount: billDiscountTotal,
      billDiscountAmount: billDiscountTotal,
      // Informational voided-lines disclosure (excluded from grandTotal).
      voidedCount: (full.items || []).filter(it => Boolean(it.voided ?? it.isVoided ?? false)).length,
      voidedTotal: (full.items || [])
        .filter(it => Boolean(it.voided ?? it.isVoided ?? false))
        .reduce((s, it) => s + voidedLineNet(it), 0),
    },
    meta: {
      notes: footerNote,
      paymentMode: full.paymentMode || '',
      location: full.branchName || '',
      salesPerson: full.posCounterName || '',
    },
  };
};

/**
 * Builds a POS cart/session-shaped "draft invoice" object from live, pre-payment
 * checkout state — same field shape as checkoutThermalHtml's mockInvoice in
 * POSSales.jsx (itemCode/itemName/quantity/unitPrice/netAmount/discountPercent/
 * taxPercent/taxAmount), which is what buildPosPrintData already expects as input.
 * Piping this through buildPosPrintData gives an A4 checkout-time preview the exact
 * same canonical printData shape the real, posted-invoice print/reprint path uses —
 * without needing a posted SalesInvoice to exist yet.
 */
export const buildDraftPrintDataFromCart = (cart = {}, footerNote = '') => {
  const {
    invoiceNumber = '',
    invoiceDate = new Date().toISOString(),
    customer,
    saleType = '',
    terminalId = '',
    counterName = '',
    paymentMode = 'Cash',
    subTotal = 0,
    taxTotal = 0,
    taxInclusive = false,
    invoiceTotal = 0,
    discountTotal = 0,
    items = [],
    branchName = '',
  } = cart;

  // Route the preview through resolveInvoiceGrossTotals' MAIN branch (not the
  // explicit-discountTotal early-return) so the checkout preview presents the
  // SAME gross-basis Subtotal/Discount as the posted invoice & Sales Invoice A4
  // (e.g. a 20%-off 3,500 line reads Sub Total 3,500 / Discount −700, not the
  // ex-VAT 3,181.82 / −636 the cart tracks internally). That needs: an ex-VAT
  // taxable base AFTER discount as subTotal, and per-line grossAmount.
  const taxableAfterDiscount = Math.max(0, (Number(subTotal) || 0) - (Number(discountTotal) || 0));
  const mockInvoice = {
    invoiceNumber,
    invoiceDate,
    createdAt: invoiceDate,
    customerName: customer?.name || 'Walk-in Customer',
    customerPhone: customer?.phone || '',
    customerEmail: customer?.email || '',
    customerCode: (customer && customer.id !== 'walk-in') ? (customer.code || customer.id || '') : '',
    customerTrn: customer?.trn || '',
    customerAddress: customer?.shippingAddress || customer?.address || '',
    saleType,
    posTerminalId: terminalId,
    posCounterName: counterName,
    paymentMode,
    subTotal: taxableAfterDiscount,
    taxTotal,
    taxInclusive,
    invoiceTotal,
    branchName,
    items: items.map(it => ({
      itemCode: it.itemCode || it.code || it.productId || it.id || '',
      itemName: it.itemName || it.name || '',
      description: it.description || '',
      unit: it.unit || it.uom || '',
      quantity: it.quantity || 0,
      unitPrice: it.unitPrice || it.price || 0,
      // Pre-discount gross so the renderer/totals derive the gross-basis discount.
      grossAmount: (Number(it.unitPrice || it.price || 0) * Number(it.quantity || 0)),
      netAmount: it.netAmount || it.total || 0,
      discountPercent: it.discountPercent || it.discount || 0,
      taxPercent: it.taxPercent != null ? it.taxPercent : it.taxRate,
      taxAmount: it.taxAmount,
      batches: it.batchNumber ? [{ batchNumber: it.batchNumber }] : (it.batches || []),
      batchNumber: it.pinnedBatchNumber || it.batchNumber || '',
      voided: !!it.voided || !!it.isVoided,
    })),
  };

  return buildPosPrintData(mockInvoice, footerNote);
};

/**
 * Returns a shallow copy of a resolved PrintTemplate with VAT columns (colVAT/
 * colVATAmount, at both the top-level displayOptions and nested
 * salesDesignerSettings) forced off when the sale has no tax — mirrors the
 * hasTax routing the thermal receipt path already applies (Tax Invoice title +
 * VAT columns only when tax > 0, plain Sales Invoice otherwise), now extended to
 * the real A4 template so the SAME resolved template prints correctly either
 * way instead of needing a second template. Never mutates the original template
 * object (the one held in React state / the designer's cache).
 */
export const applyTaxAwareDisplayOptions = (template, hasTax) => {
  if (!template || hasTax) return template;
  try {
    const parsed = JSON.parse(template.displayOptions || '{}');
    parsed.colVAT = false;
    parsed.colVATAmount = false;
    if (parsed.salesDesignerSettings) {
      parsed.salesDesignerSettings = { ...parsed.salesDesignerSettings, colVAT: false, colVATAmount: false };
    }
    return { ...template, displayOptions: JSON.stringify(parsed) };
  } catch {
    return template;
  }
};

export const buildPosA4Template = (footerNote = '', opts = {}, category = 'Sales Invoice') => {
  const ds = {
    showLogo:             opts.showLogo             !== false,
    showCompanyName:      opts.showCompanyDetails   !== false,
    showCompanyAddress:   opts.showCompanyDetails   !== false,
    showTRN:              opts.showTrn              !== false,
    showBillTo:           opts.showCustomerDetails  !== false,
    showCustomerName:     opts.showCustomerDetails  !== false,
    showTerms:            opts.showTerms            !== false,
    showNotes:            opts.showNotes            !== false,
    showBankDetails:      !!opts.showBankDetails,
    showQRCode:           !!opts.showQRCode,
    showCompanyStamp:     !!opts.showStamp,
    showSignatures:       !!opts.showSignature,
    showGrandTotalBanner: opts.showGrandTotalBanner !== false,
    colItemCode:          opts.colItemCode          !== false,
    colProductImage:      !!opts.colItemImage,
    colBarcode:           !!opts.colBarcode,
    colBatchNumber:       !!opts.colBatchNo,
    colDiscount:          opts.colDiscount          !== false,
    colVAT:               opts.colVatPct            !== false,
    colVATAmount:         opts.colVatAmt            !== false,
    colUOM:               opts.colUOM               !== false,
    primaryColor: '#F5C742',
    accentColor:  '#F5C742',
  };
  return {
    category,
    paperSize: 'A4',
    orientation: 'Portrait',
    termsContent: footerNote,
    displayOptions: JSON.stringify({
      showLogo:            ds.showLogo,
      showCompanyDetails:  ds.showCompanyName,
      showCustomerDetails: ds.showBillTo,
      showTerms:           ds.showTerms,
      showBankDetails:     ds.showBankDetails,
      showQRCode:          ds.showQRCode,
      primaryColor:        '#F5C742',
      accentColor:         '#F5C742',
      salesDesignerSettings: ds,
    }),
  };
};
