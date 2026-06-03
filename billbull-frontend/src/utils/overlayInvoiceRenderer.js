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

const firstOf = (...vals) => {
    for (const v of vals) {
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
};

// Resolve a field id to its printable string value from the invoice data.
const resolveFieldValue = (id, data, company) => {
    const t = data.totals || {};
    const c = data.customer || {};
    const m = data.meta || {};
    const currency = t.currency || '';
    const crn = firstOf(company.crn, company.crNumber, company.registrationNumber, company.companyRegistrationNumber);
    switch (id) {
        // Company
        case 'company_name': return company.companyName || company.name || '';
        case 'company_address': return firstOf(company.fullAddress, company.address) || '';
        case 'company_phone': return firstOf(company.phone, company.mobile) || '';
        case 'company_email': return company.email || '';
        case 'company_website': return company.website || '';
        case 'company_trn': return company.trn ? `TRN: ${company.trn}` : '';
        case 'company_cr': return crn ? `CR: ${crn}` : '';
        // Document
        case 'invoice_title': return data.title || 'TAX INVOICE';
        case 'invoice_no': return data.docNo || '';
        case 'invoice_date': return data.date || '';
        case 'due_date': return m.dueDate || '';
        case 'valid_until': return firstOf(m.validUntil, m.validTill) || '';
        case 'payment_terms': return firstOf(m.paymentTerm, m.paymentTerms) || '';
        case 'salesperson': return firstOf(m.salesPerson, m.salesperson) || '';
        case 'currency': return currency || '';
        case 'po_reference': return firstOf(m.poNumber, m.poRef, m.reference, m.linkedSalesOrder) || '';
        case 'location_store': return firstOf(m.locationStore, m.location) || '';
        case 'warehouse': return m.warehouse || '';
        case 'delivery_terms': return firstOf(m.deliveryTerms, m.deliveryType) || '';
        // Customer
        case 'bill_to_label': return 'BILL TO';
        case 'customer_name': return c.name || '';
        case 'customer_address1': return c.address || '';
        case 'customer_address2': return c.shippingAddress || '';
        case 'customer_code': return c.code || '';
        case 'customer_phone': return c.phone || '';
        case 'customer_email': return c.email || '';
        case 'customer_trn': return c.trn ? `TRN: ${c.trn}` : '';
        case 'ship_to_label': return 'SHIP TO';
        case 'ship_to_address': return c.shippingAddress || '';
        // Totals
        case 'taxable_total': return fmtMoney(firstOf(t.taxableAmount, t.subTotal), currency);
        case 'subtotal': return fmtMoney(t.subTotal, currency);
        case 'discount_total': return fmtMoney(firstOf(t.billDiscountAmount, t.discount), currency);
        case 'tax_amount': return fmtMoney(t.tax, currency);
        case 'delivery_charge': return fmtMoney(t.deliveryCharge, currency);
        case 'round_off': return fmtMoney(t.roundOff, currency);
        case 'grand_total': return fmtMoney(t.grandTotal, currency);
        case 'amount_words': return amountInWords(t.grandTotal, currency);
        // Footer
        case 'terms': return firstOf(m.terms, m.termsAndConditions) || '';
        case 'notes': return m.notes || '';
        case 'bank_name': return company.bankName || company.bankAccountName || '';
        case 'account_number': return company.accountNumber || company.bankAccountNumber || '';
        case 'iban': return company.iban || '';
        case 'signature': return '________________________';
        default: return '';
    }
};

// Cell value for a given items-table column key.
const cellValue = (col, it, idx) => {
    switch (col) {
        case 'lineNo': return String(idx + 1);
        case 'code': return escapeHtml(it.code || '');
        case 'name': return escapeHtml(it.name || it.desc || it.code || '');
        case 'description': return escapeHtml(it.desc || it.detailedDesc || '');
        case 'brand': return escapeHtml(it.brand || '');
        case 'sku': return escapeHtml(it.sku || '');
        case 'barcode': return escapeHtml(it.barcode || '');
        case 'batchNumber': return escapeHtml(it.batchNumber || '');
        case 'location': return escapeHtml(it.location || '');
        case 'unit': return escapeHtml(it.unit || '');
        case 'qty': return fmt2(it.qty);
        case 'price': return fmt2(it.price);
        case 'taxableAmount': return fmt2(num(it.qty) * num(it.price) - num(it.disc));
        case 'disc': return fmt2(it.disc);
        case 'taxPercent': return `${num(it.tax)}%`;
        case 'taxAmt': return fmt2(it.taxAmt);
        case 'total': return fmt2(it.total);
        case 'image': return it.image ? `<img src="${escapeHtml(it.image)}" style="max-width:12mm;max-height:12mm;object-fit:contain;" alt="" />` : '';
        default: return '';
    }
};

// Column catalogue — must stay in sync with OVERLAY_TABLE_COLUMNS in
// InvoiceOverlayDesigner.jsx (key / label / align / relative width).
const TABLE_COLUMN_DEFS = [
    { key: 'lineNo', label: '#', align: 'center', flex: 0.4 },
    { key: 'image', label: 'Image', align: 'center', flex: 0.8 },
    { key: 'code', label: 'Item Code', align: 'left', flex: 1.1 },
    { key: 'name', label: 'Product / Service', align: 'left', flex: 2 },
    { key: 'description', label: 'Description', align: 'left', flex: 2.4 },
    { key: 'brand', label: 'Brand', align: 'left', flex: 1 },
    { key: 'sku', label: 'SKU', align: 'left', flex: 1 },
    { key: 'barcode', label: 'Barcode', align: 'left', flex: 1.2 },
    { key: 'batchNumber', label: 'Batch No', align: 'left', flex: 1.2 },
    { key: 'location', label: 'Location / Bin', align: 'left', flex: 1 },
    { key: 'unit', label: 'UOM', align: 'center', flex: 0.7 },
    { key: 'qty', label: 'Qty', align: 'right', flex: 0.7 },
    { key: 'price', label: 'Unit Price', align: 'right', flex: 1 },
    { key: 'taxableAmount', label: 'Taxable', align: 'right', flex: 1 },
    { key: 'disc', label: 'Discount', align: 'right', flex: 0.9 },
    { key: 'taxPercent', label: 'VAT %', align: 'right', flex: 0.7 },
    { key: 'taxAmt', label: 'VAT Amount', align: 'right', flex: 1 },
    { key: 'total', label: 'Line Total', align: 'right', flex: 1 }
];
const DEFAULT_TABLE_COLUMNS = { lineNo: true, name: true, description: true, qty: true, price: true, taxAmt: true, total: true };

const renderItemsTable = (field, data, options = {}) => {
    const items = Array.isArray(data.items) ? data.items : [];
    const colCfg = field.columns || DEFAULT_TABLE_COLUMNS;
    const cols = TABLE_COLUMN_DEFS.filter((c) => colCfg[c.key]);
    if (cols.length === 0) return '';
    const showHeader = options.showHeader !== false && field.showHeader !== false;
    const zebra = Boolean(field.zebra);
    const totalFlex = cols.reduce((sum, c) => sum + c.flex, 0);
    const indexOffset = options.indexOffset || 0;

    const colGroup = cols.map((c) => `<col style="width:${(c.flex / totalFlex * 100).toFixed(2)}%;" />`).join('');

    const headerCells = cols.map((c) => `<th style="padding:1mm 1.5mm;border-bottom:0.4mm solid #333;text-align:${c.align};white-space:nowrap;">${escapeHtml(c.label)}</th>`).join('');

    const rows = items.map((it, idx) => {
        const globalIdx = idx + indexOffset;
        const bg = zebra && globalIdx % 2 === 1 ? 'background:rgba(0,0,0,0.035);' : '';
        const cells = cols.map((c) => `<td style="padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc;text-align:${c.align};${bg}">${cellValue(c.key, it, globalIdx)}</td>`).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    return `
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:${num(field.fontSize) || 9}pt;font-family:${field.fontFamily || 'Inter'},sans-serif;color:${field.color || '#0f1923'};">
            <colgroup>${colGroup}</colgroup>
            ${showHeader ? `<thead><tr>${headerCells}</tr></thead>` : ''}
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
    const fillOpacity = num(d.fillOpacity);
    const fill = fillOpacity > 0
        ? (d.fillColor || '#ffffff') + Math.round(fillOpacity * 255).toString(16).padStart(2, '0')
        : 'transparent';
    return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${thickness * 0.35}mm ${borderStyle} ${color};background:${fill};"></div>`;
};

// Render a single field into its absolute-position HTML.
const renderField = (f, data, company, printOnlyValues, logoUrl, stampUrl) => {
    if (f.enabled === false) return '';
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

    if (f.id === 'items_table') return null; // handled separately
    if (f.id === 'company_logo') {
        return logoUrl ? `<div style="${styleBits}"><img src="${escapeHtml(logoUrl)}" style="max-width:${width}mm;max-height:${width}mm;object-fit:contain;" alt="" /></div>` : '';
    }
    if (f.id === 'company_stamp') {
        return stampUrl ? `<div style="${styleBits}"><img src="${escapeHtml(stampUrl)}" style="max-width:${width}mm;max-height:${width}mm;object-fit:contain;" alt="" /></div>` : '';
    }
    if (f.id === 'qr_code') return '';

    const value = resolveFieldValue(f.id, data, company);
    if (value === '' || value == null) return '';
    const showLabel = !printOnlyValues && f.printLabel;
    const label = showLabel ? `<span style="font-weight:400;color:#6b7a8a;">${escapeHtml(f.label)}: </span>` : '';
    return `<div style="${styleBits}">${label}${escapeHtml(value)}</div>`;
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
    const fields = Array.isArray(settings.fields) ? settings.fields : [];
    const drawings = Array.isArray(settings.drawings) ? settings.drawings : [];

    const logoUrl = firstOf(company.logoUrl, company.logo, company.companyLogo, company.logoPath);
    const stampUrl = firstOf(company.stampUrl, company.stamp, company.stampPath);

    const drawingHtml = drawings.map(renderDrawing).join('');

    // Find the items_table field config
    const tableField = fields.find((f) => f.id === 'items_table' && f.enabled !== false);

    // Separate fields into header (page 1 only), table (all pages), and
    // last-page fields (totals + footer — appear only on the final page).
    const LAST_PAGE_CATS = new Set(['totals', 'footer']);
    const headerFields = fields.filter((f) => f.id !== 'items_table' && !LAST_PAGE_CATS.has(f.category));
    const lastPageFields = fields.filter((f) => f.enabled !== false && LAST_PAGE_CATS.has(f.category));

    const headerFieldsHtml = headerFields
        .map((f) => renderField(f, data, company, printOnlyValues, logoUrl, stampUrl))
        .filter(Boolean)
        .join('');

    const lastPageFieldsHtml = lastPageFields
        .map((f) => renderField(f, data, company, printOnlyValues, logoUrl, stampUrl))
        .filter(Boolean)
        .join('');

    const allItems = Array.isArray(data.items) ? data.items : [];
    const itemsPerPage = Number(settings.itemsPerPage) || 0;
    const rawPageMarginMm = Number(settings.pageMargin);
    const continuationTopGapMm = Number.isFinite(rawPageMarginMm) && rawPageMarginMm > 0
        ? rawPageMarginMm
        : 4;

    const renderTableDiv = (pageItems, isFirst, indexOffset) => {
        if (!tableField) return '';
        const x = num(tableField.x);
        // On continuation pages, add the configured page margin as extra top offset
        const yBase = num(tableField.y);
        const y = isFirst ? yBase : yBase + continuationTopGapMm;
        const width = num(tableField.width) || 60;
        const styleBits = [
            'position:absolute',
            `left:${x}mm`,
            `top:${y}mm`,
            `width:${width}mm`,
            `font-size:${num(tableField.fontSize) || 9}pt`,
            `font-family:${tableField.fontFamily || 'Inter'},sans-serif`,
            `color:${tableField.color || '#0f1923'}`,
        ].join(';');
        const pageData = { ...data, items: pageItems };
        return `<div style="${styleBits}">${renderItemsTable(tableField, pageData, { showHeader: isFirst, indexOffset })}</div>`;
    };

    // Build one HTML page-div per chunk of items
    const buildPageDiv = (pageItems, isFirst, isLast, indexOffset) => {
        let content = drawingHtml;
        if (isFirst) content += headerFieldsHtml;
        content += renderTableDiv(pageItems, isFirst, indexOffset);
        if (isLast) content += lastPageFieldsHtml;
        return `<div class="ov-page">${content}</div>`;
    };

    let pagesHtml;
    if (itemsPerPage > 0 && allItems.length > itemsPerPage) {
        const pages = [];
        const totalChunks = Math.ceil(allItems.length / itemsPerPage);
        for (let i = 0; i < allItems.length; i += itemsPerPage) {
            const chunkIndex = i / itemsPerPage;
            const chunk = allItems.slice(i, i + itemsPerPage);
            const isFirst = chunkIndex === 0;
            const isLast = chunkIndex === totalChunks - 1;
            pages.push(buildPageDiv(chunk, isFirst, isLast, i));
        }
        pagesHtml = pages.join('\n');
    } else {
        // Single page — show everything
        pagesHtml = buildPageDiv(allItems, true, true, 0);
    }

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
        .ov-page:last-child { page-break-after: auto; }
    }
</style>
</head>
<body>
    ${pagesHtml}
</body>
</html>`;
};

export default generateOverlayInvoiceHtml;
