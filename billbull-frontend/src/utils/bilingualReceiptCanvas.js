// Bilingual (EN/AR) thermal receipt rendered to a monochrome-ready canvas.
//
// Why canvas: the POS-80C class of printers has NO Arabic code page — the only
// way Arabic reaches thermal paper is as raster image data, and the till probes
// (docs/pos-escpos-capability-probe-2026-07-04.md) proved this printer renders
// GS v 0 rasters flawlessly at full width and heights past 255 rows. So the
// receipt body is laid out here at printer-native resolution (576 dots for
// 80mm, 384 for 58mm), letting the browser do the Arabic shaping/RTL, and
// escPosReceipt.js converts the canvas to banded GS v 0 blocks.
//
// Everything drawn here must survive a 1-bit THRESHOLD (not dithering): use
// pure black on white, and express hierarchy with size/weight — never gray.
// The QR and barcode are drawn at exact integer dots-per-module so thresholding
// cannot blur them.
import QRCode from 'qrcode';
import { RECEIPT_LABELS as L, RECEIPT_FONT_EN, RECEIPT_FONT_AR } from './receiptLabels.js';

const PAPER_DOTS = { 58: 384, 80: 576 };

// ── Code 128 (subset B) — invoice-number barcode ───────────────────────────
// Standard pattern table: each symbol is 6 alternating bar/space widths
// totalling 11 modules (stop = 13). Index = symbol value 0..106.
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const CODE128B_START = 104;
const CODE128_STOP = 106;

const code128BCodes = (text) => {
  const codes = [CODE128B_START];
  for (const ch of String(text)) {
    const v = ch.charCodeAt(0) - 32;
    if (v < 0 || v > 94) continue; // outside subset B — drop rather than corrupt the checksum
    codes.push(v);
  }
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
  codes.push(checksum % 103);
  codes.push(CODE128_STOP);
  return codes;
};

const code128Modules = (text) => code128BCodes(text).reduce((sum, c) => sum + CODE128_PATTERNS[c].split('').reduce((a, d) => a + Number(d), 0), 0);

