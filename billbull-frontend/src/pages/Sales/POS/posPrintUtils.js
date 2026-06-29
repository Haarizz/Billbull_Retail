import { generateDocumentPrintHtml } from '../../../utils/documentTemplateRenderer';

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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
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
  showTrn = true, isReprint = false, documentTitle = null,
  zatcaQrDataUrl = null, logoDataUrl = null, footerLogoDataUrl = null,
  stampDataUrl = null,
  showLogo = true, showCompanyDetails = true, showCompanyAddress = true,
  showServiceCharge = false, showVatSummary = true, showPaymentDetails = true,
  showQRCode = true, showCustomerDetails = true,
  showLoyaltyPoints = false, showCreditBalance = false, showFooterText = true,
  outletAddress = '', outletPhone = '',
  cashGiven = null, changeAmount = null,
  // Layaway/Hold deposit already collected, shown as a reduction with the remaining
  // balance due, when this sale settles a reserved order (§Layaway conversion).
  depositApplied = null, balanceDue = null,
  cashierName = '', terminalId = '', counterName = '',
  customerPhone = null, customerEmail = null,
  creditPreviousBalance = null, creditInvoiceCredit = null,
  creditAmountPaid = null, creditUpdatedBalance = null,
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
  // Collapse a multi-line / comma address into one continuous line (§1).
  const oneLineAddress = (addr) => String(addr || '')
    .split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
  const items = invoice.items || [];
  const subTotal = invoice.subTotal || 0;
  const taxTotal = invoice.taxTotal || 0;
  const grandTotal = invoice.invoiceTotal || 0;
  // Total discount = sum of line discounts + bill-level discount (§3A).
  const discountTotal = parseFloat(
    invoice.discountTotal != null ? invoice.discountTotal
      : (parseFloat(invoice.lineDiscountTotal || 0) + parseFloat(invoice.billDiscountAmount || 0))
  ) || 0;
  const payMode = invoice.paymentMode || '';
  const invDate = invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const invTime = invoice.createdAt ? new Date(invoice.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
  const customerName = invoice.customerName || 'Walk-in Customer';
  const isWalkIn = !invoice.customerName || invoice.customerName === 'Walk-in Customer';
  // Cashier = logged-in user (§2A); falls back to audit createdBy. NOT the counter name.
  const cashier = cashierName || invoice.createdBy || '';
  const terminal = terminalId || invoice.posTerminalId || '';
  const counter = counterName || invoice.posCounterName || '';
  const D = `<div class="d"></div>`;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.row .lbl{flex:0 0 auto;white-space:nowrap}
.row .val{flex:1;text-align:right;word-break:break-word;overflow-wrap:anywhere}
.row .num{flex:1;text-align:right;white-space:nowrap}
.s{font-size:9px;text-transform:uppercase;color:#555;margin:3px 0 1px;letter-spacing:.08em}
</style></head><body>`;

  // ── Header (§1): logo, title, company name, single-line address, phone, TRN ──
  if (showLogo && logoDataUrl) {
    html += `<div class="c" style="margin:4px 0 6px"><img src="${logoDataUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`;
  }
  html += `<div class="c b" style="font-size:10px;margin-bottom:2px">${esc(documentTitle || 'TAX INVOICE')}</div>`;
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
  html += D;

  // ── Line items (§5): "Qty x Name" on row 1, then "@ unit  =  line total" on
  // row 2 so unit price is always visible (was: qty×name + total only). ──
  items.forEach(it => {
    const isVoid = !!it.voided || !!it.isVoided;
    const qty = it.quantity || 0;
    const unit = parseFloat(it.unitPrice || it.price || 0);
    const total = isVoid ? 0 : (it.netAmount || it.lineTotal || (qty * unit));
    const batch = it.batchNumber || it.pinnedBatchNumber || '';
    const serial = it.serialNumber || '';
    const desc = it.description || '';
    const sku = it.sku || it.itemCode || '';
    const nameDisplay = `${qty}x ${esc(it.itemName || it.productName || it.name || '')}${isVoid ? ' [VOID]' : ''}`;
    const nameStyle = isVoid ? 'text-align:left; text-decoration:line-through; color:#888;' : 'text-align:left;';

    // Row 1: quantity × product name (name wraps if long).
    html += `<div class="row"><span class="val b" style="${nameStyle}">${nameDisplay}</span></div>`;
    // Row 2: unit price → line total, right-aligned and aligned with the total column.
    html += `<div class="row"><span class="lbl" style="font-size:10px;color:#444;padding-left:8px">@ ${cur} ${fmt(unit)}</span><span class="num">${cur} ${fmt(total)}</span></div>`;
    if (sku) html += `<div style="font-size:9px;color:#555;padding-left:8px">SKU: ${esc(sku)}</div>`;
    if (desc) html += `<div style="font-size:9px;color:#555;padding-left:8px">${esc(desc)}</div>`;
    if (serial) html += `<div style="font-size:9px;color:#555;padding-left:8px">S/N: ${esc(serial)}</div>`;
    else if (batch) html += `<div style="font-size:9px;color:#555;padding-left:8px">Batch: ${esc(batch)}</div>`;
  });
  html += D;

  // ── Totals (§3): Subtotal, Discount (if any), VAT (no hardcoded %), TOTAL ──
  html += `<div class="row"><span class="lbl">Subtotal:</span><span class="num">${cur} ${fmt(subTotal)}</span></div>`;
  if (discountTotal > 0) html += `<div class="row"><span class="lbl">Discount:</span><span class="num">${cur} ${fmt(discountTotal)}</span></div>`;
  if (showServiceCharge && invoice.serviceChargeAmount) html += `<div class="row"><span class="lbl">Service Charge:</span><span class="num">${cur} ${fmt(invoice.serviceChargeAmount)}</span></div>`;
  if (showVatSummary) html += `<div class="row"><span class="lbl">VAT:</span><span class="num">${cur} ${fmt(taxTotal)}</span></div>`;
  html += D;
  html += `<div class="row b" style="font-size:13px"><span>TOTAL:</span><span class="num">${cur} ${fmt(grandTotal)}</span></div>`;
  // Layaway/Hold deposit already paid → show it as a reduction with the balance due.
  if (depositApplied != null && parseFloat(depositApplied) > 0) {
    const bal = balanceDue != null ? parseFloat(balanceDue) : (parseFloat(grandTotal) - parseFloat(depositApplied));
    html += `<div class="row"><span class="lbl">Deposit Paid:</span><span class="num">- ${cur} ${fmt(depositApplied)}</span></div>`;
    html += `<div class="row b"><span>Balance Due:</span><span class="num">${cur} ${fmt(Math.max(0, bal))}</span></div>`;
  }
  html += D;

  // ── Payment details (§4): mode, cash received, change (only when change > 0) ──
  if (showPaymentDetails) {
    if (payMode) html += `<div class="row"><span class="lbl">Payment Mode:</span><span class="val">${esc(payMode)}</span></div>`;
    if (cashGiven != null && parseFloat(cashGiven) > 0) html += `<div class="row"><span class="lbl">Cash Received:</span><span class="num">${cur} ${fmt(cashGiven)}</span></div>`;
    if (changeAmount != null && parseFloat(changeAmount) > 0) html += `<div class="row"><span class="lbl">Change Returned:</span><span class="num">${cur} ${fmt(changeAmount)}</span></div>`;
    if (payMode || (cashGiven != null && parseFloat(cashGiven) > 0)) html += D;
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
    qrStampHtml += `<div class="c" style="margin:6px 0"><img src="${zatcaQrDataUrl}" style="width:80px;height:80px" alt="ZATCA QR" /><div style="font-size:8px;color:#555;margin-top:2px">Scan to verify</div></div>`;
    if (footerLogoDataUrl) qrStampHtml += `<div class="c" style="margin:4px 0"><img src="${footerLogoDataUrl}" style="height:48px;max-width:70%;object-fit:contain;display:block;margin:0 auto" /></div>`;
    qrStampHtml += D;
  } else if (footerLogoDataUrl) {
    qrStampHtml += `<div class="c" style="margin:4px 0"><img src="${footerLogoDataUrl}" style="height:48px;max-width:70%;object-fit:contain;display:block;margin:0 auto" /></div>`;
    qrStampHtml += D;
  }
  // 'before' (default): QR/stamp renders here, ahead of customer/credit/footer.
  if (qrPlacement !== 'after') html += qrStampHtml;

  // ── Customer (§6): label fixed-width, name/email wrap gracefully within width ──
  if (showCustomerDetails && !isWalkIn) {
    const custPhone = customerPhone || invoice.customerPhone || '';
    const custEmail = customerEmail || invoice.customerEmail || '';
    html += `<div class="s">CUSTOMER</div>`;
    html += `<div class="row"><span class="lbl">Name:</span><span class="val">${esc(customerName)}</span></div>`;
    if (custPhone) html += `<div class="row"><span class="lbl">Mobile:</span><span class="num">${esc(custPhone)}</span></div>`;
    if (custEmail) html += `<div class="row"><span class="lbl">Email:</span><span class="val">${esc(custEmail)}</span></div>`;
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
  if (showCreditBalance && creditPreviousBalance != null) {
    const invCredit  = creditInvoiceCredit != null ? creditInvoiceCredit : 0;
    const amtPaid    = creditAmountPaid    != null ? creditAmountPaid    : grandTotal;
    const updatedBal = creditUpdatedBalance != null
      ? creditUpdatedBalance
      : (parseFloat(creditPreviousBalance) + parseFloat(invCredit));
    html += `<div class="s">CREDIT ACCOUNT</div>`;
    html += `<div class="row"><span class="lbl">Previous Balance:</span><span class="num">${cur} ${fmt(creditPreviousBalance)}</span></div>`;
    html += `<div class="row"><span class="lbl">Invoice Credit:</span><span class="num">${cur} ${fmt(invCredit)}</span></div>`;
    html += `<div class="row"><span class="lbl">Amount Paid:</span><span class="num">${cur} ${fmt(amtPaid)}</span></div>`;
    html += `<div class="row"><span class="lbl">Updated Balance:</span><span class="num">${cur} ${fmt(updatedBal)}</span></div>`;
    html += D;
  }

  if (showFooterText && footer) {
    html += `<div class="c" style="font-size:9px;margin-top:4px;white-space:pre-line">${esc(footer)}</div>`;
  }

  // 'after': QR/stamp renders below the footer text.
  if (qrPlacement === 'after') { html += D; html += qrStampHtml; }

  html += '</body></html>';
  return html;
};

const buildFixedWidthLine = (left, right, width) => {
  const l = String(left || '');
  const r = String(right || '');
  if (!r) return l.slice(0, width);
  const room = Math.max(1, width - r.length - 1);
  const leftTrimmed = l.length > room ? `${l.slice(0, Math.max(0, room - 1))}…` : l;
  return `${leftTrimmed}${' '.repeat(Math.max(1, width - leftTrimmed.length - r.length))}${r}`;
};

export const buildThermalReceiptText = (paperSize, invoice, {
  companyName, trn, header, footer,
  showTrn = true,
  cashierName = '',
  terminalId = '',
  counterName = '',
  cashGiven = null,
  changeAmount = null,
  depositApplied = null,
  balanceDue = null,
  currency = 'AED',
  customerPhone = null,
  customerEmail = null,
} = {}) => {
  const width = String(paperSize || '').includes('58') ? 32 : 42;
  const hr = '-'.repeat(width);
  const fmt = (n) => {
    const v = parseFloat(n) || 0;
    return `${currency} ${v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const lines = [];
  const pushCentered = (value = '') => {
    const text = String(value);
    if (!text) return;
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    lines.push(`${' '.repeat(pad)}${text}`.slice(0, width));
  };

  pushCentered(companyName || 'BillBull');
  if (showTrn && trn) pushCentered(`TRN: ${trn}`);
  if (header) pushCentered(header);
  lines.push(hr);
  lines.push(buildFixedWidthLine('Invoice', invoice.invoiceNumber || invoice.id || '', width));
  if (invoice.invoiceDate) {
    const dt = new Date(invoice.invoiceDate);
    lines.push(buildFixedWidthLine('Date', dt.toLocaleString('en-GB'), width));
  }
  if (cashierName) lines.push(buildFixedWidthLine('Cashier', cashierName, width));
  if (terminalId) lines.push(buildFixedWidthLine('Terminal', terminalId, width));
  if (counterName) lines.push(buildFixedWidthLine('Counter', counterName, width));
  lines.push(hr);
  lines.push(`Customer: ${invoice.customerName || 'Walk-in Customer'}`);
  if (customerPhone) lines.push(`Mobile: ${customerPhone}`);
  if (customerEmail) lines.push(`Email: ${customerEmail}`);
  lines.push(hr);

  (invoice.items || []).forEach((item) => {
    if (item.voided || item.isVoided) return;
    const qty = item.quantity || 0;
    const name = item.itemName || item.productName || item.name || 'Item';
    const unitPrice = parseFloat(item.unitPrice ?? item.price ?? 0);
    const lineTotal = parseFloat(item.netAmount ?? item.lineTotal ?? (qty * unitPrice));
    lines.push(`${qty}x ${name}`.slice(0, width));
    lines.push(buildFixedWidthLine(`@ ${fmt(unitPrice)}`, fmt(lineTotal), width));
    const serial = item.serialNumber || '';
    const batch = item.batchNumber || item.pinnedBatchNumber || '';
    if (serial) lines.push(`S/N: ${serial}`.slice(0, width));
    else if (batch) lines.push(`Batch: ${batch}`.slice(0, width));
  });

  lines.push(hr);
  lines.push(buildFixedWidthLine('Subtotal', fmt(invoice.subTotal), width));
  if (parseFloat(invoice.discountTotal || 0) > 0) {
    lines.push(buildFixedWidthLine('Discount', fmt(invoice.discountTotal), width));
  }
  lines.push(buildFixedWidthLine('VAT', fmt(invoice.taxTotal), width));
  lines.push(hr);
  lines.push(buildFixedWidthLine('TOTAL', fmt(invoice.invoiceTotal), width));
  if (depositApplied != null && parseFloat(depositApplied) > 0) {
    const bal = balanceDue != null ? parseFloat(balanceDue) : (parseFloat(invoice.invoiceTotal || 0) - parseFloat(depositApplied));
    lines.push(buildFixedWidthLine('Deposit Paid', `- ${fmt(depositApplied)}`, width));
    lines.push(buildFixedWidthLine('Balance Due', fmt(Math.max(0, bal)), width));
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
  const pushCentered = (value = '') => {
    const text = String(value);
    if (!text) return;
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    lines.push(`${' '.repeat(pad)}${text}`.slice(0, width));
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
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

export const buildThermalJobCardHtml = (paperSize, job, { companyName, trn, footer, showTrn }) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const jobDate = job.createdAt
    ? new Date(job.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
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
  isReturn = false,
}) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const D = `<div style="border-top:1px dashed #000;margin:4px 0"></div>`;
  const sec = t => `<div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#555;margin:4px 0 2px">${t}</div>`;
  const invNo = isReturn ? 'SR-28-042' : 'DI-28-042';
  const total = isReturn ? 'AED -1,449.00' : 'AED 102.80';

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 2px}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.row .lbl{flex:0 0 auto;white-space:nowrap}
.row .val{flex:1;text-align:right;word-break:break-word;overflow-wrap:anywhere}
</style></head><body>`;

  const srow = (l, r, bold) => `<div class="row"${bold?' style="font-weight:bold"':''}><span class="lbl">${esc(l)}</span><span class="val">${esc(r)}</span></div>`;

  if (showLogo) {
    html += logoDataUrl
      ? `<div style="text-align:center;margin:4px 0 6px"><img src="${logoDataUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`
      : `<div style="text-align:center;margin:4px 0 6px"><div style="width:52px;height:52px;border-radius:50%;border:1px solid #ccc;display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:#999">Logo</div></div>`;
  }
  html += `<div style="text-align:center;font-weight:bold;font-size:10px;margin-bottom:2px">TAX INVOICE</div>`;
  if (header) html += `<div style="text-align:center;font-size:9px;margin:2px 0">${esc(header)}</div>`;
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
    h += `<div class="row"><span class="lbl" style="font-size:10px;color:#444;padding-left:8px">@ ${unit}</span><span class="val">${total}</span></div>`;
    if (note) h += `<div style="font-size:9px;padding-left:8px;color:#555">${esc(note)}</div>`;
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
  if (stampDataUrl) {
    html += `<div style="text-align:center;margin:6px 0"><img src="${stampDataUrl}" style="height:80px;max-width:70%;object-fit:contain" alt="Stamp" /></div>`;
    html += D;
  } else if (showQRCode) {
    html += `<div style="text-align:center;margin:6px 0"><div style="width:80px;height:80px;border:1px solid #ccc;display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:#999">QR Code</div><div style="font-size:8px;color:#555;margin-top:2px">Scan to verify</div></div>`;
    html += D;
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
    html += srow('Invoice Credit:', 'AED 0.00');
    html += srow('Amount Paid:', 'AED 102.80');
    html += srow('Updated Balance:', 'AED 245.50');
    html += D;
  }
  if (showFooterText && footer) {
    html += `<div style="text-align:center;font-size:9px;margin-top:4px;white-space:pre-line">${esc(footer)}</div>`;
  }
  html += '</body></html>';
  return html;
};

