// Raw ESC/POS receipt builder. Produces a binary command stream that is sent
// byte-for-byte to the printer (via the local print agent), bypassing both the
// Chrome print pipeline and the Windows GDI driver entirely. That bypass is
// required because neither of those layers expose any hook for density/heat/
// font-table control — they just rasterize whatever the OS driver defaults to,
// which is what was producing faint, inconsistent output.

const ESC = 0x1b;
const GS = 0x1d;

// ── Low-level command bytes ────────────────────────────────────────────────
const CMD = {
  INIT: [ESC, 0x40],
  // ESC 7 n1 n2 n3 — "heating" config. This is the de-facto universal density
  // lever on the clone 58/80mm controllers (Xprinter/Gprinter/etc. families)
  // that dominate the retail thermal market; the Epson-only `GS ( E` density
  // command is not reliably implemented on those clones, so we don't send it.
  //   n1 = heating dots grouped per burst (more dots heated together = darker)
  //   n2 = heating time (higher = darker, but slower — this also doubles as
  //        the de-facto "print speed" control since ESC/POS has no standalone
  //        speed opcode on this printer class)
  //   n3 = heating interval / recovery time (lower = darker, faster repeat)
  // Values below are the documented safe maximum-darkness preset.
  SET_HEATING: (dots = 9, time = 255, interval = 2) => [ESC, 0x37, dots & 0xff, time & 0xff, interval & 0xff],
  SELECT_FONT_A: [ESC, 0x4d, 0x00],
  LINE_SPACING: (n) => [ESC, 0x33, n & 0xff],
  DEFAULT_LINE_SPACING: [ESC, 0x32],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  // GS ! n — character size. High nibble = height multiplier-1, low nibble = width multiplier-1.
  CHAR_SIZE: (w, h) => [GS, 0x21, (((w - 1) & 0x07) << 4) | ((h - 1) & 0x07)],
  CHAR_SIZE_NORMAL: [GS, 0x21, 0x00],
  // ESC t n — select character code table. 16 = WPC1252 (Western European), the
  // closest single-byte table to the Latin-1 text this app actually prints.
  CODEPAGE_WPC1252: [ESC, 0x74, 16],
  CUT_PARTIAL: [GS, 0x56, 0x01],
  FEED: (n = 1) => [ESC, 0x64, n & 0xff],
};

const PAPER_DOTS = { 58: 384, 80: 576 };
// Conservative usable text widths at Font A pitch — matches the column counts
// already calibrated for this fleet's printers in buildThermalReceiptText.
const PAPER_COLS = { 58: 32, 80: 42 };

// Max rows per GS v 0 raster block. A single very tall block (a real dithered
// logo can be 300–500+ rows) can overrun the receive/line buffer on clone
// controllers (the client's POS-80C) mid-raster — the controller then drops out
// of raster mode and prints the remaining image bytes as text, which is the
// garbage-block-above-the-receipt symptom the client reported. Splitting the
// logo into ≤240-row GS v 0 blocks (the probe proved 300 prints clean, so 240
// leaves headroom) keeps every block within a safe size; sequential blocks butt
// together seamlessly so the printed logo looks identical.
const RASTER_BAND_ROWS = 240;

class ByteWriter {
  constructor() {
    this.chunks = [];
  }
  push(bytes) {
    this.chunks.push(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
    return this;
  }
  text(str) {
    this.chunks.push(toPrinterBytes(str));
    return this;
  }
  line(str = '') {
    return this.text(str).push([0x0a]);
  }
  toUint8Array() {
    const total = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}

// CP1252-representable punctuation that NFKD normalization doesn't decompose —
// mapped to the code-page byte the printer's WPC1252 table renders natively
// (…, – — ‘ ’ “ ” • € ™) instead of degrading to '?'.
const CP1252_PUNCTUATION = {
  0x20ac: 0x80, 0x2026: 0x85, 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2122: 0x99,
};

// Converts UTF-8 JS text to single-byte printer bytes: decomposes accented
// Latin characters to their base form, drops combining marks, maps CP1252
// punctuation, and falls back to '?' for anything outside printable Latin-1
// (e.g. emoji, CJK, Arabic), since the printer's single-byte code table can't
// represent those anyway.
const toPrinterBytes = (str) => {
  const normalized = String(str ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const bytes = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    bytes[i] = (code >= 0x20 && code <= 0xff) || code === 0x0a || code === 0x0d
      ? code
      : (CP1252_PUNCTUATION[code] ?? 0x3f);
  }
  return bytes;
};

const uint8ArrayToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

// Exported for reuse by the plain-text receipt builders in posPrintUtils.js —
// keep the single implementation here so truncation/padding can't drift.
export const buildFixedWidthLine = (left, right, width) => {
  const l = String(left || '');
  const r = String(right || '');
  if (!r) return l.slice(0, width);
  const room = Math.max(1, width - r.length - 1);
  const leftTrimmed = l.length > room ? `${l.slice(0, Math.max(0, room - 1))}…` : l;
  return `${leftTrimmed}${' '.repeat(Math.max(1, width - leftTrimmed.length - r.length))}${r}`;
};

const centered = (text, width) => {
  const t = String(text || '');
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return `${' '.repeat(pad)}${t}`.slice(0, width);
};

// ── Image → monochrome raster (Floyd–Steinberg dithering) ─────────────────
const loadImage = (dataUrl) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = dataUrl;
});

