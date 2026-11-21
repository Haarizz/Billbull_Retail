import QRCode from "qrcode";
import { buildTemplate3Blocks, mapEscPosOptsToTemplate3Data } from "./template3Layout";
import { CODE128_PATTERNS, code128BCodes, code128Modules } from "../../../../utils/bilingualReceiptCanvas";
import { buildEscPosDocumentFromCanvasBase64 } from "../../../../utils/escPosReceipt";
import { SHARE_TECH_MONO_DATA_URL, SHARE_TECH_MONO_FAMILY } from "../../../../utils/shareTechMonoFont";
import { RECEIPT_FONT_AR } from "../../../../utils/receiptLabels";

/**
 * Silent thermal print path for Template 3 ("BillBull Retail OS" 80mm).
 *
 * Draws the block list from template3Layout.js onto a printer-native canvas
 * (576 dots at 80mm, 384 at 58mm) and packs it into one ESC/POS raster
 * document — the same route Template 2 takes, because Arabic can only reach
 * POS-80C class printers as an image. Pure black on white throughout so the
 * 1-bit threshold keeps everything crisp.
 */

const PAPER_DOTS = { 58: 384, 80: 576 };

// The canvas can only use fonts the page has loaded. Register the embedded
// Share Tech Mono (the design's face, same base64 the HTML twin uses) so an
// offline till prints the same face — and the same line breaks — as the preview.
let fontReady = null;
function ensureFonts() {
  if (fontReady) return fontReady;
  fontReady = (async () => {
    try {
      if (typeof FontFace === "undefined" || !document.fonts) return;
      // Not document.fonts.check(): it returns true for a family with no face
      // registered at all, which would skip registration and print the fallback.
      const loaded = [...document.fonts].some(
        (f) => f.family.replace(/["']/g, "") === "Share Tech Mono" && f.status === "loaded",
      );
      if (!loaded) {
        const face = new FontFace("Share Tech Mono", `url(${SHARE_TECH_MONO_DATA_URL})`, { weight: "400", style: "normal" });
        document.fonts.add(await face.load());
      }
      await Promise.all([
        document.fonts.load("400 24px 'Share Tech Mono'"),
        document.fonts.load("500 22px 'Noto Kufi Arabic'"),
      ]);
    } catch {
      /* fall back to the OS monospace / Arabic fonts */
    }
  })();
  return fontReady;
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/**
 * @param {string} paperSize '58mm' | '80mm'
 * @param {object} data      ReceiptData from mapToTemplate3Data
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderTemplate3Canvas(paperSize, data) {
  await ensureFonts();
  const blocks = buildTemplate3Blocks(data);

  const mm = String(paperSize || "").includes("58") ? 58 : 80;
  const W = PAPER_DOTS[mm];
  const S = W / 576;
  const M = Math.round(8 * S);
  const CW = W - 2 * M;

  // Sizes in dots at 80mm — the design's 12px body on a ~280px content width,
  // scaled to the 560-dot printable width.
  const SZ = { body: 24, sm: 21, ar: 23, brand: 31 };
  const px = (n) => Math.max(12, Math.round(n * S));
  const lineH = (n) => Math.round(px(n) * 1.38);

  const estH = Math.round((900 + blocks.length * 90) * S) + 1200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = estH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, estH);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  let y = Math.round(10 * S);

  const font = (size, { ar = false } = {}) =>
    // The design is single-weight (Share Tech Mono 400, no bold anywhere), so
    // `bold` never changes the weight; Arabic stays at its regular weight too.
    ar ? `500 ${px(size)}px ${RECEIPT_FONT_AR}` : `400 ${px(size)}px ${SHARE_TECH_MONO_FAMILY}`;
  const setFont = (size, o) => { ctx.font = font(size, o); };
  const measure = (text, size, o) => { setFont(size, o); return ctx.measureText(String(text)).width; };
  const draw = (text, x, size, { bold = false, ar = false, align = "left" } = {}) => {
    setFont(size, { bold, ar });
    ctx.direction = ar ? "rtl" : "ltr";
    ctx.textAlign = align;
    ctx.fillText(String(text), x, y);
    // Share Tech Mono is a hairline face: at printer resolution its strokes are
    // ~1–2 dots and partly anti-aliased grey, so the 1-bit threshold breaks
    // letters apart. A thin same-colour outline makes every stroke solid black.
    if (!ar) {
      ctx.lineWidth = Math.max(0.6, 0.8 * S);
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#000";
      ctx.strokeText(String(text), x, y);
    }
  };
  const wrap = (text, size, maxW, o = {}) => {
    setFont(size, o);
    const lines = [];
    for (const para of String(text ?? "").split("\n")) {
      const words = para.split(/(\s+)/).filter((w) => w.length);
      let cur = "";
      for (const w of words) {
        const probe = cur + w;
        if (!cur.trim() || ctx.measureText(probe.trimEnd()).width <= maxW) { cur = probe; continue; }
        lines.push(cur.trimEnd());
        cur = /^\s+$/.test(w) ? "" : w;
        // A single word wider than the line: hard-split it.
        while (ctx.measureText(cur).width > maxW && cur.length > 1) {
          let cut = cur.length - 1;
          while (cut > 1 && ctx.measureText(cur.slice(0, cut)).width > maxW) cut--;
          lines.push(cur.slice(0, cut));
          cur = cur.slice(cut);
        }
      }
      lines.push(cur.trimEnd());
    }
    return lines;
  };
  /** Largest size ≤ `size` at which `text` fits `maxW` (never below 12 dots). */
  const fit = (text, size, maxW, o) => {
    let s = size;
    while (s > 12 && measure(text, s, o) > maxW) s -= 1;
    return s;
  };

  for (const blk of blocks) {
    switch (blk.t) {
      case "logo": {
        try {
          const img = await loadImage(blk.src);
          const ratio = img.width && img.height ? img.width / img.height : 1;
          let lw = Math.round(CW * 0.6);
          let lh = Math.round(lw / ratio);
          const maxH = Math.round(190 * S);
          if (lh > maxH) { lh = maxH; lw = Math.round(lh * ratio); }
          ctx.drawImage(img, Math.round((W - lw) / 2), y, lw, lh);
          y += lh + Math.round(6 * S);
        } catch { /* undecodable logo — print without it */ }
        break;
      }
      case "brand":
        for (const ln of wrap(blk.text, SZ.brand, CW, { bold: true })) {
          draw(ln, W / 2, SZ.brand, { bold: true, align: "center" });
          y += lineH(SZ.brand);
        }
        break;
      case "center": {
        const size = blk.ar ? SZ.ar : blk.sm ? SZ.sm : SZ.body;
        const o = { bold: !!blk.bold, ar: !!blk.ar };
        for (const ln of wrap(blk.text, size, CW, o)) {
          draw(ln, W / 2, size, { ...o, align: "center" });
          y += lineH(size);
        }
        break;
      }
      case "text": {
        const size = blk.sm ? SZ.sm : SZ.body;
        for (const ln of wrap(blk.text, size, CW)) { draw(ln, M, size); y += lineH(size); }
        break;
      }
      case "ar":
        for (const ln of wrap(blk.text, SZ.ar, CW, { ar: true })) {
          draw(ln, W - M, SZ.ar, { ar: true, align: "right" });
          y += lineH(SZ.ar);
        }
        break;
      case "row": {
        const size = blk.sm ? SZ.sm : SZ.body;
        const bold = !!blk.bold;
        const gap = Math.round(12 * S);
        let rSize = blk.rAr ? SZ.ar : size;
        const rOpts = { bold, ar: !!blk.rAr };
        // The value never takes more than 70% of the line (same cap as the HTML).
        if (blk.r) rSize = fit(blk.r, rSize, CW * 0.7, rOpts);
        const rW = blk.r ? measure(blk.r, rSize, rOpts) : 0;
        const leftLines = blk.l ? wrap(blk.l, size, CW - rW - (blk.r ? gap : 0), { bold }) : [""];
        const top = y;
        leftLines.forEach((ln) => { if (ln) draw(ln, M, size, { bold }); y += lineH(size); });
        if (blk.r) {
          const save = y;
          y = top + (blk.rAr ? 0 : Math.max(0, Math.round((px(size) - px(rSize)) / 2)));
          draw(blk.r, W - M, rSize, { ...rOpts, align: "right" });
          y = Math.max(save, top + lineH(rSize));
        }
        break;
      }
      case "wrow": {
        const size = SZ.body;
        const gap = Math.round(24 * S);
        const lW = measure(blk.l, size);
        const top = y;
        draw(blk.l, M, size);
        for (const ln of wrap(blk.r, size, CW - lW - gap)) {
          draw(ln, W - M, size, { align: "right" });
          y += lineH(size);
        }
        y = Math.max(y, top + lineH(size));
        break;
      }
      case "title":
        draw(blk.text, W / 2, SZ.body, { bold: true, align: "center" });
        y += lineH(SZ.body) + Math.round(2 * S);
        break;
      case "rule": {
        y += Math.round(9 * S);
        const dash = Math.round(8 * S), gapW = Math.round(5 * S), h = Math.max(2, Math.round(2 * S));
        for (let x = M; x < W - M; x += dash + gapW) ctx.fillRect(x, y, Math.min(dash, W - M - x), h);
        y += h + Math.round(9 * S);
        break;
      }
      case "gap":
        y += Math.round(7 * S);
        break;
      case "taxGrid": {
        // Same fractions as the HTML grid: .7 .6 1 1 .9
        const fr = [0.7, 0.6, 1, 1, 0.9];
        const total = fr.reduce((a, b) => a + b, 0);
        const edges = [];
        let acc = M;
        for (const f of fr) { acc += (CW * f) / total; edges.push(acc); }
        const colW = (j) => edges[j] - (j ? edges[j - 1] : M);
        // One size for the whole grid: shrink until every cell fits its column.
        let size = SZ.body;
        for (const r of [blk.head, ...blk.rows]) {
          r.forEach((cell, j) => { size = Math.min(size, fit(cell, size, colW(j) - Math.round(4 * S))); });
        }
        for (const r of [blk.head, ...blk.rows]) {
          r.forEach((cell, j) => {
            if (j === 0) draw(cell, M, size);
            else draw(cell, edges[j], size, { align: "right" });
          });
          y += lineH(size);
        }
        break;
      }
      case "qr": {
        y += Math.round(4 * S);
        try {
          if (blk.stampDataUrl || (!blk.content && blk.dataUrl)) {
            const img = await loadImage(blk.stampDataUrl || blk.dataUrl);
            const side = Math.round(CW * 0.42);
            const ratio = img.width && img.height ? img.width / img.height : 1;
            const w = ratio >= 1 ? side : Math.round(side * ratio);
            const h = ratio >= 1 ? Math.round(side / ratio) : side;
            ctx.drawImage(img, Math.round((W - w) / 2), y, w, h);
            y += h + Math.round(6 * S);
          } else if (blk.content) {
            const probe = QRCode.create(String(blk.content), { errorCorrectionLevel: "M" });
            const scale = Math.max(2, Math.min(8, Math.floor((CW * 0.5) / probe.modules.size)));
            const qr = document.createElement("canvas");
            await QRCode.toCanvas(qr, String(blk.content), { errorCorrectionLevel: "M", scale, margin: 0 });
            ctx.drawImage(qr, Math.round((W - qr.width) / 2), y);
            y += qr.height + Math.round(6 * S);
          }
        } catch { /* QR/stamp failed — never block the receipt on it */ }
        break;
      }
      case "barcode": {
        const value = String(blk.value || "").trim();
        if (!value) break;
        y += Math.round(6 * S);
        const modules = code128Modules(value);
        // Integer dots per module so the threshold can't blur the bars.
        const mod = Math.max(1, Math.floor(CW / modules));
        const bcW = modules * mod;
        const bcH = Math.round(70 * S);
        let x = Math.round((W - bcW) / 2);
        for (const code of code128BCodes(value)) {
          const widths = CODE128_PATTERNS[code].split("").map(Number);
          widths.forEach((wd, i) => {
            if (i % 2 === 0) ctx.fillRect(x, y, wd * mod, bcH);
            x += wd * mod;
          });
        }
        y += bcH + Math.round(4 * S);
        draw(value, W / 2, SZ.sm, { align: "center" });
        y += lineH(SZ.sm);
        break;
      }
      default:
        break;
    }
  }

  y += Math.round(10 * S);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = Math.min(y, estH);
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0);
  return out;
}

/**
 * Registry `buildEscPosBase64` — same (paperSize, invoice, opts) signature as
 * every other template, so the checkout print, reprints and the designer's
 * Test Print call it unchanged.
 */
export async function buildTemplate3EscPosBase64(paperSize, invoice, opts = {}) {
  const data = mapEscPosOptsToTemplate3Data(invoice, opts);
  const canvas = await renderTemplate3Canvas(paperSize, data);
  return buildEscPosDocumentFromCanvasBase64(canvas, { paperSize });
}
