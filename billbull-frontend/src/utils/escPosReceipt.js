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
  // GS L nL nH — set the left margin (in dots); GS W nL nH — set the print-area
  // width (in dots). The receipt uses these to FORCE the full printable area every
  // print: left margin 0 and width = full paper, so no residual/stored margin can
  // shrink the usable width and clip the right-hand value column. (A previous
  // attempt used them to inset the body for centering, but on clones that honour
  // GS L yet ignore GS W the right edge then fell off the paper — so full-width,
  // zero-margin is the portable choice across Epson/GPrinter/POS-80C.)
  SET_LEFT_MARGIN: (dots) => [GS, 0x4c, dots & 0xff, (dots >> 8) & 0xff],
  SET_PRINT_AREA_WIDTH: (dots) => [GS, 0x57, dots & 0xff, (dots >> 8) & 0xff],
  // GS ! n — character size. High nibble = height multiplier-1, low nibble = width multiplier-1.
  CHAR_SIZE: (w, h) => [GS, 0x21, (((w - 1) & 0x07) << 4) | ((h - 1) & 0x07)],
  CHAR_SIZE_NORMAL: [GS, 0x21, 0x00],
  // ESC t n — select character code table. 16 = WPC1252 (Western European), the
  // closest single-byte table to the Latin-1 text this app actually prints.
  CODEPAGE_WPC1252: [ESC, 0x74, 16],
  CUT_PARTIAL: [GS, 0x56, 0x01],
  // GS V 66 n — "feed n dots, then partial cut" (function B). Unlike GS V 1,
  // which cuts at the CURRENT paper position, this atomically advances the paper
  // by n dots first, so the just-printed tail clears the blade before the cut.
  // The cutter on this printer class sits well above the print head (~11–15mm),
  // so a plain cut lands mid-content and the last line(s) roll onto the NEXT
  // receipt (client item 4). n is the head→cutter clearance in dots.
  CUT_PARTIAL_FEED: (n) => [GS, 0x56, 66, n & 0xff],
  FEED: (n = 1) => [ESC, 0x64, n & 0xff],
  // ESC J n — print and feed the paper n × vertical motion units, WITHOUT
  // touching the ESC 3 line-spacing register. Used for small one-off breathing
  // room (around section dividers, before/after TOTAL) that shouldn't change
  // the uniform per-line pitch every other line on the receipt uses.
  FEED_DOTS: (n) => [ESC, 0x4a, n & 0xff],
};

const PAPER_DOTS = { 58: 384, 80: 576 };
// FULL Font-A character capacity per paper width — the canonical ESC/POS values
// (Font A cell = 12 dots wide, so 576/12 = 48 cols @ 80mm, 384/12 = 32 @ 58mm).
// These are the SAME on every ESC/POS printer (Epson, GPrinter, POS-80C, clones),
// so building lines to this width uses the whole printable area without overflow.
// The receipt was previously built to a "conservative" 42/32 which both wasted
// ~6 columns on 80mm AND — once a hardware left-margin was added — pushed the
// right-hand value column off the printable area on printers that ignore GS W,
// clipping TOTAL/VAT/Discount/credit-account values. Using the true full width
// and no hardware margin fixes the clipping and the under-utilisation together.
const PAPER_COLS = { 58: 32, 80: 48 };

// ── Shared symmetric page margin (SOFTWARE gutter, no GS L / GS W) ───────────
// Every 80mm/58mm ESC/POS print (sales receipt, delivery, reprint, customer
// receipt, receive advance, statement, X/Z report, layaway) centres its content
// with an EQUAL left+right gutter — instead of printing flush to the left edge.
//
// IMPORTANT: the margin is NOT done with the ESC/POS `GS L` (left margin) / `GS W`
// (print-area width) commands. Those clone printers mis-handle `GS W`: the client's
// POS-80C swallowed `GS`+one byte and PRINTED the width payload as text — e.g.
// `GS W 552` = 1D 57 [28 02] surfaced a stray "(" (0x28) above the logo. So the
// gutter is applied purely in SOFTWARE:
//   • left-aligned rows are prefixed with MARGIN_COLS spaces (LEFT_GUTTER),
//   • content is built to usableColsFor() = PAPER_COLS − 2·MARGIN_COLS, so
//     gutter + content leaves an equal MARGIN_COLS gap on the right → symmetric,
//   • centred content (logo/title/company/Arabic/QR rasters) is centred natively
//     by the printer's ESC a 1 (ALIGN_CENTER), sized to usableDotsFor() so it sits
//     inside the gutters.
// This works identically on every printer (no capability dependency) and can never
// leak command bytes as text. buildFixedWidthLine still trims only the LEFT label
// (never the right value), so right-aligned values can't clip at the reduced width.
const MARGIN_COLS = 1;
// One column of dots (Font-A cell = 12 dots) per margin column, per paper size.
const marginDotsFor = (mm) => MARGIN_COLS * Math.round(PAPER_DOTS[mm] / PAPER_COLS[mm]);
// Usable column count after the symmetric gutter — the value every fixed-width line
// and horizontal rule is built to.
const usableColsFor = (mm) => PAPER_COLS[mm] - 2 * MARGIN_COLS;
// Usable dot span after the symmetric gutter — what rasters (logo/Arabic/QR/stamp)
// are sized to so they centre inside the gutters and don't clip on the right.
const usableDotsFor = (mm) => PAPER_DOTS[mm] - 2 * marginDotsFor(mm);
// The left-gutter space prefix for left-aligned rows (MARGIN_COLS spaces). Same
// for both paper sizes; a `mm` arg is accepted for call-site symmetry but unused.
const leftGutterFor = (_mm) => ' '.repeat(MARGIN_COLS);

