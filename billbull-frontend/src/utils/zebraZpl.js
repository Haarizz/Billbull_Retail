// Zebra ZPL generator + Browser Print HTTP client.
//
// Requires the Zebra Browser Print desktop app to be installed and running on
// the workstation that's physically connected to the Zebra printer. It exposes
// a local HTTPS API at https://localhost:9101 with /available and /write
// endpoints. Each client must install it once:
//   https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities.html
//
// First-time use: open https://localhost:9101/available in the same browser
// once to accept the local certificate, then BillBull can call it.

// Browser Print listens on either http://localhost:9100 (legacy) or
// https://localhost:9101 (current). Different installs / Windows versions
// pick different ones, so we probe both — but only HTTPS bases when the
// host page itself is HTTPS, otherwise the HTTP fallback triggers Chrome's
// mixed-content warning ("Not secure" with a valid cert).
const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
const BROWSER_PRINT_BASES = isHttpsPage
    ? ['https://localhost:9101', 'https://127.0.0.1:9101']
    : [
        'https://localhost:9101',
        'http://localhost:9100',
        'http://127.0.0.1:9100',
        'https://127.0.0.1:9101'
    ];
let resolvedBase = null;
const DPI = 8; // ZD220t is 203 DPI ≈ 8 dots/mm
const mm = (v) => Math.round(v * DPI);

// Code 128 module count estimate. Real count depends on subset switching but
// this is close enough for centering. 35 base (start + checksum + stop) + 11/char.
const estimateCode128Modules = (data) => 35 + 11 * String(data || '').length;

const escapeZpl = (s) => String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~');

const centerX = (pageDots, barcodeDots) => Math.max(0, Math.round((pageDots - barcodeDots) / 2));

// Pick the largest module width (BY value) that still fits inside the usable
// width. Falls back to 2 dots minimum which is the practical scanner threshold.
const pickModuleWidth = (data, availableDots) => {
    const modules = estimateCode128Modules(data);
    for (const by of [4, 3, 2]) {
        if (modules * by <= availableDots) return by;
    }
    return 2;
};

const centeredText = (y, text, fontH, pageDots) => {
    const safe = escapeZpl(text);
    return `^FO0,${y}^FB${pageDots},1,0,C,0^A0N,${fontH},${fontH}^FD${safe}^FS`;
};

const buildLabelZpl = ({
    labelWidthMm = 100,
    labelHeightMm = 75,
    company = '',
    productName = '',
    brand = '',
    code = '',
    productBarcode = '',
    batchBarcode = '',
    expiry = '',
    price = ''
}) => {
    const pageDots = mm(labelWidthMm);
    const labelDots = mm(labelHeightMm);
    const sideMarginDots = mm(3);
    const usableDots = pageDots - sideMarginDots * 2;

    const hasProduct = !!productBarcode;
    const hasBatch = !!batchBarcode && batchBarcode !== productBarcode;
    const barcodeHeightDots = hasProduct && hasBatch ? mm(11) : mm(20);

    // Build a row plan first so we can vertically center the whole stack
    // inside the label instead of packing everything against the top edge.
    const rows = [];
    if (company)     rows.push({ kind: 'text', value: company,         fontH: mm(2.6), advance: mm(3.2) });
    if (productName) rows.push({ kind: 'text', value: productName,     fontH: mm(3.4), advance: mm(4.0) });
    if (brand)       rows.push({ kind: 'text', value: brand,           fontH: mm(2.4), advance: mm(3.0) });
    if (code)        rows.push({ kind: 'text', value: `Code: ${code}`, fontH: mm(2.2), advance: mm(3.0) });
    if (hasProduct)  rows.push({ kind: 'barcode', value: productBarcode, height: barcodeHeightDots, advance: barcodeHeightDots + mm(4.5) });
    if (hasBatch)    rows.push({ kind: 'barcode', value: batchBarcode,   height: barcodeHeightDots, advance: barcodeHeightDots + mm(4.5) });
    if (expiry)      rows.push({ kind: 'text', value: `Exp: ${expiry}`, fontH: mm(2.4), advance: mm(3.0) });
    if (price)       rows.push({ kind: 'text', value: price,            fontH: mm(3.6), advance: mm(3.6) });

    // Total stack height = sum of advances except the last row uses its own
    // intrinsic height (text fontH or barcode height) rather than its advance,
    // since there's no trailing gap after the final element.
    let stackHeight = 0;
    rows.forEach((r, i) => {
        if (i === rows.length - 1) {
            stackHeight += r.kind === 'barcode' ? r.height : r.fontH;
        } else {
            stackHeight += r.advance;
        }
    });

    const topPadding = mm(2);
    const startY = Math.max(topPadding, Math.round((labelDots - stackHeight) / 2));

    const out = [];
    out.push('^XA');
    out.push('^CI28');
    out.push(`^PW${pageDots}`);
    out.push(`^LL${labelDots}`);
    out.push('^LH0,0');
    out.push('^LS0');
    out.push('^PON');
    out.push('^MMT');

    let y = startY;
    for (const r of rows) {
        if (r.kind === 'text') {
            out.push(centeredText(y, r.value, r.fontH, pageDots));
        } else {
            const by = pickModuleWidth(r.value, usableDots);
            const widthDots = estimateCode128Modules(r.value) * by;
            const x = centerX(pageDots, widthDots);
            out.push(`^BY${by},2,${r.height}`);
            out.push(`^FO${x},${y}^BCN,${r.height},Y,N,N^FD${escapeZpl(r.value)}^FS`);
        }
        y += r.advance;
    }

    out.push('^XZ');
    return out.join('\n');
};

export const buildZplBatch = (labels) => labels.map(buildLabelZpl).join('\n');

const probeBase = async (base) => {
    try {
        const resp = await fetch(`${base}/available`, { method: 'GET', mode: 'cors' });
        if (resp.ok) return true;
    } catch (err) {
        // Likely CORS-blocked, cert untrusted, or service offline. Move on.
    }
    return false;
};

const resolveBase = async () => {
    if (resolvedBase) return resolvedBase;
    for (const base of BROWSER_PRINT_BASES) {
        // eslint-disable-next-line no-await-in-loop
        if (await probeBase(base)) {
            resolvedBase = base;
            return base;
        }
    }
    return null;
};

export const isBrowserPrintReachable = async () => !!(await resolveBase());

export const listZebraPrinters = async () => {
    const base = await resolveBase();
    if (!base) throw new Error('Browser Print not reachable. Check that it is installed, running, and that this site is in its Accepted Hosts list.');
    const resp = await fetch(`${base}/available`);
    if (!resp.ok) throw new Error(`Browser Print returned HTTP ${resp.status}`);
    const data = await resp.json();
    const devices = data?.printer || data?.devices || [];
    return Array.isArray(devices) ? devices : [];
};

export const sendZplToDevice = async (device, zpl) => {
    const base = await resolveBase();
    if (!base) throw new Error('Browser Print not reachable');
    const resp = await fetch(`${base}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, data: zpl })
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Browser Print write failed: ${resp.status} ${text}`);
    }
    return true;
};

export const printZplBatch = async (labels, preferredDevice = null) => {
    const printers = await listZebraPrinters();
    if (!printers.length) throw new Error('No Zebra printer detected by Browser Print');
    const zpl = buildZplBatch(labels);
    const device = preferredDevice || printers[0];
    await sendZplToDevice(device, zpl);
    return device;
};

export { buildLabelZpl };
