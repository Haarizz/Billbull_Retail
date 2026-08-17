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
const mmToDots = (mmValue) => Math.round(mmValue * DPI);

// Code 128 module count estimate. Real count depends on subset switching but
// this is close enough for centering. 35 base (start + checksum + stop) + 11/char.
const estimateCode128Modules = (data) => 35 + 11 * String(data || '').length;

const escapeZpl = (s) => String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~');

const DEBUG_LAYOUT = true; // Enabled for development layout diagnostics as requested

const resolveLabelLayout = (template, fields, printerProfile = { dpi: DPI }) => {
    const { labelWidthMm = 100, labelHeightMm = 75 } = template;
    const dpi = printerProfile.dpi || DPI;
    const toDots = (mm) => Math.round(mm * dpi);

    const isSmallHeight = labelHeightMm <= 25;

    const labelWidthDots = toDots(labelWidthMm);
    const labelHeightDots = toDots(labelHeightMm);

    // Calculate safe printable area
    const safeArea = {
        left: toDots(2),
        right: labelWidthDots - toDots(2),
        top: toDots(2),
        bottom: labelHeightDots - toDots(2)
    };
    const safeWidthDots = safeArea.right - safeArea.left;
    const safeHeightDots = safeArea.bottom - safeArea.top;

    // Fonts mapping (compact typography for small labels)
    const fonts = {
        company: isSmallHeight ? toDots(2.0) : toDots(2.6),
        productName: isSmallHeight ? toDots(2.6) : toDots(3.4),
        brand: isSmallHeight ? toDots(2.0) : toDots(2.4),
        code: isSmallHeight ? toDots(1.8) : toDots(2.2),
        expiry: isSmallHeight ? toDots(2.0) : toDots(2.4),
        price: isSmallHeight ? toDots(2.8) : toDots(3.6)
    };

    const textSpacing = toDots(0.5);

    // Explicitly check for enabled fields that also have truthy values
    const textFields = fields.filter(f => f.type === 'text' && f.enabled && !!f.value);
    const barcodeFields = fields.filter(f => f.type === 'barcode' && f.enabled && !!f.value);
    const barcodeCount = barcodeFields.length;

    // Measure text requirements
    let requiredTextHeight = 0;
    textFields.forEach(f => {
        f.fontH = fonts[f.id] || toDots(2.4);
        f.elementHeight = f.fontH + textSpacing;
        requiredTextHeight += f.elementHeight;
    });

    // Allocate space for barcodes
    let availableBarcodeHeight = safeHeightDots - requiredTextHeight;

    const humanReadableHeight = toDots(2.5); // approximate height of human-readable text under barcode
    const gapPerBarcode = toDots(1);

    const minimumBarcodeHeight = toDots(5); // Minimum scannable height
    let resolvedBarcodeHeight = 0;

    if (barcodeCount > 0) {
        let spacePerBarcode = (availableBarcodeHeight / barcodeCount) - humanReadableHeight - gapPerBarcode;
        const barcodeSpecificMax = barcodeCount > 1 ? toDots(14) : toDots(22);
        
        resolvedBarcodeHeight = Math.max(minimumBarcodeHeight, Math.min(barcodeSpecificMax, Math.round(spacePerBarcode)));
        
        barcodeFields.forEach(f => {
            f.elementHeight = resolvedBarcodeHeight + humanReadableHeight + gapPerBarcode;
        });
    }

    // Allocate positions
    const layoutElements = [];
    let currentY = safeArea.top;

    // Calculate total stack height for vertical centering if space allows
    let totalStackHeight = requiredTextHeight;
    if (barcodeCount > 0) {
        barcodeFields.forEach(f => totalStackHeight += f.elementHeight);
    }
    
    if (totalStackHeight < safeHeightDots) {
        currentY = safeArea.top + Math.round((safeHeightDots - totalStackHeight) / 2);
    }

    // Preserve logical field ordering
    const order = ['company', 'productName', 'brand', 'code', 'productBarcode', 'batchBarcode', 'expiry', 'price'];
    const allFields = [...textFields, ...barcodeFields].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    allFields.forEach(f => {
        let width = safeWidthDots;
        if (f.type === 'barcode') {
            const modules = estimateCode128Modules(f.value);
            let by = 1; // Default minimum module width (1 dot) to ensure fit on very small labels
            for (const testBy of [4, 3, 2, 1]) {
                if (modules * testBy <= safeWidthDots) {
                    by = testBy;
                    break;
                }
            }
            width = modules * by;
            f.by = by;
            f.barcodeHeight = resolvedBarcodeHeight;
        }

        const x = Math.max(safeArea.left, Math.round((labelWidthDots - width) / 2)); // Center horizontally
        
        layoutElements.push({
            ...f,
            x: x,
            y: currentY,
            width: width,
            height: f.elementHeight,
            isValid: true
        });

        currentY += f.elementHeight;
    });

    // Validate EVERY element against the physical label boundary
    let validationPassed = true;
    layoutElements.forEach(el => {
        el.isValid = (
            el.x >= 0 &&
            el.y >= 0 &&
            (el.x + el.width) <= labelWidthDots &&
            (el.y + el.height) <= safeArea.bottom + toDots(1.5) // allow tiny grace margin for font descenders
        );
        if (!el.isValid) {
            validationPassed = false;
        }
    });

    if (DEBUG_LAYOUT) {
        console.log(`[ZPL Layout Diagnostics]`);
        console.log(`Label: ${labelWidthDots} x ${labelHeightDots} dots`);
        console.log(`Safe area: ${safeWidthDots} x ${safeHeightDots} dots`);
        layoutElements.forEach(el => {
            console.log(`${el.id}: x=${el.x} y=${el.y} width=${el.width} height=${el.height} isValid=${el.isValid}`);
        });
        console.log(`bottom: ${currentY} / ${safeArea.bottom}`);
    }

    return {
        labelWidthDots,
        labelHeightDots,
        safeArea,
        elements: layoutElements,
        validationPassed
    };
};

