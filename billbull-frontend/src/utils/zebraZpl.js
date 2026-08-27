// Zebra ZPL generator.
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

    const minFonts = {
        company: toDots(1.8),
        productName: toDots(2.0),
        brand: toDots(1.8),
        code: toDots(1.8),
        expiry: toDots(1.8),
        price: toDots(2.4)
    };

    const textSpacing = toDots(0.5);
    const avgCharWidthRatio = 0.65; // Estimate of Zebra Font 0 average character width

    // Explicitly check for enabled fields that also have truthy values
    const textFields = fields.filter(f => f.type === 'text' && f.enabled && !!f.value);
    const barcodeFields = fields.filter(f => f.type === 'barcode' && f.enabled && !!f.value);
    const barcodeCount = barcodeFields.length;

    // Measure text requirements
    let requiredTextHeight = 0;
    textFields.forEach(f => {
        let maxLines = 1;
        let fontH = fonts[f.id] || toDots(2.4);
        const minFontH = minFonts[f.id] || toDots(1.8);
        
        const estWidth = f.value.length * (fontH * avgCharWidthRatio);
        
        if (estWidth > safeWidthDots) {
            // Option A: Font scaling
            const requiredFontH = safeWidthDots / (f.value.length * avgCharWidthRatio);
            if (requiredFontH >= minFontH) {
                fontH = Math.floor(requiredFontH);
            } else {
                fontH = minFontH;
                // Option B: Controlled wrapping
                if (f.id === 'productName' || f.id === 'company') {
                    maxLines = 2; // Allow up to 2 lines for long names
                }
            }
        }
        
        // Option C: Controlled truncation
        // Prevent ^FB max-line overwrite by explicitly truncating the string if it still overflows
        const maxAllowedChars = Math.floor((safeWidthDots * maxLines) / (fontH * avgCharWidthRatio));
        if (f.value.length > maxAllowedChars) {
            if (maxAllowedChars > 3) {
                f.displayValue = f.value.substring(0, maxAllowedChars - 3) + '...';
            } else {
                f.displayValue = f.value.substring(0, maxAllowedChars);
            }
        } else {
            f.displayValue = f.value;
        }

        f.fontH = fontH;
        f.maxLines = maxLines;
        f.elementHeight = (f.fontH * f.maxLines) + textSpacing;
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
            out.push(`^FO0,${el.y}^FB${layout.labelWidthDots},${el.maxLines || 1},0,C,0^A0N,${el.fontH},${el.fontH}^FD${escapeZpl(el.displayValue || el.value)}^FS`);
        } else if (el.type === 'barcode') {
            out.push(`^BY${el.by},2,${el.barcodeHeight}`);
            out.push(`^FO${el.x},${el.y}^BCN,${el.barcodeHeight},Y,N,N^FD${escapeZpl(el.value)}^FS`);
        }
    });

    out.push('^XZ');
    return out.join('\n');
};

export const buildZplBatch = (labels) => labels.map(buildLabelZpl).join('\n');



export { buildLabelZpl, resolveLabelLayout };