export const buildPosPrintData = (full, footerNote = '') => ({
  title: 'TAX INVOICE',
  docNo: full.invoiceNumber || '',
  date: full.invoiceDate || '',
  customer: {
    name: full.customerName || 'Walk-in Customer',
    address: full.customerAddress || '',
    phone: full.customerPhone || '',
    email: full.customerEmail || '',
    trn: full.customerTrn || '',
  },
  items: (full.items || []).filter(it => !it.voided).map(it => ({
    code: it.itemCode || '',
    name: it.itemName || it.productName || '',
    desc: it.description || '',
    qty: it.quantity || 0,
    price: it.unitPrice || it.price || 0,
    disc: it.discountPercent || 0,
    tax: it.taxPercent || it.taxRate || 5,
    taxAmt: it.taxAmount || 0,
    total: it.netAmount || it.lineTotal || 0,
    batchNumber: it.batchNumber || '',
    image: it.image || '',
  })),
  totals: {
    subTotal: full.subTotal || 0,
    tax: full.taxTotal || 0,
    grandTotal: full.invoiceTotal || 0,
    discountAmount: full.discountTotal || 0,
    billDiscountAmount: full.billDiscountAmount || 0,
    footerDiscountAmount: full.footerDiscountAmount || 0,
  },
  meta: {
    notes: footerNote,
    paymentMode: full.paymentMode || '',
    location: full.branchName || '',
    salesPerson: full.posCounterName || '',
  },
});

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