const buildLabelZpl = (data) => {
    // If BarcodePrinter provides explicitly resolved semantic fields, use them.
    // Otherwise fallback to legacy parsing.
    let fields = data.fields;
    if (!fields) {
        fields = [
            { type: 'text', id: 'company', enabled: !!data.company, value: data.company },
            { type: 'text', id: 'productName', enabled: !!data.productName, value: data.productName },
            { type: 'text', id: 'brand', enabled: !!data.brand, value: data.brand },
            { type: 'text', id: 'code', enabled: !!data.code, value: data.code ? `Code: ${data.code}` : '' },
            { type: 'barcode', id: 'productBarcode', enabled: !!data.productBarcode, value: data.productBarcode },
            { type: 'barcode', id: 'batchBarcode', enabled: !!data.batchBarcode, value: data.batchBarcode },
            { type: 'text', id: 'expiry', enabled: !!data.expiry, value: data.expiry ? `Exp: ${data.expiry}` : '' },
            { type: 'text', id: 'price', enabled: !!data.price, value: data.price }
        ];
    }

    const layout = resolveLabelLayout(
        { labelWidthMm: data.labelWidthMm || 100, labelHeightMm: data.labelHeightMm || 75 },
        fields,
        { dpi: DPI }
    );

    const out = [];
    out.push('^XA');
    out.push('^CI28');
    out.push(`^PW${layout.labelWidthDots}`);
    out.push(`^LL${layout.labelHeightDots}`);
    out.push('^LH0,0');
    out.push('^LS0');
    out.push('^PON');
    out.push('^MMT');

    layout.elements.forEach(el => {
        if (!el.isValid) {
            console.warn(`Element ${el.id} exceeds safe area in ZPL layout!`);
        }

        if (el.type === 'text') {
            out.push(`^FO0,${el.y}^FB${layout.labelWidthDots},1,0,C,0^A0N,${el.fontH},${el.fontH}^FD${escapeZpl(el.value)}^FS`);
        } else if (el.type === 'barcode') {
            out.push(`^BY${el.by},2,${el.barcodeHeight}`);
            out.push(`^FO${el.x},${el.y}^BCN,${el.barcodeHeight},Y,N,N^FD${escapeZpl(el.value)}^FS`);
        }
    });

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

export { buildLabelZpl, resolveLabelLayout };
