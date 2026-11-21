'use strict';

// Print preview for the till's A4/A5/report prints.
//
// In a browser, window.print() opens Chrome's own print preview. Electron has no such preview:
// the same call opens the Windows system dialog, which says "This app doesn't support print
// preview". So the till hands its print HTML to the app instead (window.billbullDesktop
// .printPreview), the app renders it to a PDF and shows that in Chromium's PDF viewer, where the
// cashier sees every page and prints with the viewer's Print button.
//
// The pure helpers at the top are unit-tested without Electron.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_HTML_CHARS = 30 * 1024 * 1024;
const SCRIPT_SETTLE_MS = 350; // same pause printHtml gives a document's own layout scripts
const RENDER_TIMEOUT_MS = 20000;
const MAX_ROLL_HEIGHT_IN = 200; // Chromium's largest PDF page
const ROLL_SLACK_MM = 4;

const UNIT_TO_MM = { mm: 1, cm: 10, in: 25.4, px: 25.4 / 96, pt: 25.4 / 72 };

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * The till writes print HTML into an iframe of the /pos/ page, so relative addresses
 * (e.g. "/uploads/logo.png") resolve against the server. The preview renders from a local file,
 * so add a <base> pointing at the server unless the document already has one.
 */
function injectBaseHref(html, baseUrl) {
  const source = String(html ?? '');
  if (!baseUrl || /<base[\s>]/i.test(source)) return source;
  const tag = `<base href="${escapeAttr(baseUrl)}">`;
  const head = source.match(/<head(\s[^>]*)?>/i);
  if (head) {
    const at = head.index + head[0].length;
    return source.slice(0, at) + tag + source.slice(at);
  }
  const htmlTag = source.match(/<html(\s[^>]*)?>/i);
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length;
    return `${source.slice(0, at)}<head>${tag}</head>${source.slice(at)}`;
  }
  return tag + source;
}

/** The last `size:` declared in an @page rule of the document, or null. */
function findPageSize(html) {
  const source = String(html ?? '');
  let found = null;
  const pageRule = /@page\s*\{([^{}]*)/gi;
  let match;
  while ((match = pageRule.exec(source)) !== null) {
    const size = match[1].match(/(?:^|[;\s])size\s*:\s*([^;}]+)/i);
    if (size) found = size[1].trim();
  }
  return found;
}

function lengthToMm(token) {
  const m = /^(\d+(?:\.\d+)?)(mm|cm|in|px|pt)$/i.exec(token);
  return m ? Number(m[1]) * UNIT_TO_MM[m[2].toLowerCase()] : null;
}

/**
 * How to lay out the PDF for a CSS page size:
 *  - { kind: 'roll', widthMm } for receipt paper ("80mm auto", or a single narrow width like
 *    "80mm"): Chromium's PDF output ignores an "auto" height, so the app measures the content
 *    and makes one page exactly that long, like the receipt that comes out of the printer.
 *  - { kind: 'css' } for everything else (A4, "A5 landscape", "210mm 297mm", none): the page's
 *    own @page size is used as-is.
 */
function classifyPageSize(size) {
  if (!size) return { kind: 'css' };
  const tokens = String(size).trim().toLowerCase().split(/\s+/);
  const widthMm = lengthToMm(tokens[0]);
  if (widthMm == null) return { kind: 'css' };
  if (tokens.length === 2 && tokens[1] === 'auto') return { kind: 'roll', widthMm };
  if (tokens.length === 1 && widthMm <= 120) return { kind: 'roll', widthMm };
  return { kind: 'css' };
}

/** printToPDF options for a page layout and, for a roll, the measured content height in px. */
function pdfOptions(layout, contentHeightPx) {
  if (layout.kind !== 'roll') {
    return { printBackground: true, preferCSSPageSize: true, pageSize: 'A4' };
  }
  const heightMm = (Math.max(1, contentHeightPx) * 25.4) / 96 + ROLL_SLACK_MM;
  return {
    printBackground: true,
    preferCSSPageSize: false,
    pageSize: {
      width: layout.widthMm / 25.4,
      height: Math.min(MAX_ROLL_HEIGHT_IN, heightMm / 25.4),
    },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  };
}