// Dithers an image to 1-bit monochrome at the given dot width and returns it
// already packed into ESC/POS GS v 0 raster bit-image command bytes.
export const ditherImageToRasterCommand = async (dataUrl, targetWidthDots) => {
  const img = await loadImage(dataUrl);
  const aspect = img.naturalHeight / img.naturalWidth;
  const w = Math.min(targetWidthDots, img.naturalWidth > 0 ? targetWidthDots : targetWidthDots);
  const h = Math.max(1, Math.round(w * aspect));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // Thermal paper is white; flatten any transparency to white before dithering
  // so transparent PNG logos don't dither to black noise.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = imageData.data[o];
    const g = imageData.data[o + 1];
    const b = imageData.data[o + 2];
    const a = imageData.data[o + 3] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = lum * a + 255 * (1 - a);
  }

  // Floyd–Steinberg error diffusion → 1-bit (true=black/print).
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const old = gray[idx];
      const isBlack = old < 128;
      bits[idx] = isBlack ? 1 : 0;
      const err = old - (isBlack ? 0 : 255);
      if (x + 1 < w) gray[idx + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) gray[idx + w - 1] += (err * 3) / 16;
        gray[idx + w] += (err * 5) / 16;
        if (x + 1 < w) gray[idx + w + 1] += (err * 1) / 16;
      }
    }
  }

  const bytesPerRow = Math.ceil(w / 8);
  const raster = new Uint8Array(bytesPerRow * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bits[y * w + x]) {
        raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  // Emit the raster as a sequence of GS v 0 blocks each ≤ RASTER_BAND_ROWS tall,
  // rather than one block of the full height — see RASTER_BAND_ROWS for why one
  // tall block garbles on the POS-80C. Sequential blocks butt together
  // seamlessly (each advances the paper exactly its own height).
  const out = [];
  for (let top = 0; top < h; top += RASTER_BAND_ROWS) {
    const bandH = Math.min(RASTER_BAND_ROWS, h - top);
    const header = [GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, bandH & 0xff, (bandH >> 8) & 0xff];
    for (const b of header) out.push(b);
    const slice = raster.subarray(top * bytesPerRow, (top + bandH) * bytesPerRow);
    for (const b of slice) out.push(b);
  }
  return Uint8Array.from(out);
};

// ── Native ESC/POS QR code (GS ( k, model 2) — printer renders the QR itself,
// so quality depends on the printer's own dot accuracy rather than a rasterized
// bitmap pushed through a generic driver's halftone filter. ──────────────────

// QR byte-mode capacity at error-correction level M, indexed by version 1..40.
// Used to size the symbol BEFORE printing: a QR's width is (17 + 4·version)
// modules, and the printer renders each module `moduleSize` dots wide — if that
// exceeds the printable width, this printer class silently prints NOTHING
// (verified on the client's POS-80C). buildQrContent emits one line per sale
// item, so a large sale can push the payload past version 13 (331 bytes), which
// at the old fixed moduleSize=8 is already wider than 80mm paper.
const QR_CAPACITY_M = [
  14, 26, 42, 62, 84, 106, 122, 152, 180, 213,
  251, 287, 331, 362, 412, 450, 504, 560, 624, 666,
  711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370,
  1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331,
];

const qrModuleCount = (byteLength) => {
  const v = QR_CAPACITY_M.findIndex((cap) => byteLength <= cap);
  return 17 + 4 * ((v === -1 ? 40 : v + 1));
};