// Inline SVG version of the same Code 128B symbol — used by the HTML preview
// twin (posPrintUtils.js) so the on-screen/browser-printed barcode is the same
// scannable symbol the thermal raster prints, not a decorative placeholder.
export const code128Svg = (text, { height = 46 } = {}) => {
  const t = String(text || '').trim();
  if (!t) return '';
  const modules = code128Modules(t);
  let x = 0;
  let rects = '';
  for (const code of code128BCodes(t)) {
    const widths = CODE128_PATTERNS[code].split('').map(Number);
    for (let i = 0; i < widths.length; i++) {
      if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${widths[i]}" height="${height}"/>`;
      x += widths[i];
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules} ${height}" preserveAspectRatio="none" style="width:90%;height:${height}px;display:block;margin:0 auto;fill:#000">${rects}</svg>`;
};

// ── Renderer ────────────────────────────────────────────────────────────────
export const renderBilingualReceiptCanvas = async (paperSize, invoice, {
  companyName, trn, header, footer,
  showTrn = true, isReprint = false, isReturn = false, documentTitle = null,
  showCompanyDetails = true,
  showLogo = true, logoDataUrl = null,
  showServiceCharge = false, showVatSummary = true, showPaymentDetails = true,
  showQRCode = true, qrContent = null,
  showCustomerDetails = true,
  showLoyaltyPoints = false,
  showFooterText = true,
  showBarcode = true,
  showDelivery = true,
  showArabic = true,
  branchName = '', saleType = '',
  outletAddress = '', outletPhone = '',
  cashierName = '', terminalId = '', counterName = '',
  customerPhone = null, customerEmail = null,
  deliveryAddress = null,
  depositApplied = null, balanceDue = null,
  shippingCharge = null,
  cashGiven = null, changeAmount = null,
  mixedCashGiven = null, mixedCardGiven = null, mixedCardType = null,
  showCreditBalance = false,
  creditPreviousBalance = null, creditInvoiceCredit = null,
  creditAmountPaid = null, creditUpdatedBalance = null,
  currency = 'AED',
} = {}) => {
  const mm = String(paperSize || '').includes('58') ? 58 : 80;
  const W = PAPER_DOTS[mm];
  const S = W / 576;                      // scale relative to the 80mm design
  const M = Math.round(10 * S);           // side margin (dots)
  const CW = W - 2 * M;                   // content width
  const cur = currency || 'AED';
  const fmt = (n) => `${cur} ${(parseFloat(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBare = (n) => (parseFloat(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const oneLine = (a) => String(a || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(', ');

  const items = (invoice.items || []).filter((it) => !it.voided && !it.isVoided);

  // Generous height estimate, cropped to the cursor at the end.
  const estH = Math.round((2600 + items.length * 200 + (showQRCode ? 500 : 0)) * S) + 800;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = estH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, estH);
  ctx.fillStyle = '#000000';

  let y = Math.round(6 * S);

  // — Font/measure/draw helpers (px values are the 80mm design sizes) —
  const px = (n) => Math.max(12, Math.round(n * S));
  const fontEn = (size, bold) => `${bold ? '700' : '500'} ${px(size)}px ${RECEIPT_FONT_EN}`;
  const fontAr = (size, bold) => `${bold ? '700' : '500'} ${px(size)}px ${RECEIPT_FONT_AR}`;

  const drawEn = (text, x, size, { bold = false, align = 'left' } = {}) => {
    ctx.font = fontEn(size, bold);
    ctx.direction = 'ltr';
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(String(text), x, y);
  };
  const drawAr = (text, x, size, { bold = false, align = 'right' } = {}) => {
    ctx.font = fontAr(size, bold);
    ctx.direction = 'rtl';
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(String(text), x, y);
  };
  const lineH = (size) => Math.round(px(size) * 1.45);

  const wrap = (text, size, bold, maxW, arabic = false) => {
    ctx.font = arabic ? fontAr(size, bold) : fontEn(size, bold);
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let curLine = '';
    for (const wd of words) {
      const probe = curLine ? `${curLine} ${wd}` : wd;
      if (ctx.measureText(probe).width <= maxW || !curLine) curLine = probe;
      else { lines.push(curLine); curLine = wd; }
    }
    if (curLine) lines.push(curLine);
    return lines;
  };

  const centerEn = (text, size, bold = false) => {
    for (const ln of wrap(text, size, bold, CW)) { drawEn(ln, W / 2, size, { bold, align: 'center' }); y += lineH(size); }
  };
  const centerAr = (text, size, bold = false) => {
    // Bilingual OFF (Show Arabic toggle) suppresses every Arabic mirror line so
    // the ESC/POS raster matches the English-only HTML/preview output.
    if (!showArabic) return;
    for (const ln of wrap(text, size, bold, CW, true)) { drawAr(ln, W / 2, size, { bold, align: 'center' }); y += lineH(size); }
  };

  const dashed = () => {
    y += Math.round(6 * S);
    ctx.fillStyle = '#000000';
    const dash = Math.round(8 * S), gap = Math.round(6 * S), h = Math.max(2, Math.round(2 * S));
    for (let x = M; x < W - M; x += dash + gap) ctx.fillRect(x, y, Math.min(dash, W - M - x), h);
    y += h + Math.round(6 * S);
  };
  const solid = (h = 3) => { ctx.fillRect(M, y, CW, Math.max(2, Math.round(h * S))); y += Math.max(2, Math.round(h * S)); };

  // Bilingual key/value row: EN label + AR label stacked left, value right
  // (on the EN label's line, like the approved template's .kv2 layout).
  const kv2 = (lbl, value, { bold = false, size = 21 } = {}) => {
    const startY = y;
    drawEn(lbl.en, M, size, { bold });
    ctx.font = fontEn(size, bold); // measure with the same font just drawn
    const enLabelW = ctx.measureText(String(lbl.en)).width;
    y += lineH(size);
    if (showArabic && lbl.ar) { drawAr(lbl.ar, M, size - 1, { align: 'left', bold: false }); y += lineH(size - 1); }
    const rowEnd = y;
    // Value: right-aligned on the EN label's line; shrink it (never below 12px
    // design size) rather than let it collide with the label.
    const gap = Math.round(8 * S);
    const maxValW = CW - enLabelW - gap;
    y = startY + Math.round(px(size) * 0.1);
    ctx.direction = 'ltr'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    let vSize = size;
    ctx.font = fontEn(vSize, true);
    while (vSize > 12 && ctx.measureText(String(value)).width > maxValW) {
      vSize -= 1;
      ctx.font = fontEn(vSize, true);
    }
    ctx.fillText(String(value), W - M, y);
    y = rowEnd + Math.round(3 * S);
  };

  const sectionTitle = (lbl) => {
    y += Math.round(4 * S);
    drawEn(lbl.en, M, 20, { bold: true });
    if (showArabic) drawAr(lbl.ar, W - M, 20, { bold: true, align: 'right' });
    y += lineH(20);
    solid(2);
    y += Math.round(4 * S);
  };

  // ── Logo (centred raster, same as Template 1) ─────────────────────────────
  // The POS-80C prints raster images cleanly; draw the logo straight onto the
  // canvas above the title so the whole receipt is one raster document. The
  // image is loaded and drawn on white so transparent PNGs stay crisp under the
  // 1-bit threshold (canvasToMonoRows), matching Template 1's logo handling.
  if (showLogo && logoDataUrl) {
    try {
      const logoImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = logoDataUrl;
      });
      const maxLogoW = Math.round(CW * 0.6);
      const maxLogoH = Math.round(180 * S);
      const ratio = logoImg.width && logoImg.height ? logoImg.width / logoImg.height : 1;
      let lw = maxLogoW;
      let lh = Math.round(lw / ratio);
      if (lh > maxLogoH) { lh = maxLogoH; lw = Math.round(lh * ratio); }
      ctx.drawImage(logoImg, Math.round((W - lw) / 2), y, lw, lh);
      y += lh + Math.round(8 * S);
    } catch { /* logo failed to decode — render without it */ }
  }

  // ── Header: title, company, address, TRN ──────────────────────────────────
  const title = documentTitle
    ? { en: documentTitle, ar: isReturn ? L.CREDIT_NOTE.ar : L.TAX_INVOICE.ar }
    : (isReturn ? L.CREDIT_NOTE : L.TAX_INVOICE);
  centerEn(title.en, 24, true);
  centerAr(title.ar, 22, true);
  if (header) { y += Math.round(2 * S); centerEn(header, 15); }
  y += Math.round(4 * S);
  centerEn(companyName || '', 26, true);
  if (showCompanyDetails) {
    const addr = oneLine(outletAddress);
    if (addr) centerEn(addr, 17);
    if (outletPhone) centerEn(`${L.TEL.en}: ${outletPhone}`, 17);
  }
  if (showTrn && trn) centerEn(`${L.TRN.en}: ${trn}`, 17);
  if (isReprint) { y += Math.round(2 * S); centerEn(L.REPRINT.en, 15, true); centerAr(L.REPRINT.ar, 14, true); }

  dashed();

  // ── Invoice meta ──────────────────────────────────────────────────────────
  // invoiceDate is date-only (no time component). Parsing it and reading back
  // a time-of-day would show a fabricated UTC-midnight time shifted by the
  // viewer's UTC offset (e.g. 00:00 UTC prints as 04:00 in Dubai), so the
  // printed Time must come from createdAt (the real sale timestamp) instead.
  const invDate = invoice.createdAt
    ? new Date(invoice.createdAt)
    : invoice.invoiceDate
      ? new Date(invoice.invoiceDate)
      : null;
  kv2(L.INVOICE_NO, invoice.invoiceNumber || invoice.id || '');
  if (invDate) {
    kv2(L.DATE, invDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
    if (invoice.createdAt) {
      kv2(L.TIME, invDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }
  if (branchName) kv2(L.BRANCH, branchName);
  if (terminalId) kv2(L.TERMINAL, terminalId);
  if (cashierName) kv2(L.CASHIER, cashierName);
  if (counterName) kv2(L.COUNTER, counterName);
  if (saleType) kv2(L.SALE_TYPE, saleType);

  // ── Customer ──────────────────────────────────────────────────────────────
  if (showCustomerDetails) {
    dashed();
    sectionTitle(L.CUSTOMER_DETAILS);
    kv2(L.NAME, invoice.customerName || L.WALK_IN.en);
    if (customerPhone) kv2(L.MOBILE, customerPhone);
    if (customerEmail) kv2(L.EMAIL, customerEmail);
    // Customer code + TRN (parity with the HTML template's Customer Details).
    const custCode = invoice.customerCode && invoice.customerCode !== 'WALK-IN' ? invoice.customerCode : '';
    if (custCode) kv2(L.CUSTOMER_CODE, custCode);
    if (invoice.customerTrn) kv2(L.CUSTOMER_TRN, invoice.customerTrn);
  }

  // ── Delivery address ──────────────────────────────────────────────────────
  if (showDelivery && deliveryAddress) {
    dashed();
    sectionTitle(L.DELIVERY_ADDRESS);
    for (const ln of wrap(oneLine(deliveryAddress), 16, false, CW)) { drawEn(ln, M, 16); y += lineH(16); }
  }

  dashed();

  // ── Items table ───────────────────────────────────────────────────────────
  sectionTitle(L.ITEM_DETAILS);
  // Column x-positions (right edges for numeric cols). AMT column removed —
  // RATE takes the rightmost slot, QTY sits to its left, freeing name width.
  const colRateX = W - M;
  const colQtyX = W - M - Math.round(120 * S);
  const nameMax = colQtyX - M - Math.round(40 * S);
  // Bilingual table head.
  drawEn(L.ITEM.en, M, 16, { bold: true });
  drawEn(L.QTY.en, colQtyX, 16, { bold: true, align: 'right' });
  drawEn(L.RATE.en, colRateX, 16, { bold: true, align: 'right' });
  y += lineH(16);
  if (showArabic) {
    drawAr(L.ITEM.ar, M, 16, { align: 'left' });
    drawAr(L.QTY.ar, colQtyX, 16);
    drawAr(L.RATE.ar, colRateX, 16);
    y += lineH(16);
  }
  solid(2);
  y += Math.round(4 * S);

  let totalQty = 0;
  for (const it of items) {
    const qty = it.quantity || 0;
    totalQty += qty;
    const name = it.itemName || it.productName || it.name || 'Item';
    const nameAr = it.localName || it.nameAr || it.arabicName || '';
    const unit = parseFloat(it.unitPrice ?? it.price ?? 0);
    const lineTotal = parseFloat(it.netAmount ?? it.lineTotal ?? (qty * unit));
    const gross = parseFloat(it.grossAmount ?? (qty * unit)) || 0;
    const discPct = parseFloat(it.discountPercent ?? it.discount ?? 0) || 0;
    // gross × discount% (backend basis) — NOT gross − net, which understates the
    // discount by the VAT-on-discount portion in VAT-exclusive mode.
    const disc = it.discountAmount != null
      ? (parseFloat(it.discountAmount) || 0)
      : (discPct > 0 ? gross * (discPct / 100) : Math.max(0, gross - lineTotal));

    const rowY = y;
    for (const ln of wrap(name, 19, true, nameMax)) { drawEn(ln, M, 19, { bold: true }); y += lineH(19); }
    if (showArabic && nameAr) for (const ln of wrap(nameAr, 18, false, nameMax, true)) { drawAr(ln, M, 18, { align: 'left' }); y += lineH(18); }
    const metaBits = [it.sku || it.itemCode ? `SKU ${it.sku || it.itemCode}` : '', disc > 0 && discPct > 0 ? `Disc ${discPct.toFixed(discPct % 1 ? 2 : 0)}%` : ''].filter(Boolean);
    const serial = it.serialNumber ? `S/N ${it.serialNumber}` : (it.batchNumber || it.pinnedBatchNumber ? `Batch ${it.batchNumber || it.pinnedBatchNumber}` : '');
    if (serial) metaBits.push(serial);
    if (metaBits.length) { drawEn(metaBits.join(' · '), M, 15); y += lineH(15); }
    if (disc > 0) { drawEn(`${L.DISCOUNT_LINE.en}: -${fmtBare(disc)}`, M, 15); y += lineH(15); }
    // Numeric columns on the first row line.
    const numY = y;
    y = rowY;
    drawEn(String(qty), colQtyX, 18, { align: 'right' });
    drawEn(fmtBare(unit), colRateX, 18, { bold: true, align: 'right' });
    y = numY + Math.round(6 * S);
  }

  // Dotted separator + counts.
  y += Math.round(2 * S);
  const dotW = Math.max(2, Math.round(2 * S));
  for (let x = M; x < W - M; x += dotW * 3) ctx.fillRect(x, y, dotW, dotW);
  y += dotW + Math.round(6 * S);
  drawEn(`${L.TOTAL_ITEMS.en}: ${items.length}`, M, 16);
  drawEn(`${L.TOTAL_QTY.en}: ${totalQty}`, colRateX, 16, { align: 'right' });
  y += lineH(16);

  dashed();

  // ── Totals (same Subtotal/Discount/Taxable reconstruction as the other
  // renderers — see posPrintUtils.js §totals for the two invoice shapes) ─────
  let subTotal, discountTotal, taxableAmount;
  if (invoice.discountTotal != null) {
    subTotal = parseFloat(invoice.subTotal || 0) || 0;
    discountTotal = parseFloat(invoice.discountTotal) || 0;
    taxableAmount = subTotal - discountTotal;
  } else {
    taxableAmount = parseFloat(invoice.subTotal || 0) || 0;
    const grossSubtotal = items.reduce((sum, it) => {
      const q = it.quantity || 0;
      const gross = parseFloat(it.grossAmount ?? (q * parseFloat(it.unitPrice ?? it.price ?? 0)));
      return sum + (Number.isFinite(gross) ? gross : 0);
    }, 0);
    const lineDiscountTotal = Math.max(0, grossSubtotal - taxableAmount);
    const billDiscountTotal = parseFloat(invoice.billDiscountAmount || 0) || 0;
    discountTotal = lineDiscountTotal + billDiscountTotal;
    subTotal = grossSubtotal > 0 ? grossSubtotal : taxableAmount;
  }

  kv2(L.SUBTOTAL, fmt(subTotal));
  if (discountTotal > 0) {
    kv2(L.DISCOUNT, `- ${fmt(discountTotal)}`);
    kv2(L.TAXABLE, fmt(taxableAmount));
  }
  if (showServiceCharge && invoice.serviceChargeAmount) kv2(L.SERVICE_CHARGE, fmt(invoice.serviceChargeAmount));
  if (showVatSummary) kv2(invoice.taxInclusive ? L.VAT_INCL : L.VAT, fmt(invoice.taxTotal));
  if (parseFloat(invoice.deliveryCharge || 0) > 0) kv2(L.DELIVERY_CHARGE, fmt(invoice.deliveryCharge));
  if (shippingCharge != null && parseFloat(shippingCharge) > 0) kv2(L.SHIPPING, fmt(shippingCharge));
  const roundOff = parseFloat(invoice.roundOff ?? invoice.roundOffAmount ?? 0) || 0;
  if (Math.abs(roundOff) >= 0.005) kv2(L.ROUND_OFF, fmt(roundOff));

  // ── TOTAL TO PAY block: double rule, stacked bilingual label, big amount ──
  y += Math.round(4 * S);
  solid(4); y += Math.round(10 * S);
  centerEn(L.TOTAL_TO_PAY.en, 20, true);
  centerAr(L.TOTAL_TO_PAY.ar, 19, true);
  y += Math.round(4 * S);
  centerEn(fmt(invoice.invoiceTotal), 42, true);
  y += Math.round(8 * S);
  solid(4);

  if (depositApplied != null && parseFloat(depositApplied) > 0) {
    y += Math.round(4 * S);
    const bal = balanceDue != null ? parseFloat(balanceDue) : (parseFloat(invoice.invoiceTotal || 0) - parseFloat(depositApplied));
    kv2(L.DEPOSIT_PAID, `- ${fmt(depositApplied)}`);
    kv2(L.BALANCE_DUE, fmt(Math.max(0, bal)), { bold: true });
  }

  // ── Payment ───────────────────────────────────────────────────────────────
  if (showPaymentDetails) {
    y += Math.round(6 * S);
    if (invoice.paymentMode) kv2(L.PAYMENT_MODE, String(invoice.paymentMode).toUpperCase());
    // Mixed (cash + card) split — surface how much was tendered on each tender so
    // the receipt reconciles with the drawer + card batch. Card row label carries
    // the card brand when known (e.g. "Card Paid (VISA)").
    const hasMixedSplit = (mixedCashGiven != null && parseFloat(mixedCashGiven) > 0) ||
      (mixedCardGiven != null && parseFloat(mixedCardGiven) > 0);
    if (hasMixedSplit) {
      if (parseFloat(mixedCashGiven) > 0) kv2(L.CASH_PAID, fmt(mixedCashGiven));
      if (parseFloat(mixedCardGiven) > 0) {
        const cardLabel = mixedCardType
          ? { en: `${L.CARD_PAID.en} (${mixedCardType})`, ar: L.CARD_PAID.ar }
          : L.CARD_PAID;
        kv2(cardLabel, fmt(mixedCardGiven));
      }
    } else if (cashGiven != null && parseFloat(cashGiven) > 0) {
      kv2(L.CASH_RECEIVED, fmt(cashGiven));
    }
    if (changeAmount != null && parseFloat(changeAmount) > 0) kv2(L.CHANGE, fmt(changeAmount), { bold: true });
  }

  // ── Credit account ────────────────────────────────────────────────────────
  if (showCreditBalance && creditPreviousBalance != null) {
    dashed();
    sectionTitle(L.ACCOUNT_BALANCE);
    const invCredit = creditInvoiceCredit != null ? creditInvoiceCredit : parseFloat(invoice.invoiceTotal || 0);
    const amtPaid = creditAmountPaid != null ? creditAmountPaid : 0;
    const updatedBal = creditUpdatedBalance != null
      ? creditUpdatedBalance
      : (parseFloat(creditPreviousBalance) + parseFloat(invCredit) - parseFloat(amtPaid));
    kv2(L.PREVIOUS_BALANCE, fmt(creditPreviousBalance));
    kv2(L.INVOICE_CREDIT, fmt(invCredit));
    kv2(L.AMOUNT_PAID, fmt(amtPaid));
    kv2(L.NEW_BALANCE, fmt(updatedBal), { bold: true });
  }

  // ── Loyalty ───────────────────────────────────────────────────────────────
  if (showLoyaltyPoints && (invoice.loyaltyPointsEarned != null || invoice.loyaltyBalance != null)) {
    dashed();
    sectionTitle(L.LOYALTY);
    if (invoice.loyaltyPointsEarned) kv2(L.POINTS_EARNED, `+${invoice.loyaltyPointsEarned} pts`);
    if (invoice.loyaltyPointsUsed) kv2(L.POINTS_USED, `${invoice.loyaltyPointsUsed} pts`);
    if (invoice.loyaltyBalance != null) kv2(L.POINTS_BALANCE, `${invoice.loyaltyBalance} pts`);
  }

  // ── VAT summary (compliance): per-rate split when the lines carry tax data ─
  if (showVatSummary && parseFloat(invoice.taxTotal || 0) >= 0) {
    dashed();
    sectionTitle(L.VAT_SUMMARY);
    // A line carries a rate under any of taxRate / taxPercent / vatPercent —
    // posted backend invoice items use `taxRate`, the checkout mock uses
    // `taxPercent`. Missing every name (never a rate field at all) means we
    // can't split, so fall back to showing only the Total VAT row.
    const rateOf = (it) => parseFloat(it.taxRate ?? it.taxPercent ?? it.vatPercent ?? 0) || 0;
    const hasLineRate = items.some((it) => it.taxRate != null || it.taxPercent != null || it.vatPercent != null);
    if (hasLineRate) {
      let std = 0, zero = 0;
      for (const it of items) {
        const rate = rateOf(it);
        // Prefer the stored per-line VAT; derive it from rate × net line value
        // when absent (the checkout preview mock has a rate but no taxAmount),
        // so Standard + Zero always reconcile with Total VAT.
        let amt = parseFloat(it.taxAmount ?? NaN);
        if (!Number.isFinite(amt)) {
          const q = it.quantity || 0;
          const gross = parseFloat(it.grossAmount ?? (q * parseFloat(it.unitPrice ?? it.price ?? 0))) || 0;
          const discPct = parseFloat(it.discountPercent ?? it.discount ?? 0) || 0;
          const disc = it.discountAmount != null ? (parseFloat(it.discountAmount) || 0) : gross * (discPct / 100);
          const net = Math.max(0, gross - disc);
          amt = invoice.taxInclusive ? net - net / (1 + rate / 100) : net * (rate / 100);
        }
        if (rate > 0) std += amt; else zero += amt;
      }
      kv2(L.VAT_STANDARD, fmtBare(std), { size: 17 });
      kv2(L.VAT_ZERO, fmtBare(zero), { size: 17 });
    }
    kv2(L.TOTAL_VAT, fmtBare(invoice.taxTotal), { bold: true, size: 18 });
  }

  dashed();

  // ── Footer messages ───────────────────────────────────────────────────────
  if (showFooterText) {
    centerEn(L.THANK_YOU.en, 19, true);
    centerAr(L.THANK_YOU.ar, 19, true);
    if (footer) {
      y += Math.round(3 * S);
      String(footer).split('\n').forEach((ln) => { if (ln.trim()) centerEn(ln.trim(), 15); });
    }
  }

  // ── Barcode (Code 128B, invoice number) ───────────────────────────────────
  const bcText = String(invoice.invoiceNumber || '').trim();
  if (showBarcode && bcText) {
    y += Math.round(8 * S);
    const modules = code128Modules(bcText);
    const mod = Math.max(1, Math.floor((CW * 0.9) / modules));
    const bcW = modules * mod;
    const bcH = Math.round(62 * S);
    let x = Math.round((W - bcW) / 2);
    for (const code of code128BCodes(bcText)) {
      const widths = CODE128_PATTERNS[code].split('').map(Number);
      for (let i = 0; i < widths.length; i++) {
        const wpx = widths[i] * mod;
        if (i % 2 === 0) ctx.fillRect(x, y, wpx, bcH); // even index = bar
        x += wpx;
      }
    }
    y += bcH + Math.round(4 * S);
    centerEn(bcText, 16);
  }

  // ── QR (drawn at exact integer dots/module so threshold keeps it crisp) ───
  if (showQRCode && qrContent) {
    y += Math.round(8 * S);
    const qrCanvas = document.createElement('canvas');
    // scale = dots per module; qrcode lib sizes the canvas to modules*scale.
    const probe = QRCode.create(String(qrContent), { errorCorrectionLevel: 'M' });
    const modCount = probe.modules.size;
    const scale = Math.max(2, Math.min(8, Math.floor((CW * 0.72) / modCount)));
    await QRCode.toCanvas(qrCanvas, String(qrContent), { errorCorrectionLevel: 'M', scale, margin: 0 });
    ctx.drawImage(qrCanvas, Math.round((W - qrCanvas.width) / 2), y);
    y += qrCanvas.height + Math.round(6 * S);
    centerEn(L.SCAN_VERIFY.en, 16);
    centerAr(L.SCAN_VERIFY.ar, 16);
  }

  // ── Brand tail line ───────────────────────────────────────────────────────
  // Present in the HTML preview twin ("BillBull Retail OS · geebu.io / Served
  // by <cashier>") but was previously absent from this raster — so the printed
  // thermal receipt dropped it (Fix 10). Draw it so preview == print.
  if (showFooterText) {
    dashed();
    centerEn('BillBull Retail OS · geebu.io', 15);
    centerEn(cashierName ? `Served by ${cashierName}` : 'Have a great day!', 15);
  }

  y += Math.round(8 * S);

  // ── Crop to content ───────────────────────────────────────────────────────
  const out = document.createElement('canvas');
  out.width = W;
  out.height = Math.min(y, estH);
  const octx = out.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0);
  return out;
};

// ── Canvas → packed 1-bit rows (threshold, NOT dithered — this is text/UI) ──
export const canvasToMonoRows = (canvas, { threshold = 160 } = {}) => {
  const w = canvas.width, h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const bpr = Math.ceil(w / 8);
  const rows = new Uint8Array(bpr * h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const o = (yy * w + xx) * 4;
      const a = data[o + 3] / 255;
      const lum = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) * a + 255 * (1 - a);
      if (lum < threshold) rows[yy * bpr + (xx >> 3)] |= 0x80 >> (xx & 7);
    }
  }
  return { rows, bpr, h };
};
