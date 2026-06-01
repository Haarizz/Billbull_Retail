// Overlay / pre-printed Sales Invoice renderer.
//
// Renders an invoice from a coordinate-based overlay template (designed in
// InvoiceOverlayDesigner). Each field carries an (x, y) position in millimetres
// on the page; we place the real invoice value there. Two modes:
//   • PREPRINTED — print ONLY the values onto physical pre-printed stationery
//     (no background, no labels, company block suppressed).
//   • LETTERHEAD — print the body onto pre-printed letterhead paper.
//
// The designer's background image is intentionally NOT printed: it represents
// the physical paper already loaded in the tray. It is only a design guide.

const PAPER_DIMS = {
    'A4-portrait': { w: 210, h: 297 },
    'A4-landscape': { w: 297, h: 210 },
    'Letter-portrait': { w: 215.9, h: 279.4 },
    'Letter-landscape': { w: 279.4, h: 215.9 },
    'A5-portrait': { w: 148, h: 210 },
    'A5-landscape': { w: 210, h: 148 },
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const fmt2 = (value) => num(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const fmtMoney = (value, currency) => `${currency ? currency + ' ' : ''}${fmt2(value)}`;

// Compact integer-to-words for the "amount in words" field. Handles the
// magnitudes an invoice realistically reaches; falls back gracefully.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const threeDigitWords = (n) => {
    let out = '';
    if (n >= 100) {
        out += `${ONES[Math.floor(n / 100)]} Hundred`;
        n %= 100;
        if (n) out += ' ';
    }
    if (n >= 20) {
        out += TENS[Math.floor(n / 10)];
        if (n % 10) out += `-${ONES[n % 10]}`;
    } else if (n > 0) {
        out += ONES[n];
    }
    return out;
};

const numberToWords = (value) => {
    let n = Math.floor(Math.abs(num(value)));
    if (n === 0) return 'Zero';
    const groups = [{ v: 1e9, name: 'Billion' }, { v: 1e6, name: 'Million' }, { v: 1e3, name: 'Thousand' }];
    let out = '';
    for (const g of groups) {
        if (n >= g.v) {
            out += `${threeDigitWords(Math.floor(n / g.v))} ${g.name} `;
            n %= g.v;
        }
    }
    if (n > 0) out += threeDigitWords(n);
    return out.trim();
};

const amountInWords = (value, currency) => {
    const total = num(value);
    const whole = Math.floor(total);
    const cents = Math.round((total - whole) * 100);
    const unit = currency || '';
    let words = `${numberToWords(whole)}`;
    if (unit) words = `${words} ${unit}`;
    if (cents > 0) words += ` and ${numberToWords(cents)} Fils`;
    return `${words} Only`.replace(/\s+/g, ' ').trim();
};

const paperDims = (settings) => {
    if (settings.paperSize === 'Custom') {
        return settings.orientation === 'portrait'
            ? { w: num(settings.customWidth) || 210, h: num(settings.customHeight) || 297 }
            : { w: num(settings.customHeight) || 297, h: num(settings.customWidth) || 210 };
    }
    const key = `${settings.paperSize || 'A4'}-${settings.orientation || 'portrait'}`;
    return PAPER_DIMS[key] || PAPER_DIMS['A4-portrait'];
};

// Resolve a field id to its printable string value from the invoice data.
const resolveFieldValue = (id, data, company) => {
    const t = data.totals || {};
    const c = data.customer || {};
    const m = data.meta || {};
    const currency = t.currency || '';
    switch (id) {
        case 'company_name': return company.companyName || company.name || '';
        case 'company_address': return company.address || '';
        case 'company_phone': return company.phone || '';
        case 'company_email': return company.email || '';
        case 'company_trn': return company.trn ? `TRN: ${company.trn}` : '';
        case 'invoice_title': return data.title || 'TAX INVOICE';
        case 'invoice_no': return data.docNo || '';
        case 'invoice_date': return data.date || '';
        case 'due_date': return m.dueDate || '';
        case 'payment_terms': return m.paymentTerm || m.paymentTerms || '';
        case 'salesperson': return m.salesPerson || m.salesperson || '';
        case 'bill_to_label': return 'BILL TO';
        case 'customer_name': return c.name || '';
        case 'customer_address1': return c.address || '';
        case 'customer_address2': return c.shippingAddress || '';
        case 'customer_trn': return c.trn ? `TRN: ${c.trn}` : '';
        case 'subtotal': return fmtMoney(t.subTotal, currency);
        case 'tax_amount': return fmtMoney(t.tax, currency);
        case 'grand_total': return fmtMoney(t.grandTotal, currency);
        case 'amount_words': return amountInWords(t.grandTotal, currency);
        case 'notes': return m.notes || '';
        case 'bank_name': return company.bankName || company.bankAccountName || '';
        case 'account_number': return company.accountNumber || company.bankAccountNumber || '';
        case 'iban': return company.iban || '';
        case 'signature': return '________________________';
        default: return '';
    }
};

const renderItemsTable = (field, data, currency) => {
    const items = Array.isArray(data.items) ? data.items : [];
    const rows = items.map((it, idx) => `
        <tr>
            <td style="padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc;text-align:center;">${idx + 1}</td>
            <td style="padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc;">${escapeHtml(it.name || it.desc || it.code || '')}</td>
            <td style="padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc;text-align:center;">${escapeHtml(it.unit || '')}</td>
            <td style="padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc;text-align:right;">${fmt2(it.qty)}</td>
            <td style="padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc;text-align:right;">${fmt2(it.price)}</td>
            <td style="padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc;text-align:right;">${fmt2(it.total)}</td>
        </tr>`).join('');

    return `
        <table style="width:100%;border-collapse:collapse;font-size:${num(field.fontSize) || 9}pt;font-family:${field.fontFamily || 'Inter'},sans-serif;color:${field.color || '#0f1923'};">
            <thead>
                <tr>
                    <th style="padding:1mm 1.5mm;border-bottom:0.4mm solid #333;text-align:center;">#</th>
                    <th style="padding:1mm 1.5mm;border-bottom:0.4mm solid #333;text-align:left;">Description</th>
                    <th style="padding:1mm 1.5mm;border-bottom:0.4mm solid #333;text-align:center;">Unit</th>
                    <th style="padding:1mm 1.5mm;border-bottom:0.4mm solid #333;text-align:right;">Qty</th>
                    <th style="padding:1mm 1.5mm;border-bottom:0.4mm solid #333;text-align:right;">Price</th>
                    <th style="padding:1mm 1.5mm;border-bottom:0.4mm solid #333;text-align:right;">Amount</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
};

const renderDrawing = (d) => {
    const x = num(d.x);
    const y = num(d.y);
    const w = num(d.width);
    const h = num(d.height);
    const color = d.color || '#0f1923';
    const thickness = num(d.thickness) || 1;
    const borderStyle = d.dashed ? 'dashed' : 'solid';
    if (d.type === 'h-line') {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;border-top:${thickness * 0.35}mm ${borderStyle} ${color};"></div>`;
    }
    if (d.type === 'v-line') {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;height:${h}mm;border-left:${thickness * 0.35}mm ${borderStyle} ${color};"></div>`;
    }
    // box / border
    const fill = (d.fillOpacity && num(d.fillOpacity) > 0) ? d.fillColor || 'transparent' : 'transparent';
    return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${thickness * 0.35}mm ${borderStyle} ${color};background:${fill};"></div>`;
};