// ── Vertical rhythm (readability spacing, no layout/width changes) ─────────
// The receipt body's per-line pitch comes from the ESC 3 LINE_SPACING register
// (set once, applies to every LF uniformly); these are small ESC J dot-feeds
// layered on top at specific structural points so sections read as distinct
// blocks instead of a cramped wall of text — same content, same columns, same
// alignment, just more breathing room.
const BODY_LINE_SPACING = 34; // was 30 — a few extra dots between every line
const SECTION_GAP_DOTS = 10; // extra gap before/after every horizontal rule
const ITEM_GAP_DOTS = 8; // extra gap between one product block and the next
const NAME_GAP_DOTS = 6; // small gap under the bold product name, above its price rows
const TOTAL_GAP_BEFORE_DOTS = 16; // extra gap before TOTAL so it stands out
const TOTAL_GAP_AFTER_DOTS = 12; // extra gap after TOTAL, before Payment Mode

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
  // Left-gutter line: prefixes `gutter` spaces so left-aligned content sits inside
  // the symmetric software margin (see leftGutterFor). Used for every label/value
  // row and horizontal rule; centred content uses the native ALIGN_CENTER instead.
  gline(gutter, str = '') {
    return this.text(`${gutter}${str}`).push([0x0a]);
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

// Emits a horizontal rule with a small ESC J dot-feed before and after it, so
// every section boundary (header/invoice-info/items/totals/payment/customer/
// credit-account) reads as a deliberate break rather than a cramped line —
// used at every `hr` emission instead of a bare gline. before/after are
// overridable per call-site for the spots that need extra emphasis (the rule
// immediately above/below TOTAL).
const emitDivider = (w, gutter, hr, { before = SECTION_GAP_DOTS, after = SECTION_GAP_DOTS } = {}) => {
  w.push(CMD.FEED_DOTS(before));
  w.gline(gutter, hr);
  w.push(CMD.FEED_DOTS(after));
};

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

// Per-line discount amount for receipts, using the SAME basis as the backend
// (SalesInvoiceService.normalizeInvoiceItemFinancials: discountAmount = gross ×
// discountPercent / 100). Exported so every receipt renderer shares one formula.
//
// The historical `gross − netAmount` shortcut was wrong in VAT-EXCLUSIVE mode:
// there netAmount = taxable + added VAT, so gross − net subtracted the VAT-on-
// discount too, understating the discount (a 10% discount on a 1,000 line showed
// as 55.00 instead of 100.00, and the per-line rows no longer summed to the
// invoice "Discount" total). Prefer an explicit discountAmount if the caller
// provides one; else compute from the percentage; else fall back to gross − net.
export const resolveLineDiscount = (item, grossAmount, discountPercent, lineTotal) => {
  if (item && item.discountAmount != null) return parseFloat(item.discountAmount) || 0;
  if (discountPercent > 0) return grossAmount * (discountPercent / 100);
  return Math.max(0, grossAmount - lineTotal);
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

// Word-wraps text into lines that never exceed `width` printable columns, so a
// long product name flows onto extra lines instead of being truncated (req 8) or
// overflowing the paper (req 9/15). Continuation lines (2nd onward) are prefixed
// with `indent` so the wrapped name stays visually attached to its item without
// disturbing the separate right-aligned price rows beneath it. A single word
// longer than the usable width is hard-split so it still can't overflow.
export const wrapToWidth = (text, width, indent = '') => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  const cap = () => width - (lines.length ? indent.length : 0);
  const flush = () => { lines.push((lines.length ? indent : '') + cur); cur = ''; };
  for (let wd of words) {
    // Hard-split a word that can't fit on a line by itself.
    while (wd.length > cap() - (cur ? cur.length + 1 : 0) && wd.length > cap()) {
      if (cur) flush();
      const head = wd.slice(0, cap());
      lines.push((lines.length ? indent : '') + head);
      wd = wd.slice(head.length);
    }
    const probe = cur ? `${cur} ${wd}` : wd;
    if (probe.length <= cap()) cur = probe;
    else { flush(); cur = wd; }
  }
  if (cur || !lines.length) flush();
  return lines;
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

  // Emit ONE GS v 0 block of the full image height. The POS-80C probe
  // (docs/pos-escpos-capability-probe-2026-07-04.md, button-4 "real logo")
  // proved a single full-height block of THIS exact logo at THIS exact width
  // (346 dots, ~250–350 rows) prints clean — while splitting it into multiple
  // sequential GS v 0 blocks garbled the output (the printer does not resume
  // raster mode cleanly across a mid-stream second GS v 0 header, so the second
  // block's bytes print as text). So keep it a single block.
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = h & 0xff;
  const yH = (h >> 8) & 0xff;
  const header = [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH];
  return Uint8Array.from([...header, ...raster]);
};

// Packs a 1-bit black/white bitmap (row-major, true = black/print) into a single
// ESC/POS GS v 0 raster block — the same command the logo/stamp use, proven clean
// on the POS-80C. Shared by the image ditherer above and the text rasteriser below.
const packBitmapToRasterCommand = (bits, w, h) => {
  const bytesPerRow = Math.ceil(w / 8);
  const raster = new Uint8Array(bytesPerRow * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bits[y * w + x]) raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = h & 0xff;
  const yH = (h >> 8) & 0xff;
  return Uint8Array.from([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...raster]);
};

// True when a string contains any character the printer's single-byte WPC1252
// code page cannot render (Arabic, CJK, emoji, …). Latin-1 + the CP1252
// punctuation we map are fine; anything else must be rendered as a bitmap.
// NFKD-normalise first so accented Latin (which decomposes to base+mark) isn't
// misflagged — toPrinterBytes already handles those as text.
const hasNonPrintableLatin = (str) => {
  const normalized = String(str ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const ok = (code >= 0x20 && code <= 0xff) || code === 0x0a || code === 0x0d
      || CP1252_PUNCTUATION[code] != null;
    if (!ok) return true;
  }
  return false;
};

// Arabic Unicode blocks — used to switch the raster canvas to RTL so shaping and
// direction come out correct for Arabic company names / header lines. Written as
// \u escapes (not literal glyphs) so no invisible/irregular characters end up in
// the source: Arabic (0600–06FF), Supplement (0750–077F), Extended-A (08A0–08FF),
// Presentation Forms-A (FB50–FDFF) and -B (FE70–FEFF).
const hasArabic = (str) => /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/.test(String(str ?? ""));

// Renders a single line of text to a monochrome GS v 0 raster so scripts the
// printer's code page can't represent (Arabic, etc.) print correctly instead of
// as '?' (client item 6). Canvas fillText handles Arabic shaping/RTL natively.
// A hard black/white threshold (not dithering) keeps glyph edges crisp. Returns
// null on any failure so the caller can fall back to plain text bytes.
const renderTextLineToRasterCommand = (text, { widthDots, fontPx = 28, bold = false, align = 'center', rtl = false } = {}) => {
  try {
    const canvas = document.createElement('canvas');
    const pad = Math.round(fontPx * 0.3);
    canvas.width = widthDots;
    canvas.height = fontPx + pad * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = `${bold ? 'bold ' : ''}${fontPx}px 'Segoe UI', 'Tahoma', 'Arial', sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = align;
    const x = align === 'center' ? canvas.width / 2 : (align === 'right' ? canvas.width - pad : pad);
    ctx.fillText(String(text ?? ''), x, canvas.height / 2);

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bits = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < bits.length; i++) {
      const o = i * 4;
      const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      bits[i] = lum < 160 ? 1 : 0; // black where a glyph was drawn
    }
    return packBitmapToRasterCommand(bits, canvas.width, canvas.height);
  } catch {
    return null;
  }
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

// ── Shared branded header ───────────────────────────────────────────────────
// Emits the SAME company header the POS Sales receipt prints — dithered logo
// raster, document title, bold company name, one-line address, Tel and TRN — into
// an existing ByteWriter `w`, ending with the horizontal divider. Extracted so
// every 80mm print (POS Sales receipt, Customer Receipt, Receive Advance,
// Customer Statement, X/Z reports) shares one identical header instead of each
// path re-emitting its own plain-text company block. The writer must already be
// initialised (INIT/heating/codepage/font); this only handles alignment for the
// header region and restores ALIGN_LEFT before returning.
//   `documentTitle` is the bold heading (e.g. 'TAX INVOICE', 'PAYMENT RECEIPT',
//   'CUSTOMER STATEMENT', 'X-REPORT / SESSION CLOSE REPORT').
// Returns nothing; mutates `w`.
export const emitEscPosBrandedHeader = async (w, {
  paperSize = '80mm',
  documentTitle = '',
  companyName = '',
  header = '',
  trn = '',
  outletAddress = '',
  outletPhone = '',
  logoDataUrl = null,
  showLogo = true,
  showCompanyDetails = true,
  showTrn = true,
  isReprint = false,
} = {}) => {
  const mm = String(paperSize || '').includes('58') ? 58 : 80;
  // Usable width/dots so the header centres inside the same symmetric software
  // gutters as the body. Centred lines use the printer's ALIGN_CENTER; the only
  // left-aligned line here (the divider) is prefixed with the left gutter.
  const width = usableColsFor(mm);
  const gutter = leftGutterFor(mm);
  const hr = '-'.repeat(width);
  const printableDots = usableDotsFor(mm);
  const oneLineAddress = (addr) => String(addr || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(', ');

  // Same centred-text emitter the receipt body uses: crisp ESC/POS text for the
  // Latin case, canvas raster for Arabic/other non-Latin-1 so glyphs render.
  const emitCenteredText = (str, { fontPx = 26, bold = false } = {}) => {
    const text = String(str ?? '');
    if (!text) return;
    if (!hasNonPrintableLatin(text)) { w.line(text); return; }
    const raster = renderTextLineToRasterCommand(text, {
      widthDots: Math.round(printableDots * 0.92), fontPx, bold, align: 'center', rtl: hasArabic(text),
    });
    if (raster) { w.push(raster); w.push([0x0a]); } else { w.line(text); }
  };

  w.push(CMD.ALIGN_CENTER);

  // Logo: dithered raster, full quality. Flush a text line first (see the note in
  // buildEscPosReceipt — a raster as the very first printable content garbles on
  // some clones).
  if (showLogo && logoDataUrl) {
    try {
      const raster = await ditherImageToRasterCommand(logoDataUrl, Math.round(printableDots * 0.6));
      w.line(' ');
      w.push(raster);
      w.push([0x0a]);
    } catch { /* logo failed to decode/dither — print without it */ }
  }

  if (documentTitle) {
    w.push(CMD.BOLD_ON);
    w.line(documentTitle);
    w.push(CMD.BOLD_OFF);
  }
  if (header) { emitCenteredText(header, { fontPx: 24 }); }
  if (hasNonPrintableLatin(companyName || '')) {
    emitCenteredText(companyName, { fontPx: 28, bold: true });
  } else {
    w.push(CMD.BOLD_ON);
    w.line(companyName || '');
    w.push(CMD.BOLD_OFF);
  }
  if (showCompanyDetails) {
    const addrLine = oneLineAddress(outletAddress);
    if (addrLine) emitCenteredText(addrLine, { fontPx: 22 });
    if (outletPhone) emitCenteredText(`Tel: ${outletPhone}`, { fontPx: 22 });
  }
  if (showTrn && trn) emitCenteredText(`TRN: ${trn}`, { fontPx: 22 });
  if (isReprint) { w.push(CMD.BOLD_ON).line('*** COPY / REPRINT ***').push(CMD.BOLD_OFF); }

  w.push(CMD.ALIGN_LEFT);
  emitDivider(w, gutter, hr);
};

// Bridge for reports/vouchers already rendered as fixed-width plain text
// (Customer Receipt, Receive Advance, Customer Statement, X/Z reports): prepends
// the SAME branded header the POS Sales receipt uses (logo + company block), then
// appends the caller's plain-text body. The body should be built WITHOUT its own
// plain-text company header (pass omitHeader: true to the text builder) so the
// branded header isn't duplicated. Same init/heating/codepage preamble + cut as
// buildEscPosFromPlainText, so it gets proper density on the print head.
export const buildEscPosDocument = async (bodyText, headerOpts = {}) => {
  const mm = String(headerOpts.paperSize || '80mm').includes('58') ? 58 : 80;
  const gutter = leftGutterFor(mm);
  const w = new ByteWriter();
  w.push(CMD.INIT);
  w.push(CMD.SET_HEATING());
  w.push(CMD.CODEPAGE_WPC1252);
  w.push(CMD.SELECT_FONT_A);
  // Reports/statements read best with the airier 36/203" spacing (matches the
  // X/Z report the client approved); the denser receipt body uses 30 elsewhere.
  w.push(CMD.LINE_SPACING(36));
  await emitEscPosBrandedHeader(w, headerOpts);
  w.push(CMD.ALIGN_LEFT);
  // Body is built to usableColsFor(); prefix the left gutter so it sits inside the
  // symmetric software margin (no GS L / GS W — see the MARGIN_COLS note).
  String(bodyText || '').split('\n').forEach((line) => w.gline(gutter, line));
  // X/Z reports and statements can be long; feed enough that the LAST section
  // (footer / generated timestamp / cashier attribution) fully clears the blade
  // before cutting, then feed-then-cut (GS V 66 n) so nothing is chopped off.
  w.push(CMD.FEED(2));
  w.push(CMD.CUT_PARTIAL_FEED(mm === 58 ? 100 : 120));
  return w.toUint8Array();
};

export const buildEscPosDocumentBase64 = async (bodyText, headerOpts = {}) =>
  uint8ArrayToBase64(await buildEscPosDocument(bodyText, headerOpts));

// ── Full receipt assembly ──────────────────────────────────────────────────
export const buildEscPosReceipt = async (paperSize, invoice, {
  companyName, trn, header, footer,
  showTrn = true, isReprint = false, documentTitle = null,
  logoDataUrl = null, showLogo = true,
  showCompanyDetails = true, outletAddress = '', outletPhone = '',
  showServiceCharge = false, showVatSummary = true, showPaymentDetails = true,
  showQRCode = true, qrContent = null,
  // Social/stamp image (data URL). When present it is printed INSTEAD of the QR
  // (client item 8) — mirrors buildThermalReceiptHtml's stamp-vs-QR precedence.
  stampDataUrl = null,
  // 'before' | 'after' — QR/stamp placement relative to the footer text (§4),
  // same semantics as the HTML preview.
  qrPlacement = 'before',
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
  // Symmetric SOFTWARE gutter (see MARGIN_COLS): the receipt is centred with an
  // equal left/right gutter rather than printed flush-left. Every fixed-width line
  // + rule is built to the USABLE column count (PAPER_COLS − 2·MARGIN_COLS) and
  // emitted through w.gline(gutter, …) which prefixes MARGIN_COLS spaces — so the
  // content occupies [gutter | usable | gutter] and the right-hand value column
  // lands one gutter short of the paper edge. buildFixedWidthLine trims only the
  // LEFT label (never the right value), so long values (TOTAL/VAT/credit account)
  // never clip. No GS L / GS W is used (they leaked a stray "(" on the client's
  // POS-80C — see the MARGIN_COLS note), so this is printer-independent.
  const width = usableColsFor(mm);
  const gutter = leftGutterFor(mm);
  const hr = '-'.repeat(width);
  // Rasters (logo, Arabic text lines, QR, stamp) are sized to the usable dot span
  // so they centre inside the gutters; the per-block scale factors keep breathing room.
  const printableDots = usableDotsFor(mm);
  const cur = currency || 'AED';
  const fmt = (n) => {
    const v = parseFloat(n) || 0;
    return `${cur} ${v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const w = new ByteWriter();

  // Emits a centered line that may contain Arabic/other non-Latin-1 text (client
  // item 6). If the text is all printable-Latin it prints as normal ESC/POS text
  // (crisp, fast); otherwise it's rasterised via canvas so the glyphs actually
  // render instead of degrading to '?'. Assumes the writer is already centered.
  // fontPx scales the raster glyph height; bold thickens it. Falls back to plain
  // text bytes if canvas rasterisation fails, so a line always prints something.
  const emitCenteredText = (str, { fontPx = 26, bold = false } = {}) => {
    const text = String(str ?? '');
    if (!text) return;
    if (!hasNonPrintableLatin(text)) { w.line(text); return; }
    const raster = renderTextLineToRasterCommand(text, {
      widthDots: Math.round(printableDots * 0.92), fontPx, bold, align: 'center', rtl: hasArabic(text),
    });
    if (raster) { w.push(raster); w.push([0x0a]); } else { w.line(text); }
  };

  w.push(CMD.INIT);
  w.push(CMD.SET_HEATING());
  w.push(CMD.CODEPAGE_WPC1252);
  w.push(CMD.SELECT_FONT_A);
  // NO GS L / GS W here — the symmetric margin is a software gutter (see the
  // MARGIN_COLS note): those commands leaked their width payload as a stray "("
  // on the client's POS-80C. Left margin comes from w.gline(gutter, …) prefixes;
  // centred header/QR content is centred natively by ESC a 1.
  // Uniform line spacing for even vertical rhythm between sections (req 4/12).
  // BODY_LINE_SPACING (34/203") adds a few dots over the printer's own default
  // single spacing on every line — enough to de-cramp the receipt without
  // reading as airy as the 36 used for reports/statements.
  w.push(CMD.LINE_SPACING(BODY_LINE_SPACING));

  // ── Branded header (logo + title + company name + address/phone/TRN + divider)
  // Shared with the Customer Receipt / Receive Advance / Customer Statement /
  // X-Z report prints via emitEscPosBrandedHeader, so all 80mm output carries the
  // identical company header. Title defaults to TAX INVOICE for the sales receipt.
  await emitEscPosBrandedHeader(w, {
    paperSize,
    documentTitle: documentTitle || 'TAX INVOICE',
    companyName, header, trn,
    outletAddress, outletPhone,
    logoDataUrl, showLogo, showCompanyDetails, showTrn, isReprint,
  });
  w.gline(gutter, buildFixedWidthLine('Invoice No:', invoice.invoiceNumber || invoice.id || '', width));
  const invDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : null;
  if (invDate) w.gline(gutter, buildFixedWidthLine('Date:', invDate.toLocaleString('en-GB'), width));
  if (cashierName) w.gline(gutter, buildFixedWidthLine('Cashier:', cashierName, width));
  if (terminalId) w.gline(gutter, buildFixedWidthLine('Terminal ID:', terminalId, width));
  if (counterName) w.gline(gutter, buildFixedWidthLine('Counter:', counterName, width));
  emitDivider(w, gutter, hr);

  // NOTE: the customer block is intentionally NOT here. The checkout preview
  // (buildThermalReceiptHtml / ThermalMock — the design source of truth) renders
  // CUSTOMER as a labeled section down near the bottom, AFTER payment details and
  // BEFORE the credit-account block — not inline above the line items. It is
  // emitted in that position further down (client item 4: detail ordering).

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
    // gross × discount% (backend basis), NOT gross − net — see resolveLineDiscount.
    const lineDiscountAmount = resolveLineDiscount(item, grossAmount, discountPercent, lineTotal);
    const netUnit = qty > 0 ? lineTotal / qty : unitPrice;
    // Item block hierarchy matches the preview (client item 5): the "Qty x Name"
    // header sits flush left, while every detail line beneath it (price/discount/
    // net, SKU, serial/batch) is indented one character — mirroring the preview's
    // padding-left:8px on those rows — so the block reads as an indented sub-list
    // rather than a flat wall of left-flush text. IND is prefixed to the LEFT side
    // only; the right-hand value column still aligns to `width`, exactly like the
    // preview keeps the amount column fixed while indenting the label.
    const IND = ' ';
    const detailRow = (left, right) => w.gline(gutter, buildFixedWidthLine(`${IND}${left}`, right, width));
    const detailLine = (text) => w.gline(gutter, `${IND}${text}`.slice(0, width));
    // Product name: wrap across as many lines as needed (req 8) instead of
    // truncating. Continuation lines indent under the name so the block stays
    // readable; the right-aligned price rows below are emitted separately, so
    // wrapping the name never shifts a price out of its column.
    w.push(CMD.BOLD_ON);
    for (const ln of wrapToWidth(`${qty}x ${name}`, width, '   ')) w.gline(gutter, ln);
    w.push(CMD.BOLD_OFF);
    w.push(CMD.FEED_DOTS(NAME_GAP_DOTS));
    if (lineDiscountAmount > 0) {
      detailRow(`Price @ ${fmt(unitPrice)}`, fmt(grossAmount));
      detailRow(`Discount${discountPercent > 0 ? ` (${discountPercent.toFixed(2)}%)` : ''}`, `- ${fmt(lineDiscountAmount)}`);
      detailRow(`Net @ ${fmt(netUnit)}`, fmt(lineTotal));
    } else {
      detailRow(`@ ${fmt(unitPrice)}`, fmt(lineTotal));
    }
    const sku = item.sku || item.itemCode || '';
    if (sku) detailLine(`SKU: ${sku}`);
    const serial = item.serialNumber || '';
    const batch = item.batchNumber || item.pinnedBatchNumber || '';
    if (serial) detailLine(`S/N: ${serial}`);
    else if (batch) detailLine(`Batch: ${batch}`);
    w.push(CMD.FEED_DOTS(ITEM_GAP_DOTS));
  });
  emitDivider(w, gutter, hr);

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

  w.gline(gutter, buildFixedWidthLine('Subtotal:', fmt(resolvedSubTotal), width));
  if (resolvedDiscountTotal > 0) {
    w.gline(gutter, buildFixedWidthLine('Discount:', fmt(resolvedDiscountTotal), width));
    w.gline(gutter, buildFixedWidthLine('Taxable Amount:', fmt(resolvedTaxableAmount), width));
  }
  if (showServiceCharge && invoice.serviceChargeAmount) w.gline(gutter, buildFixedWidthLine('Service Charge:', fmt(invoice.serviceChargeAmount), width));
  if (showVatSummary) w.gline(gutter, buildFixedWidthLine(invoice.taxInclusive ? 'VAT (incl.):' : 'VAT:', fmt(invoice.taxTotal), width));
  if (parseFloat(invoice.deliveryCharge || 0) > 0) w.gline(gutter, buildFixedWidthLine('Delivery Charge:', fmt(invoice.deliveryCharge), width));
  if (shippingCharge != null && parseFloat(shippingCharge) > 0) w.gline(gutter, buildFixedWidthLine('Shipping:', fmt(shippingCharge), width));
  emitDivider(w, gutter, hr, { after: 0 });

  // TOTAL emphasis (req 10): CHAR_SIZE(1,2) doubles HEIGHT only — the character
  // pitch stays at the full column count, so the row is still formatted to `width`
  // and the amount right-aligns cleanly with the totals rows above. (Formatting to
  // width/2 — as if the width had doubled — would leave TOTAL ending mid-paper.)
  // Extra dot-feed above sets the block clearly apart from the totals list.
  w.push(CMD.FEED(1));
  w.push(CMD.FEED_DOTS(TOTAL_GAP_BEFORE_DOTS));
  w.push(CMD.BOLD_ON).push(CMD.CHAR_SIZE(1, 2));
  w.gline(gutter, buildFixedWidthLine('TOTAL:', fmt(invoice.invoiceTotal), width));
  w.push(CMD.CHAR_SIZE_NORMAL).push(CMD.BOLD_OFF);

  if (depositApplied != null && parseFloat(depositApplied) > 0) {
    const bal = balanceDue != null ? parseFloat(balanceDue) : (parseFloat(invoice.invoiceTotal || 0) - parseFloat(depositApplied));
    w.gline(gutter, buildFixedWidthLine('Deposit Paid:', `- ${fmt(depositApplied)}`, width));
    w.push(CMD.BOLD_ON).gline(gutter, buildFixedWidthLine('Balance Due:', fmt(Math.max(0, bal)), width)).push(CMD.BOLD_OFF);
  }
  // Extra gap after the TOTAL amount, before the Payment Mode section below.
  emitDivider(w, gutter, hr, { before: TOTAL_GAP_AFTER_DOTS });

  if (showPaymentDetails) {
    if (invoice.paymentMode) w.gline(gutter, buildFixedWidthLine('Payment Mode:', invoice.paymentMode, width));
    if (cashGiven != null && parseFloat(cashGiven) > 0) w.gline(gutter, buildFixedWidthLine('Cash Received:', fmt(cashGiven), width));
    if (changeAmount != null && parseFloat(changeAmount) > 0) w.gline(gutter, buildFixedWidthLine('Change Returned:', fmt(changeAmount), width));
    emitDivider(w, gutter, hr);
  }

  // ── Customer (§6, client item 4): labeled CUSTOMER section — Name/Mobile/Email —
  // placed here (after payment, before credit account) to match the checkout
  // preview / A4 template ordering, not inline above the line items. Uses the
  // same "CUSTOMER" section label + Name: row the HTML preview uses.
  if (showCustomerDetails) {
    w.push(CMD.BOLD_ON).gline(gutter, 'CUSTOMER').push(CMD.BOLD_OFF);
    w.gline(gutter, buildFixedWidthLine('Name:', invoice.customerName || 'Walk-in Customer', width));
    if (customerPhone) w.gline(gutter, buildFixedWidthLine('Mobile:', customerPhone, width));
    if (customerEmail) w.gline(gutter, buildFixedWidthLine('Email:', customerEmail, width));
    emitDivider(w, gutter, hr);
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
    w.push(CMD.BOLD_ON).gline(gutter, 'CREDIT ACCOUNT').push(CMD.BOLD_OFF);
    w.gline(gutter, buildFixedWidthLine('Previous Balance:', fmt(creditPreviousBalance), width));
    w.gline(gutter, buildFixedWidthLine('Invoice Credit:', fmt(invCredit), width));
    w.gline(gutter, buildFixedWidthLine('Amount Paid:', fmt(amtPaid), width));
    w.push(CMD.BOLD_ON).gline(gutter, buildFixedWidthLine('Updated Balance:', fmt(updatedBal), width)).push(CMD.BOLD_OFF);
    emitDivider(w, gutter, hr);
  }

  // ── QR / social image (§4+§5, client items 3+8) ─────────────────────────────
  // Mirrors the checkout preview's mutually-exclusive rule EXACTLY: if a social/
  // stamp image is uploaded, print THAT image (raster) and NOT the QR; otherwise
  // print the native QR. Placement honours qrPlacement ('before' | 'after' the
  // footer text), same as buildThermalReceiptHtml. Built as a closure so it can
  // be emitted before OR after the footer without duplicating the logic.
  const emitQrOrStamp = async () => {
    if (stampDataUrl) {
      // Social/stamp image takes priority over the QR (client item 8). Render it
      // through the same proven-clean GS v 0 raster path used for the logo.
      try {
        w.push(CMD.ALIGN_CENTER);
        const stampRaster = await ditherImageToRasterCommand(stampDataUrl, Math.round(printableDots * 0.5));
        w.line(' '); // flush line before raster (POS-80C raster-first workaround)
        w.push(stampRaster);
        w.push([0x0a]);
        w.push(CMD.ALIGN_LEFT);
        emitDivider(w, gutter, hr);
      } catch {
        // Stamp failed to decode/dither — skip it rather than abort the print.
      }
      return;
    }
    if (showQRCode && qrContent) {
      w.push(CMD.ALIGN_CENTER);
      // Keep the QR centred with clear breathing room above and below (req 11):
      // one blank line before the symbol and after the caption so it doesn't
      // crowd the surrounding rules.
      w.push(CMD.FEED(1));
      // moduleSize sized to match the preview's modest ~90px QR (roughly a third
      // of paper width), not the full-width block the old fixed 8/6 produced
      // (client item 3). qrCommand still shrinks further via fittedModuleSize if
      // a large payload would otherwise overflow the paper.
      w.push(qrCommand(qrContent, { moduleSize: mm === 58 ? 3 : 4, errorCorrection: 'M', maxWidthDots: printableDots }));
      w.line('Scan to verify');
      w.push(CMD.FEED(1));
      w.push(CMD.ALIGN_LEFT);
      emitDivider(w, gutter, hr);
    }
  };

  // 'before' (default): QR/stamp renders immediately above the footer text.
  if (qrPlacement !== 'after') await emitQrOrStamp();

  if (showFooterText && footer) {
    w.push(CMD.ALIGN_CENTER);
    // Per-line so a bilingual/Arabic footer rasterises instead of printing '?'
    // (client item 6); Latin lines still print as fast plain text.
    String(footer).split('\n').forEach((l) => emitCenteredText(l, { fontPx: 20 }));
    w.push(CMD.ALIGN_LEFT);
  }

  // 'after': QR/stamp renders below the footer text.
  if (qrPlacement === 'after') await emitQrOrStamp();

  // ── Cut (client item 4) ────────────────────────────────────────────────────
  // Two-stage so the entire receipt prints BEFORE the blade fires and nothing
  // bleeds onto the next slip:
  //   1) FEED(2) — flush the final printed line out of the head's print buffer so
  //      it's committed to paper (a bare cut can fire while the last line is still
  //      buffered).
  //   2) GS V 66 n — feed the head→cutter clearance (n dots), THEN partial-cut.
  //      Because the cutter sits ~11–15mm above the head, this clearance is what
  //      moves the last content past the blade; the old FEED(4)+cut fell short of
  //      that gap, so the receipt's tail was cut off and reprinted atop the next.
  // Clearance is scaled to the head→cutter distance for this printer class:
  // ~120 dots (≈15mm) on 80mm, ~100 (≈12.5mm) on the shorter 58mm mechanism.
  w.push(CMD.FEED(2));
  w.push(CMD.CUT_PARTIAL_FEED(mm === 58 ? 100 : 120));
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

// Usable (post-symmetric-gutter) column count for a paper size — the width every
// plain-text thermal body (voucher/statement/report/layaway) should build its
// fixed-width lines to, so they fit inside the same left/right software gutters
// every other 80mm print uses. 46 @ 80mm, 30 @ 58mm.
export const escPosUsableCols = (paperSize) => usableColsFor(String(paperSize || '').includes('58') ? 58 : 80);

// Generic bridge for any receipt that's already rendered as fixed-width plain
// text (layaway slips, etc.) — wraps it with the same init/heating/codepage
// preamble as the full receipt builder above so it gets proper density/darkness
// on the print head instead of falling back to the text/GDI agent path (which has
// no heat control and reads faint). Applies the SAME symmetric SOFTWARE gutter as
// every other 80mm print (left-space prefix, no GS L / GS W) so the body is centred
// with equal left/right margins. Bodies should be built to escPosUsableCols.
export const buildEscPosFromPlainText = (text, paperSize = '80mm') => {
  const mm = String(paperSize || '').includes('58') ? 58 : 80;
  const gutter = leftGutterFor(mm);
  const w = new ByteWriter();
  w.push(CMD.INIT);
  w.push(CMD.SET_HEATING());
  w.push(CMD.CODEPAGE_WPC1252);
  w.push(CMD.SELECT_FONT_A);
  w.push(CMD.LINE_SPACING(36));
  w.push(CMD.ALIGN_LEFT);
  // Prefix the left gutter so the body sits inside the symmetric software margin.
  // Empty lines stay empty (no trailing-space padding).
  String(text || '').split('\n').forEach((line) => (line ? w.gline(gutter, line) : w.line('')));
  // Feed enough that the last line clears the blade, then feed-then-cut so nothing
  // is chopped off the tail (same clearance model as buildEscPosReceipt).
  w.push(CMD.FEED(2));
  w.push(CMD.CUT_PARTIAL_FEED(mm === 58 ? 100 : 120));
  return w.toUint8Array();
};

export const buildEscPosFromPlainTextBase64 = (text, paperSize = '80mm') => uint8ArrayToBase64(buildEscPosFromPlainText(text, paperSize));

// Maximum GS v 0 raster height (dots) per block, used only by the whole-receipt
// canvas path below. The POS-80C probe (ditherImageToRasterCommand's note)
// only ever proved a SINGLE block clean up to ~350 rows (the logo/stamp, ~13KB
// of raster data) — but a whole rendered bilingual receipt
// (bilingualReceiptCanvas.js) can run several THOUSAND dots tall, ~20x bigger
// than anything tested. That size gap is what produced a wall of mojibake on
// Template 2's silent print (client report 2026-07-07): a single oversized
// GS v 0 block overflows the printer's raster receive buffer, the parser loses
// track of how many image bytes remain, and starts reading the image's own tail
// bytes as WPC1252 text/commands.
//
// So the receipt is split into short bands (each a single, individually-safe
// GS v 0 block). The bug in the FIRST banding attempt was HOW the bands were
// joined: it issued ESC @ (INIT) between bands. ESC @ does NOT flush the
// current print buffer/line — it only resets controller registers — so the
// printer was still mid-line when the next GS v 0 header arrived; that header
// landed at a bad byte offset and every band after the first printed as literal
// text (the `?L ?L` mojibake: `1D 76 30` = "GS v 0" read as characters).
//
// The join that actually works on this printer class is the SAME one Template 1
// uses for its single logo/stamp raster (see emitQrOrStamp): a real line-feed
// (0x0a) BEFORE and AFTER each raster block flushes the line buffer, keeping the
// printer's parser in a known raster-ready state between blocks. To keep the
// bands abutting with no visible white seam, line spacing is set to ZERO
// (ESC 3 0) for the duration and restored to the body pitch afterwards — a
// zero-height line feed flushes the buffer without advancing paper. No ESC @
// mid-stream: that both fails to flush AND would reset the code page/font/
// heating the preamble established.
const RASTER_BAND_ROWS = 128;

const pushBandedRaster = (writer, bits, w, h) => {
  // A raster as the VERY FIRST printable content garbles on some clones, so
  // flush one normal-spaced blank line first (same guard as the logo/stamp path).
  writer.push([0x20, 0x0a]);
  writer.push(CMD.LINE_SPACING(0)); // 0-dot feed → the inter-band flushes below add no paper gap
  for (let y0 = 0; y0 < h; y0 += RASTER_BAND_ROWS) {
    const bandH = Math.min(RASTER_BAND_ROWS, h - y0);
    writer.push(packBitmapToRasterCommand(bits.subarray(y0 * w, (y0 + bandH) * w), w, bandH));
    writer.push([0x0a]); // flush the line buffer so the parser returns to a known
                         // state before the next GS v 0 header (0-height at ESC 3 0)
  }
  writer.push(CMD.DEFAULT_LINE_SPACING); // restore normal pitch for the trailing feed/cut
};

// ── Whole-receipt canvas → ESC/POS document ─────────────────────────────────
// Wraps an ALREADY-RENDERED full-receipt canvas (e.g. bilingualReceiptCanvas.js's
// renderBilingualReceiptCanvas, which lays out the entire bilingual EN/AR receipt
// at printer-native resolution via the browser's own text shaping/RTL) into a
// complete ESC/POS document: the same init/heating/codepage preamble every other
// receipt uses, the canvas as a sequence of banded GS v 0 raster blocks (see
// pushBandedRaster/RASTER_BAND_ROWS above — a whole receipt is far taller than
// the single-block size ever verified safe on this printer class), then the
// same feed+cut sequence. A hard 1-bit threshold (not dithering) — this is
// text/UI, not a photo — mirrors canvasToMonoRows in bilingualReceiptCanvas.js.
export const buildEscPosDocumentFromCanvas = (canvas, { paperSize = '80mm', threshold = 160 } = {}) => {
  const mm = String(paperSize || '').includes('58') ? 58 : 80;
  const w = canvas.width, h = canvas.height;
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h);
  const bits = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const a = data[o + 3] / 255;
    const lum = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) * a + 255 * (1 - a);
    bits[i] = lum < threshold ? 1 : 0;
  }
  const writer = new ByteWriter();
  writer.push(CMD.INIT);
  writer.push(CMD.SET_HEATING());
  writer.push(CMD.CODEPAGE_WPC1252);
  writer.push(CMD.SELECT_FONT_A);
  writer.push(CMD.ALIGN_CENTER);
  pushBandedRaster(writer, bits, w, h);
  writer.push([0x0a]);
  writer.push(CMD.ALIGN_LEFT);
  // Same head→cutter clearance model as buildEscPosReceipt's cut.
  writer.push(CMD.FEED(2));
  writer.push(CMD.CUT_PARTIAL_FEED(mm === 58 ? 100 : 120));
  return writer.toUint8Array();
};

export const buildEscPosDocumentFromCanvasBase64 = (canvas, opts) =>
  uint8ArrayToBase64(buildEscPosDocumentFromCanvas(canvas, opts));