const qrCommand = (data, { moduleSize = 7, errorCorrection = 'M', maxWidthDots = 576 } = {}) => {
  const w = new ByteWriter();
  const ecLevel = { L: 48, M: 49, Q: 50, H: 51 }[errorCorrection] ?? 49;
  const dataBytes = new TextEncoder().encode(String(data || ''));
  // Shrink the module size until the whole symbol fits the paper; floor of 2
  // dots/module (below that the head can't resolve modules anyway, and even a
  // max-size v40 QR at 2 dots = 354 < 384, so it always terminates in range).
  const modules = qrModuleCount(dataBytes.length);
  let fittedModuleSize = Math.max(2, Math.min(moduleSize, Math.floor(maxWidthDots / modules)));
  w.push([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]); // select model 2
  w.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, fittedModuleSize & 0xff]); // module size
  w.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ecLevel]); // error correction
  const storeLen = dataBytes.length + 3;
  w.push([GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30]);
  w.push(dataBytes);
  w.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]); // print stored QR
  return w.toUint8Array();
};

// ── Full receipt assembly ──────────────────────────────────────────────────
export const buildEscPosReceipt = async (paperSize, invoice, {
  companyName, trn, header, footer,
  showTrn = true, isReprint = false, documentTitle = null,
  logoDataUrl = null, showLogo = true,
  showCompanyDetails = true, outletAddress = '', outletPhone = '',
  showServiceCharge = false, showVatSummary = true, showPaymentDetails = true,
  showQRCode = true, qrContent = null,
  showCustomerDetails = true,
  showFooterText = true,
  cashierName = '', terminalId = '', counterName = '',
  customerPhone = null, customerEmail = null,
  depositApplied = null, balanceDue = null,
  shippingCharge = null,
  cashGiven = null, changeAmount = null,
  showCreditBalance = false,
  creditPreviousBalance = null, creditInvoiceCredit = null,
  creditAmountPaid = null, creditUpdatedBalance = null,
  currency = 'AED',
} = {}) => {
  const mm = String(paperSize || '').includes('58') ? 58 : 80;
  const dots = PAPER_DOTS[mm];
  const width = PAPER_COLS[mm];
  const hr = '-'.repeat(width);
  const cur = currency || 'AED';
  const fmt = (n) => {
    const v = parseFloat(n) || 0;
    return `${cur} ${v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const oneLineAddress = (addr) => String(addr || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(', ');

  const w = new ByteWriter();
  w.push(CMD.INIT);
  w.push(CMD.SET_HEATING());
  w.push(CMD.CODEPAGE_WPC1252);
  w.push(CMD.SELECT_FONT_A);
  w.push(CMD.LINE_SPACING(36)); // slightly above the typical ~30 default for readability
  w.push(CMD.ALIGN_CENTER);

  // ── Logo: dithered raster, full quality (no compression of the bitmap) ──
  if (showLogo && logoDataUrl) {
    try {
      const raster = await ditherImageToRasterCommand(logoDataUrl, Math.round(dots * 0.6));
      w.push(raster);
      w.push([0x0a]);
    } catch {
      // Logo failed to decode/dither — continue without it rather than abort the print.
    }
  }

  // ── Heading: document title + company name, double width+height + bold ──
  w.push(CMD.BOLD_ON).push(CMD.CHAR_SIZE(1, 1));
  w.line(documentTitle || 'TAX INVOICE');
  if (header) { w.push(CMD.CHAR_SIZE_NORMAL).push(CMD.BOLD_OFF).line(header); w.push(CMD.BOLD_ON); }
  w.push(CMD.CHAR_SIZE(2, 2));
  w.line(companyName || '');
  w.push(CMD.CHAR_SIZE_NORMAL).push(CMD.BOLD_OFF);

  if (showCompanyDetails) {
    const addrLine = oneLineAddress(outletAddress);
    if (addrLine) w.line(addrLine);
    if (outletPhone) w.line(`Tel: ${outletPhone}`);
  }
  if (showTrn && trn) w.line(`TRN: ${trn}`);
  if (isReprint) { w.push(CMD.BOLD_ON).line('*** COPY / REPRINT ***').push(CMD.BOLD_OFF); }

  w.push(CMD.ALIGN_LEFT);
  w.line(hr);
  w.line(buildFixedWidthLine('Invoice No:', invoice.invoiceNumber || invoice.id || '', width));
  const invDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : null;
  if (invDate) w.line(buildFixedWidthLine('Date:', invDate.toLocaleString('en-GB'), width));
  if (cashierName) w.line(buildFixedWidthLine('Cashier:', cashierName, width));
  if (terminalId) w.line(buildFixedWidthLine('Terminal ID:', terminalId, width));
  if (counterName) w.line(buildFixedWidthLine('Counter:', counterName, width));
  w.line(hr);

  // Gated on the toggle alone (matches the settings preview and the HTML/browser
  // print path) — a walk-in sale still prints "Walk-in Customer" as the name when
  // this section is enabled, rather than silently dropping it regardless of the toggle.
  if (showCustomerDetails) {
    w.line(`Customer: ${invoice.customerName || 'Walk-in Customer'}`);
    if (customerPhone) w.line(`Mobile: ${customerPhone}`);
    if (customerEmail) w.line(`Email: ${customerEmail}`);
    w.line(hr);
  }

  (invoice.items || []).forEach((item) => {
    if (item.voided || item.isVoided) return;
    const qty = item.quantity || 0;
    const name = item.itemName || item.productName || item.name || 'Item';
    const unitPrice = parseFloat(item.unitPrice ?? item.price ?? 0);
    const lineTotal = parseFloat(item.netAmount ?? item.lineTotal ?? (qty * unitPrice));
    // Same per-line discount breakdown as the HTML preview (BBQA-5.3-015): base
    // price, discount %/amount, then the net line — so the ESC/POS printout
    // matches the checkout preview instead of silently reprinting a discounted
    // price as if it were the base price.
    const discountPercent = parseFloat(item.discountPercent ?? item.discount ?? 0) || 0;
    const grossAmount = parseFloat(item.grossAmount ?? (qty * unitPrice)) || 0;
    const lineDiscountAmount = parseFloat(item.discountAmount ?? Math.max(0, grossAmount - lineTotal)) || 0;
    const netUnit = qty > 0 ? lineTotal / qty : unitPrice;
    w.push(CMD.BOLD_ON).line(`${qty}x ${name}`.slice(0, width)).push(CMD.BOLD_OFF);
    if (lineDiscountAmount > 0) {
      w.line(buildFixedWidthLine(`Price @ ${fmt(unitPrice)}`, fmt(grossAmount), width));
      w.line(buildFixedWidthLine(`Discount${discountPercent > 0 ? ` (${discountPercent.toFixed(2)}%)` : ''}`, `- ${fmt(lineDiscountAmount)}`, width));
      w.line(buildFixedWidthLine(`Net @ ${fmt(netUnit)}`, fmt(lineTotal), width));
    } else {
      w.line(buildFixedWidthLine(`@ ${fmt(unitPrice)}`, fmt(lineTotal), width));
    }
    const sku = item.sku || item.itemCode || '';
    if (sku) w.line(`SKU: ${sku}`.slice(0, width));
    const serial = item.serialNumber || '';
    const batch = item.batchNumber || item.pinnedBatchNumber || '';
    if (serial) w.line(`S/N: ${serial}`.slice(0, width));
    else if (batch) w.line(`Batch: ${batch}`.slice(0, width));
  });
  w.line(hr);

  // Same Subtotal/Discount/Taxable reconstruction as the HTML preview and the
  // plain-text builder: a persisted invoice's subTotal is already the TAXABLE
  // base (net of per-item discounts, with no top-level discount aggregate), so
  // the gross subtotal and total discount are rebuilt from each line's own
  // grossAmount. Without this, a line-discounted sale printed with no Discount
  // row and a "Subtotal" that didn't match the on-screen preview.
  let resolvedSubTotal, resolvedDiscountTotal, resolvedTaxableAmount;
  if (invoice.discountTotal != null) {
    resolvedSubTotal = parseFloat(invoice.subTotal || 0) || 0;
    resolvedDiscountTotal = parseFloat(invoice.discountTotal) || 0;
    resolvedTaxableAmount = resolvedSubTotal - resolvedDiscountTotal;
  } else {
    resolvedTaxableAmount = parseFloat(invoice.subTotal || 0) || 0;
    const grossSubtotal = (invoice.items || []).reduce((sum, it) => {
      if (it.voided || it.isVoided) return sum;
      const q = it.quantity || 0;
      const unit = parseFloat(it.unitPrice ?? it.price ?? 0);
      const gross = parseFloat(it.grossAmount ?? (q * unit));
      return sum + (Number.isFinite(gross) ? gross : 0);
    }, 0);
    const lineDiscountTotal = Math.max(0, grossSubtotal - resolvedTaxableAmount);
    const billDiscountTotal = parseFloat(invoice.billDiscountAmount || 0) || 0;
    resolvedDiscountTotal = lineDiscountTotal + billDiscountTotal;
    resolvedSubTotal = grossSubtotal > 0 ? grossSubtotal : resolvedTaxableAmount;
  }

  w.line(buildFixedWidthLine('Subtotal:', fmt(resolvedSubTotal), width));
  if (resolvedDiscountTotal > 0) {
    w.line(buildFixedWidthLine('Discount:', fmt(resolvedDiscountTotal), width));
    w.line(buildFixedWidthLine('Taxable Amount:', fmt(resolvedTaxableAmount), width));
  }
  if (showServiceCharge && invoice.serviceChargeAmount) w.line(buildFixedWidthLine('Service Charge:', fmt(invoice.serviceChargeAmount), width));
  if (showVatSummary) w.line(buildFixedWidthLine(invoice.taxInclusive ? 'VAT (incl.):' : 'VAT:', fmt(invoice.taxTotal), width));
  if (parseFloat(invoice.deliveryCharge || 0) > 0) w.line(buildFixedWidthLine('Delivery Charge:', fmt(invoice.deliveryCharge), width));
  if (shippingCharge != null && parseFloat(shippingCharge) > 0) w.line(buildFixedWidthLine('Shipping:', fmt(shippingCharge), width));
  w.line(hr);

  // GS ! 0x01 (CHAR_SIZE(1,2)) doubles HEIGHT only — the character pitch stays
  // at the full 42/32 columns, so the line must be formatted to the full width
  // for the amount to right-align with the other totals rows. (Formatting to
  // width/2 here — as if the width had doubled — left TOTAL ending mid-paper.)
  w.push(CMD.BOLD_ON).push(CMD.CHAR_SIZE(1, 2));
  w.line(buildFixedWidthLine('TOTAL:', fmt(invoice.invoiceTotal), width));
  w.push(CMD.CHAR_SIZE_NORMAL).push(CMD.BOLD_OFF);

  if (depositApplied != null && parseFloat(depositApplied) > 0) {
    const bal = balanceDue != null ? parseFloat(balanceDue) : (parseFloat(invoice.invoiceTotal || 0) - parseFloat(depositApplied));
    w.line(buildFixedWidthLine('Deposit Paid:', `- ${fmt(depositApplied)}`, width));
    w.push(CMD.BOLD_ON).line(buildFixedWidthLine('Balance Due:', fmt(Math.max(0, bal)), width)).push(CMD.BOLD_OFF);
  }
  w.line(hr);

  if (showPaymentDetails) {
    if (invoice.paymentMode) w.line(buildFixedWidthLine('Payment Mode:', invoice.paymentMode, width));
    if (cashGiven != null && parseFloat(cashGiven) > 0) w.line(buildFixedWidthLine('Cash Received:', fmt(cashGiven), width));
    if (changeAmount != null && parseFloat(changeAmount) > 0) w.line(buildFixedWidthLine('Change Returned:', fmt(changeAmount), width));
    w.line(hr);
  }

  if (showQRCode && qrContent) {
    w.push(CMD.ALIGN_CENTER);
    w.push(qrCommand(qrContent, { moduleSize: mm === 58 ? 6 : 8, errorCorrection: 'M', maxWidthDots: dots }));
    w.line('Scan to verify');
    w.push(CMD.ALIGN_LEFT);
    w.line(hr);
  }

  // ── Credit account (§7): same 4-field formula as the HTML/browser path —
  // Invoice Credit is this invoice's amount, Amount Paid is what was actually
  // collected against it now, so a fully-settled cash/card sale nets to zero
  // balance change while a Credit sale carries the unpaid remainder forward.
  if (showCreditBalance && creditPreviousBalance != null) {
    const invCredit = creditInvoiceCredit != null ? creditInvoiceCredit : parseFloat(invoice.invoiceTotal || 0);
    const amtPaid = creditAmountPaid != null ? creditAmountPaid : 0;
    const updatedBal = creditUpdatedBalance != null
      ? creditUpdatedBalance
      : (parseFloat(creditPreviousBalance) + parseFloat(invCredit) - parseFloat(amtPaid));
    w.line('CREDIT ACCOUNT');
    w.line(buildFixedWidthLine('Previous Balance:', fmt(creditPreviousBalance), width));
    w.line(buildFixedWidthLine('Invoice Credit:', fmt(invCredit), width));
    w.line(buildFixedWidthLine('Amount Paid:', fmt(amtPaid), width));
    w.line(buildFixedWidthLine('Updated Balance:', fmt(updatedBal), width));
    w.line(hr);
  }

  if (showFooterText && footer) {
    w.push(CMD.ALIGN_CENTER);
    String(footer).split('\n').forEach((l) => w.line(centered(l, width)));
    w.push(CMD.ALIGN_LEFT);
  }

  w.push(CMD.FEED(3));
  w.push(CMD.CUT_PARTIAL);
  return w.toUint8Array();
};

export const buildEscPosReceiptBase64 = async (paperSize, invoice, opts) => {
  const bytes = await buildEscPosReceipt(paperSize, invoice, opts);
  return uint8ArrayToBase64(bytes);
};

export const buildEscPosTestReceipt = ({
  companyName = 'BillBull', branchName = '', terminalId = '', counterName = '',
  printerName = '', paperSize = '80mm', currency = 'AED',
} = {}) => {
  const mm = String(paperSize || '').includes('58') ? 58 : 80;
  const width = PAPER_COLS[mm];
  const hr = '-'.repeat(width);
  const w = new ByteWriter();
  w.push(CMD.INIT);
  w.push(CMD.SET_HEATING());
  w.push(CMD.CODEPAGE_WPC1252);
  w.push(CMD.SELECT_FONT_A);
  w.push(CMD.LINE_SPACING(36));
  w.push(CMD.ALIGN_CENTER);
  w.push(CMD.BOLD_ON).push(CMD.CHAR_SIZE(2, 2));
  w.line(companyName);
  w.push(CMD.CHAR_SIZE_NORMAL);
  w.line('POS PRINTER TEST');
  w.push(CMD.BOLD_OFF);
  w.line(hr);
  w.push(CMD.ALIGN_LEFT);
  if (branchName) w.line(`Branch: ${branchName}`.slice(0, width));
  if (terminalId) w.line(`Terminal: ${terminalId}`.slice(0, width));
  if (counterName) w.line(`Counter: ${counterName}`.slice(0, width));
  if (printerName) w.line(`Printer: ${printerName}`.slice(0, width));
  w.line(`Paper: ${paperSize}`.slice(0, width));
  w.line(`Currency: ${currency}`.slice(0, width));
  w.line(hr);
  w.line('Normal text — abcdefgh 0123456789');
  w.push(CMD.BOLD_ON).line('Bold text — abcdefgh').push(CMD.BOLD_OFF);
  w.push(CMD.CHAR_SIZE(2, 2)).line('Big text').push(CMD.CHAR_SIZE_NORMAL);
  w.line(hr);
  w.push(CMD.ALIGN_CENTER);
  w.line(new Date().toLocaleString('en-GB'));
  w.line('If you can read this clearly,');
  w.line('the configured printer is working.');
  w.push(CMD.FEED(3));
  w.push(CMD.CUT_PARTIAL);
  return uint8ArrayToBase64(w.toUint8Array());
};

export const escPosPaperWidthDots = (paperSize) => PAPER_DOTS[String(paperSize || '').includes('58') ? 58 : 80];

// Generic bridge for any receipt that's already rendered as fixed-width plain
// text (layaway slips, POS X/Z reports, etc.) — wraps it with the same
// init/heating/codepage preamble as the full receipt builder above so it gets
// proper density/darkness on the print head instead of falling back to the
// text/GDI agent path (which has no heat control and reads faint).
export const buildEscPosFromPlainText = (text) => {
  const w = new ByteWriter();
  w.push(CMD.INIT);
  w.push(CMD.SET_HEATING());
  w.push(CMD.CODEPAGE_WPC1252);
  w.push(CMD.SELECT_FONT_A);
  w.push(CMD.LINE_SPACING(36));
  w.push(CMD.ALIGN_LEFT);
  String(text || '').split('\n').forEach((line) => w.line(line));
  w.push(CMD.FEED(3));
  w.push(CMD.CUT_PARTIAL);
  return w.toUint8Array();
};

export const buildEscPosFromPlainTextBase64 = (text) => uint8ArrayToBase64(buildEscPosFromPlainText(text));