/**
 * Build the print HTML for an overlay (pre-printed / letterhead) invoice template.
 *
 * @param {object} template  - PrintTemplate row (displayOptions JSON carries the layout)
 * @param {object} data      - printData (title, docNo, date, customer, items, totals, meta)
 * @param {object} options   - { companyProfile }
 * @returns {string} full HTML document
 */
export const generateOverlayInvoiceHtml = (template, data, options = {}) => {
    let displayOptions = {};
    try {
        displayOptions = template.displayOptions ? JSON.parse(template.displayOptions) : {};
    } catch {
        displayOptions = {};
    }
    const settings = displayOptions.salesDesignerSettings || displayOptions.designerSettings || {};
    const company = options.companyProfile || {};

    const isPreprinted = (template.templateType === 'PREPRINTED') || settings.mode === 'preprinted';
    const printOnlyValues = settings.printOnlyValues ?? isPreprinted;

    const dims = paperDims(settings);
    const currency = (data.totals && data.totals.currency) || '';
    const fields = Array.isArray(settings.fields) ? settings.fields : [];
    const drawings = Array.isArray(settings.drawings) ? settings.drawings : [];

    const fieldHtml = fields.map((f) => {
        if (f.enabled === false) return '';
        // In pre-printed mode the company block is already on the paper.
        if (isPreprinted && f.category === 'company') return '';

        const x = num(f.x);
        const y = num(f.y);
        const width = num(f.width) || 60;
        const styleBits = [
            'position:absolute',
            `left:${x}mm`,
            `top:${y}mm`,
            `width:${width}mm`,
            `font-size:${num(f.fontSize) || 10}pt`,
            `font-family:${f.fontFamily || 'Inter'},sans-serif`,
            `color:${f.color || '#0f1923'}`,
            `text-align:${f.align || 'left'}`,
            f.bold ? 'font-weight:700' : 'font-weight:400',
            f.italic ? 'font-style:italic' : '',
        ].filter(Boolean).join(';');

        if (f.id === 'items_table') {
            return `<div style="${styleBits}">${renderItemsTable(f, data, currency)}</div>`;
        }
        if (f.id === 'qr_code') return '';

        const value = resolveFieldValue(f.id, data, company);
        if (value === '' || value == null) return '';

        const showLabel = !printOnlyValues && f.printLabel;
        const label = showLabel ? `<span style="font-weight:400;color:#6b7a8a;">${escapeHtml(f.label)}: </span>` : '';
        return `<div style="${styleBits}">${label}${escapeHtml(value)}</div>`;
    }).join('');

    const drawingHtml = drawings.map(renderDrawing).join('');

    const title = `${data.title || 'Sales Invoice'} ${data.docNo || ''}`.trim();

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
    @page { size: ${dims.w}mm ${dims.h}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .ov-page {
        position: relative;
        width: ${dims.w}mm;
        height: ${dims.h}mm;
        overflow: hidden;
        background: #fff;
    }
    @media print {
        .ov-page { page-break-after: always; }
    }
</style>
</head>
<body>
    <div class="ov-page">
        ${drawingHtml}
        ${fieldHtml}
    </div>
    <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;
};

export default generateOverlayInvoiceHtml;