// ---------------------------------------------------------------------------------------------
// Electron side
// ---------------------------------------------------------------------------------------------

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createPrintPreview({ BrowserWindow, tempRoot, webPreferences, icon }) {
  const dir = path.join(tempRoot, 'billbull-pos-print');

  function clearOldFiles() {
    try {
      for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name), { force: true });
    } catch { /* folder not created yet */ }
  }

  function tempFile(ext) {
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${crypto.randomUUID()}${ext}`);
  }

  const remove = (file) => fs.rm(file, { force: true }, () => {});

  async function measureRollHeight(wc, widthMm) {
    const win = BrowserWindow.fromWebContents(wc);
    win?.setContentSize(Math.max(100, Math.round((widthMm / 25.4) * 96)), 800);
    try {
      wc.debugger.attach();
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
    } catch { /* screen layout is close enough */ }
    await wait(50);
    return wc.executeJavaScript(
      'Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))',
      true,
    );
  }

  async function renderPdf(html, baseUrl) {
    const htmlFile = tempFile('.html');
    fs.writeFileSync(htmlFile, injectBaseHref(html, baseUrl), 'utf8');
    const renderer = new BrowserWindow({
      show: false,
      width: 794, // A4 at 96 dpi, as the till's print iframe
      height: 1123,
      webPreferences: webPreferences(),
    });
    renderer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    try {
      await withTimeout(renderer.loadFile(htmlFile), RENDER_TIMEOUT_MS, 'The document took too long to load.');
      await withTimeout(
        // A title also names the PDF in the viewer's toolbar (instead of the temp file's name).
        renderer.webContents.executeJavaScript(
          "if (!document.title) document.title = 'Print preview'; document.fonts ? document.fonts.ready.then(() => true) : true",
          true,
        ),
        RENDER_TIMEOUT_MS,
        'The document fonts took too long to load.',
      );
      await wait(SCRIPT_SETTLE_MS);
      const layout = classifyPageSize(findPageSize(html));
      const height = layout.kind === 'roll' ? await measureRollHeight(renderer.webContents, layout.widthMm) : 0;
      return await renderer.webContents.printToPDF(pdfOptions(layout, height));
    } finally {
      if (!renderer.isDestroyed()) renderer.destroy();
      remove(htmlFile);
    }
  }

  function showPdf(pdf, parent) {
    const pdfFile = tempFile('.pdf');
    fs.writeFileSync(pdfFile, pdf);
    const bounds = parent?.getBounds();
    const preview = new BrowserWindow({
      title: 'Print preview - BillBull POS',
      width: Math.min(1000, bounds ? bounds.width - 80 : 1000),
      height: bounds ? bounds.height - 80 : 850,
      parent: parent || undefined,
      autoHideMenuBar: true,
      icon,
      webPreferences: webPreferences({ plugins: true }),
    });
    preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Keep the window title instead of the PDF file's random name.
    preview.on('page-title-updated', (event) => event.preventDefault());
    preview.on('closed', () => remove(pdfFile));
    preview.loadFile(pdfFile);
    return preview;
  }

  /** Render the till's print HTML and open it in a preview window. */
  async function open(html, { baseUrl, parent } = {}) {
    if (typeof html !== 'string' || !html.trim()) throw new Error('Nothing to print.');
    if (html.length > MAX_HTML_CHARS) throw new Error('The document is too large to preview.');
    const pdf = await renderPdf(html, baseUrl);
    showPdf(pdf, parent);
    return { ok: true };
  }

  clearOldFiles();
  return { open, renderPdf, clearOldFiles };
}

module.exports = { injectBaseHref, findPageSize, classifyPageSize, pdfOptions, createPrintPreview, MAX_HTML_CHARS };
