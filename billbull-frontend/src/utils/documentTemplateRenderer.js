import { getImageUrl } from './urlUtils';
import {
    DEFAULT_TEMPLATE_COLUMNS,
    DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
    sanitizeTemplateColumns,
    sanitizeTemplateDisplayOptions
} from './printTemplateConfig';
import { generateDocFilename } from './filenameUtils';
import { hasCurrencySymbolImage, UAE_DIRHAM_SYMBOL_IMAGE } from './countryCurrencyOptions';

const PURCHASE_TEMPLATE_CATEGORIES = new Set([
    'Local Purchase Order',
    'Goods Receipt Note',
    'Purchase Invoice',
    'Payment Voucher'
]);

const LEFT_META_LABEL_PATTERNS = /^(P\.O|PO Number|Purchase Order|Account Executive|Salesperson|Sales Person|Prepared By)$/i;
const HIDDEN_HEADER_LABEL_PATTERNS = /^(Payment Terms?|Status)$/i;

const DOC_NO_LABELS = {
    'Quotation': 'Quote Number',
    'Sales Invoice': 'Invoice Number',
    'Sales Order (SO)': 'Sales Order',
    'Delivery Note (DO/DN)': 'Delivery Note',
    'Proforma Invoice (PI)': 'Proforma Invoice',
    'Sales Return': 'Credit Note',
    'Local Purchase Order': 'LPO Number',
    'Goods Receipt Note': 'GRN Number',
    'Purchase Invoice': 'Invoice Number',
    'Payment Voucher': 'Voucher Number'
};

const PAPER_DIMENSIONS_MM = {
    A3: { width: 297, height: 420 },
    A4: { width: 210, height: 297 },
    A5: { width: 148, height: 210 },
    Letter: { width: 215.9, height: 279.4 },
    Legal: { width: 215.9, height: 355.6 }
};

const resolvePaperDimensions = (paperSize = 'A4', orientation = 'Portrait') => {
    const base = PAPER_DIMENSIONS_MM[paperSize] || PAPER_DIMENSIONS_MM.A4;
    return orientation === 'Landscape'
        ? { width: base.height, height: base.width }
        : base;
};

const asNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const asText = (value) => (value === null || value === undefined ? '' : String(value));

const compactValues = (...values) =>
    values
        .flat(Infinity)
        .map((value) => asText(value).trim())
        .filter(Boolean);

const firstNonEmpty = (...values) => compactValues(values)[0] || '';

const escapeHtml = (value) =>
    asText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const renderCurrencySymbol = (value) => {
    if (hasCurrencySymbolImage(value)) {
        return `<img src="${escapeHtml(UAE_DIRHAM_SYMBOL_IMAGE)}" alt="AED" style="height:0.82em;width:auto;display:inline-block;vertical-align:-0.08em;margin:0 0.12em;" />`;
    }

    return escapeHtml(value);
};

const formatNumber = (value, decimals = 2) =>
    asNumber(value).toLocaleString('en-AE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });

const joinAddress = (...parts) => compactValues(parts).join(', ');

const resolveDocumentImageUrl = (value) => {
    const imagePath = firstNonEmpty(value);
    return imagePath ? getImageUrl(imagePath) : '';
};

const resolveLogoUrl = (companyProfile = {}) => {
    const logoPath =
        companyProfile.logoUrl ||
        companyProfile.logo ||
        companyProfile.companyLogo ||
        companyProfile.logoPath ||
        '';

    return resolveDocumentImageUrl(logoPath) || null;
};

const resolveStampUrl = (companyProfile = {}) => {
    const stampPath =
        companyProfile.stampUrl ||
        companyProfile.stampPath ||
        '';

    return resolveDocumentImageUrl(stampPath) || null;
};

export const normalizeDocumentCompanyProfile = (companyProfile = {}) => {
    const address = firstNonEmpty(
        companyProfile.fullAddress,
        joinAddress(companyProfile.address, companyProfile.city, companyProfile.country),
        companyProfile.address
    );
    const currencyCode = firstNonEmpty(companyProfile.currency, 'AED');
    const currencyValue = hasCurrencySymbolImage(currencyCode)
        ? currencyCode
        : firstNonEmpty(companyProfile.currencySymbol, currencyCode, 'AED');

    return {
        ...companyProfile,
        companyName: firstNonEmpty(companyProfile.companyName, companyProfile.name, companyProfile.localName),
        localName: firstNonEmpty(companyProfile.localName),
        address,
        phone: firstNonEmpty(companyProfile.phone, companyProfile.mobile),
        email: firstNonEmpty(companyProfile.email),
        trn: firstNonEmpty(companyProfile.trn, companyProfile.taxId),
        website: firstNonEmpty(companyProfile.website),
        logoUrl: resolveLogoUrl(companyProfile),
        stampUrl: resolveStampUrl(companyProfile),
        showStampInPrint: companyProfile.showStampInPrint !== false,
        showStampInEmail: companyProfile.showStampInEmail !== false,
        currency: currencyValue,
        currencySymbol: currencyValue
    };
};

const resolveCurrency = (companyProfile = {}, totals = {}, summaryAmount = {}) => {
    const companyCurrencyCode = firstNonEmpty(companyProfile.currency);
    if (companyCurrencyCode) {
        return hasCurrencySymbolImage(companyCurrencyCode)
            ? companyCurrencyCode
            : firstNonEmpty(companyProfile.currencySymbol, companyCurrencyCode);
    }

    const documentCurrency = firstNonEmpty(totals.currency, summaryAmount.currency);
    if (hasCurrencySymbolImage(documentCurrency)) {
        return documentCurrency;
    }

    return firstNonEmpty(documentCurrency, companyProfile.currencySymbol, companyProfile.currency, 'AED');
};

const resolveCompanyVars = (html, company) => {
    if (!html) return '';

    return html
        .replace(/{company_name}/g, escapeHtml(company.companyName || ''))
        .replace(/{company_address}/g, escapeHtml(company.address || ''))
        .replace(/{company_phone}/g, escapeHtml(company.phone || ''))
        .replace(/{company_email}/g, escapeHtml(company.email || ''))
        .replace(/{company_trn}/g, escapeHtml(company.trn || ''))
        .replace(/{page_number}/g, '<span class="page-num"></span>')
        .replace(/{total_pages}/g, '<span class="page-total"></span>')
        .replace(
            /{company_logo}/g,
            company.logoUrl ? `<img src="${company.logoUrl}" style="height:60px;width:auto;" alt="Company Logo" />` : ''
        )
        .replace(
            /{logo}/g,
            company.logoUrl ? `<img src="${company.logoUrl}" style="height:60px;width:auto;" alt="Company Logo" />` : ''
        );
};

const looksLikePurchasePayload = (data) =>
    data &&
    typeof data === 'object' &&
    (data.party || Array.isArray(data.headerMeta) || Array.isArray(data.references) || Array.isArray(data.paymentDetails));

const normaliseDescription = (item = {}) => {
    if (item.description && typeof item.description === 'object') {
        return {
            title: item.description.title || item.name || '-',
            details: Array.isArray(item.description.details) ? item.description.details.filter(Boolean) : []
        };
    }

    return {
        title: item.name || item.item || item.desc || '-',
        details: compactValues(
            item.remarks || item.desc || (typeof item.description === 'string' ? item.description : '')
        )
    };
};

const normaliseItem = (item = {}) => {
    const description = normaliseDescription(item);
    const qty = asNumber(item.qty ?? item.quantity ?? 0);
    const price = asNumber(item.price ?? item.unitPrice ?? item.unitCost ?? 0);
    const taxableAmount = asNumber(item.taxableAmount ?? (qty * price));
    const taxAmount = asNumber(item.taxAmt ?? item.taxAmount ?? 0);
    const total = asNumber(item.total ?? item.lineAmount ?? (taxableAmount + taxAmount));

    return {
        code: item.code || item.productId || item.itemCode || '',
        sku: item.sku || item.skuCode || '',
        barcode: item.barcode || item.itemBarcode || '',
        localName: item.localName || item.arabicName || '',
        name: item.name || item.item || description.title || '-',
        description,
        image: resolveDocumentImageUrl(item.image || item.imageUrl || ''),
        unit: item.unit || item.uom || '',
        qty,
        price,
        taxableAmount,
        taxAmount,
        taxPercent: asNumber(item.taxPercent ?? item.taxRate ?? item.tax ?? 0),
        discountPercent: asNumber(item.disc ?? item.discount ?? item.discountPercent ?? 0),
        salesPerson: item.salesPerson || item.salesperson || item.salesPersonName || '',
        location: item.location || item.branch || item.branchName || item.locationName || '',
        total
    };
};

const getColumnDefaults = (category, isPurchaseDocument) =>
    isPurchaseDocument
        ? {
            ...DEFAULT_TEMPLATE_COLUMNS,
            qty: category !== 'Payment Voucher',
            unitPrice: category !== 'Payment Voucher',
            taxableAmount: category !== 'Payment Voucher',
            tax: category === 'Purchase Invoice'
        }
        : DEFAULT_TEMPLATE_COLUMNS;

const createColumnModel = (rawColumns = {}) => {
    const c = rawColumns;
    return [
        { key: 'index',         label: '#',                               align: 'center', width: '3%',  enabled: true },
        { key: 'description',   label: 'Product/Services',                align: 'left',   width: '22%', enabled: true },
        { key: 'details',       label: 'Description of Product/Services', align: 'left',   width: '30%', enabled: c.description !== false },
        { key: 'qty',           label: 'Qty',                             align: 'right',  width: '6%',  enabled: c.qty !== false },
        { key: 'unitPrice',     label: 'Unit Price',                      align: 'right',  width: '9%',  enabled: c.unitPrice !== false },
        { key: 'taxableAmount', label: 'Taxable Amount',                  align: 'right',  width: '12%', enabled: Boolean(c.taxableAmount) },
        { key: 'discountPercent', label: 'Discount %',                    align: 'center', width: '7%',  enabled: Boolean(c.discountPercent) },
        { key: 'tax',           label: 'VAT Amount',                      align: 'right',  width: '9%',  enabled: c.tax !== false },
        { key: 'taxPercent',    label: 'Tax %',                           align: 'center', width: '6%',  enabled: Boolean(c.taxPercent) },
        { key: 'total',         label: 'Line Total',                      align: 'right',  width: '9%',  enabled: c.total !== false },
    ].filter((col) => col.enabled);
};

const buildItemDetailLines = (item, columnOptions = {}) =>
    (item.description.details || []).filter((line) => {
        const normalised = asText(line).trim().toLowerCase();

        if (!normalised) return false;
        if (columnOptions.productId && (normalised === asText(item.code).trim().toLowerCase() || normalised.startsWith('code:') || normalised.startsWith('product id:'))) return false;
        if (columnOptions.barcode && (normalised === asText(item.barcode).trim().toLowerCase() || normalised.startsWith('barcode:'))) return false;
        if (columnOptions.sku && (normalised === asText(item.sku).trim().toLowerCase() || normalised.startsWith('sku:'))) return false;
        if (columnOptions.arabicName && (normalised === asText(item.localName).trim().toLowerCase() || normalised.startsWith('arabic:') || normalised.startsWith('arabic name:'))) return false;

        return true;
    });

const buildDescriptionCell = (item, displayOptions = {}) => {
    const showImage = displayOptions.showItemImage && item.image;
    const metadataLines = [
        item.code     ? item.code      : '',
        item.sku      ? item.sku       : '',
        item.barcode  ? item.barcode   : '',
        item.localName ? item.localName : ''
    ].filter(Boolean);

    return `
        <div class="description-wrap">
            ${showImage ? `<img src="${escapeHtml(item.image)}" class="item-thumb" alt="" />` : ''}
            <div class="description-copy">
                <div class="description-title">${escapeHtml(item.description.title || item.name || '-')}</div>
                ${metadataLines.map((line) => `<div class="description-line">${escapeHtml(line)}</div>`).join('')}
            </div>
        </div>
    `;
};

const buildDetailsCell = (item) => {
    const lines = (item.description.details || []).filter(Boolean);
    return lines.length > 0
        ? lines.map((line) => `<div class="desc-detail-line">${escapeHtml(line)}</div>`).join('')
        : '';
};

const renderTableCell = (column, item, index, displayOptions = {}, columnOptions = {}) => {
    switch (column.key) {
        case 'index':
            return `<td class="table-cell cell-center cell-index">${index + 1}</td>`;
        case 'description':
            return `<td class="table-cell cell-description">${buildDescriptionCell(item, displayOptions)}</td>`;
        case 'details':
            return `<td class="table-cell cell-details">${buildDetailsCell(item)}</td>`;
        case 'salesPerson':
            return `<td class="table-cell">${escapeHtml(item.salesPerson || '-')}</td>`;
        case 'location':
            return `<td class="table-cell">${escapeHtml(item.location || '-')}</td>`;
        case 'qty':
            return `
                <td class="table-cell cell-right">
                    <div>${formatNumber(item.qty, 0)}</div>
                    ${item.unit ? `<div class="cell-unit">${escapeHtml(item.unit)}</div>` : ''}
                </td>
            `;
        case 'unitPrice':
            return `<td class="table-cell cell-right">${formatNumber(item.price)}</td>`;
        case 'taxableAmount':
            return `
                <td class="table-cell cell-right">
                    <div>${formatNumber(item.taxableAmount)}</div>
                    ${columnOptions.discount && item.discountPercent > 0
                        ? `<div class="cell-sub">Discount ${formatNumber(item.discountPercent, 0)}%</div><div class="cell-sub">@ ${formatNumber((item.taxableAmount * item.discountPercent) / 100)}</div>`
                        : ''}
                </td>
            `;
        case 'discount':
            return `<td class="table-cell cell-center">${item.discountPercent > 0 ? `${formatNumber(item.discountPercent, 0)}%` : '-'}</td>`;
        case 'discountPercent':
            return `<td class="table-cell cell-center">${item.discountPercent > 0 ? `${formatNumber(item.discountPercent, 0)}%` : '-'}</td>`;
        case 'tax':
            return `
                <td class="table-cell cell-right">
                    <div>${formatNumber(item.taxAmount)}</div>
                    ${item.taxPercent > 0 ? `<div class="cell-sub">@ VAT ${formatNumber(item.taxPercent, 0)}%</div>` : ''}
                </td>
            `;
        case 'taxPercent':
            return `<td class="table-cell cell-center">${item.taxPercent > 0 ? `${formatNumber(item.taxPercent, 0)}%` : '-'}</td>`;
        case 'total':
            return `<td class="table-cell cell-right cell-strong">${formatNumber(item.total)}</td>`;
        default:
            return '<td class="table-cell">-</td>';
    }
};

const buildItemsTable = (layout) => {
    if (!layout.showItemTable) return '';

    const rows = layout.items.map((item, index) => `
        <tr>
            ${layout.columnModel.map((column) => renderTableCell(column, item, index, layout.displayOptions, layout.columnOptions)).join('')}
        </tr>
    `).join('');

    return `
        <section class="table-section">
            <table class="document-table">
                <thead>
                    <tr>
                        ${layout.columnModel.map((column) => `
                            <th class="${column.align === 'right' ? 'cell-right' : column.align === 'center' ? 'cell-center' : ''}" style="width:${column.width};">
                                ${escapeHtml(column.label)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${layout.items.length > 0
                        ? rows
                        : `<tr><td class="table-empty" colspan="${layout.columnModel.length}">No items found.</td></tr>`}
                </tbody>
            </table>
        </section>
    `;
};

const buildTotalsTable = (layout) => {
    if (!layout.showTotalsSection) return '';

    const discountAmount = asNumber(layout.totals.billDiscountAmount ?? layout.totals.discountAmount ?? 0);
    const discountPercent = asNumber(layout.totals.billDiscount ?? 0);
    const amountPaid = asNumber(layout.totals.amountPaid ?? 0);
    const balanceDue = asNumber(layout.totals.balanceDue ?? Math.max(asNumber(layout.totals.grandTotal) - amountPaid, 0));
    const currency = renderCurrencySymbol(layout.currency);

    const row = (label, amount, className = '') => `
        <tr class="${className}">
            <td class="tot-label">${label}</td>
            <td class="tot-amount">${currency} ${formatNumber(amount)}</td>
        </tr>
    `;

    return `
        <table class="totals-table">
            <tbody>
                ${row('Sub Total', layout.totals.subTotal)}
                ${discountAmount > 0 ? `
                    <tr class="amount-negative">
                        <td class="tot-label">Discount${discountPercent > 0 ? ` (${formatNumber(discountPercent, 0)}%)` : ''}</td>
                        <td class="tot-amount">${currency} - ${formatNumber(discountAmount)}</td>
                    </tr>
                ` : ''}
                ${row('Total VAT', layout.totals.tax)}
                ${row('Total', layout.totals.grandTotal, 'grand-total-row')}
                ${amountPaid > 0 ? row('Amount Paid', amountPaid) : ''}
                ${amountPaid > 0 ? row('Balance Due', balanceDue, 'balance-due-row') : ''}
            </tbody>
        </table>
    `;
};

const buildPaymentCard = (layout) => {
    if (!layout.showPaymentDetails || !layout.paymentRows?.length) return '';

    return `
        <section class="info-card payment-card">
            <div class="card-eyebrow">Payment Details</div>
            <div class="reference-grid">
                ${layout.paymentRows.map((row) => `
                    <div class="reference-row">
                        <div class="reference-label">${escapeHtml(row.label)}</div>
                        <div class="reference-value">${escapeHtml(row.value)}</div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
};

const buildSummarySection = (layout) => {
    const hasNotes = Boolean(layout.notes);
    const hasTerms = Boolean(layout.displayOptions.showTerms !== false && layout.terms);
    const totalsTable = buildTotalsTable(layout);

    if (!hasNotes && !hasTerms && !totalsTable) return '';

    return `
        <section class="summary-section">
            ${totalsTable ? `<div class="summary-totals">${totalsTable}</div>` : ''}
            ${(hasNotes || hasTerms) ? `
                <div class="summary-notes">
                    ${hasNotes ? `
                        <div class="summary-label">Notes</div>
                        <div class="notes-copy">${escapeHtml(layout.notes)}</div>
                    ` : ''}
                    ${hasTerms ? `
                        <div class="summary-label${hasNotes ? ' summary-label-terms' : ''}">Terms &amp; Conditions</div>
                        <div class="notes-copy">${escapeHtml(layout.terms)}</div>
                    ` : ''}
                </div>
            ` : ''}
        </section>
    `;
};

const buildSignatureBlock = (layout) => {
    if (!layout.showSignatureBlock) return '';

    return `
        <section class="signature-card">
            <div class="card-eyebrow">Authorisation</div>
            <div class="signature-grid">
                <div class="signature-line">Prepared By</div>
                <div class="signature-line">Approved By</div>
            </div>
        </section>
    `;
};

const buildWatermark = (status) => {
    const upperStatus = asText(status).toUpperCase().replace(/\s+/g, '_');

    if (!['DRAFT', 'CANCELLED', 'REJECTED'].includes(upperStatus)) {
        return '';
    }

    return `
        <div class="document-watermark">
            <span>${escapeHtml(upperStatus.replace(/_/g, ' '))}</span>
        </div>
    `;
};

const resolveLayoutDate = (layout) =>
    firstNonEmpty(
        (layout.headerRows || []).find((row) => /^date$/i.test(asText(row.label).trim()))?.value,
        new Date().toISOString().slice(0, 10)
    );

const buildStampBlock = (layout, renderTarget) => {
    const showStamp = renderTarget === 'email'
        ? layout.company.showStampInEmail
        : layout.company.showStampInPrint;

    if (!layout.company.stampUrl || !showStamp) return '';

    return `
        <div class="stamp-container">
            <img src="${layout.company.stampUrl}" alt="Company Stamp" />
        </div>
    `;
};

const buildPrintDateStamp = (layout, renderTarget) =>
    renderTarget === 'print'
        ? `<div class="print-date-stamp">Printed: ${escapeHtml(new Date().toISOString().slice(0, 10))}</div>`
        : '';

const buildHeaderAddon = (layout) =>
    layout.headerAddon
        ? `<div class="layout-addon layout-addon-header">${layout.headerAddon}</div>`
        : '';

const buildFooterAddon = (layout) =>
    layout.footerAddon
        ? `<div class="layout-addon layout-addon-footer">${layout.footerAddon}</div>`
        : '';

const buildGrandTotal = (layout) => {
    if (!layout.showHighlight) return '';

    return `
        <div class="grand-total-display">
            <div class="grand-total-label">${escapeHtml(layout.highlight.label || 'Grand Total')}</div>
            <div class="grand-total-value">${renderCurrencySymbol(layout.currency)} ${formatNumber(layout.highlight.value)}</div>
        </div>
    `;
};

const buildLogoBlock = (layout) => {
    if (layout.displayOptions.showLogo === false) return '';

    return layout.company.logoUrl
        ? `
            <div class="company-logo">
                <img src="${layout.company.logoUrl}" alt="Company Logo" />
            </div>
        `
        : `
            <div class="company-logo company-logo-fallback" aria-label="Company Logo">
                <span>G</span>
            </div>
        `;
};

const buildHeader = (layout) => {
    const visibleHeaderRows = (layout.headerRows || [])
        .filter((row) => !HIDDEN_HEADER_LABEL_PATTERNS.test(asText(row.label).trim()));
    const visibleReferenceRows = (layout.referenceRows || [])
        .filter((row) => !HIDDEN_HEADER_LABEL_PATTERNS.test(asText(row.label).trim()));
    const leftMetaRows = [
        ...visibleHeaderRows,
        ...visibleReferenceRows
    ].filter((row) => LEFT_META_LABEL_PATTERNS.test(asText(row.label).trim()));
    const centerMetaRows = visibleReferenceRows.filter((row) => !LEFT_META_LABEL_PATTERNS.test(asText(row.label).trim()));
    const centerHeaderRows = visibleHeaderRows.filter((row) => !LEFT_META_LABEL_PATTERNS.test(asText(row.label).trim()));

    const centerItems = [
        { label: layout.docNoLabel || 'Document Number', value: layout.docNo || '-' },
        ...centerHeaderRows,
        ...centerMetaRows
    ];

    const customerLines = layout.party ? compactValues(
        layout.party.address || '',
        layout.party.taxId ? `GSTIN : ${layout.party.taxId}` : '',
        layout.party.phone || '',
        layout.party.email || ''
    ) : [];

    const companyLines = compactValues(
        layout.company.address,
        layout.company.email,
        layout.company.phone,
        layout.company.trn ? `TRN . ${layout.company.trn}` : '',
        layout.company.website
    );

    return `
        <header class="document-header">
            <div class="header-left">
                <div class="document-title">${escapeHtml(layout.title)}</div>

                ${layout.displayOptions.showCustomerDetails !== false && layout.party ? `
                    <div class="bill-to-block">
                        <div class="bill-to-eyebrow">${escapeHtml(layout.partyLabel)},</div>
                        <div class="bill-to-name">${escapeHtml(layout.party.name || '')}</div>
                        ${customerLines.map((line) => `<div class="bill-to-line">${escapeHtml(line)}</div>`).join('')}
                    </div>
                ` : ''}

                ${leftMetaRows.length > 0 ? `
                    <div class="left-meta-block">
                        ${leftMetaRows.map((row) => `
                            <div class="left-meta-item">
                                <div class="left-meta-label">${escapeHtml(row.label)}</div>
                                <div class="left-meta-value">${escapeHtml(row.value)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="header-center">
                ${centerItems.map((item) => `
                    <div class="doc-meta-item">
                        <div class="doc-meta-label">${escapeHtml(item.label)}</div>
                        <div class="doc-meta-value">${escapeHtml(item.value)}</div>
                    </div>
                `).join('')}
            </div>

            <div class="header-right">
                ${buildLogoBlock(layout)}

                ${layout.displayOptions.showCompanyDetails !== false ? `
                    <div class="company-panel">
                        <div class="company-name">${escapeHtml(layout.company.companyName || '')}</div>
                        ${layout.company.localName && layout.company.localName !== layout.company.companyName
                            ? `<div class="company-copy company-local-name">${escapeHtml(layout.company.localName)}</div>`
                            : ''}
                        ${companyLines.map((line) => `<div class="company-copy">${escapeHtml(line)}</div>`).join('')}
                    </div>
                ` : ''}
            </div>
        </header>
    `;
};

const buildFooterBar = (layout, renderTarget, billBullLogo) => {
    if (renderTarget === 'print') {
        return '';
    }

    return `
        <footer class="document-footer">
            <div class="footer-bar">
                <div>${escapeHtml(layout.company.companyName || '')}</div>
                <div class="footer-center">Document ${escapeHtml(layout.docNo || '-')}</div>
                <div class="footer-right">${escapeHtml(layout.title)}</div>
            </div>
            ${billBullLogo
        ? `<div class="footer-brand"><img src="${billBullLogo}" alt="Powered by BillBull" /></div>`
        : ''}
        </footer>
    `;
};

const buildCoreStyles = () => `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        font-family: 'Inter', sans-serif;
        font-size: 10px;
        font-weight: 400;
        line-height: 1.4;
        color: #111827;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    body {
        background: #000000;
    }
    .document-shell {
        position: relative;
        width: 100%;
        max-width: 1000px;
        margin: 0 auto;
        padding: 24px;
        border-radius: 8px;
        background: #ffffff;
        overflow: visible;
    }
    .document-shell,
    .document-shell * {
        font-family: 'Inter', sans-serif;
        font-size: 10px;
        font-weight: 400;
        line-height: 1.4;
        letter-spacing: 0;
    }
    .document-shell > *:not(.document-watermark) {
        position: relative;
        z-index: 1;
    }
    .document-header {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(180px, 240px) minmax(240px, 300px);
        gap: 28px;
        align-items: start;
        margin-bottom: 16px;
    }
    .document-title {
        font-size: 20px;
        line-height: 1.2;
        font-weight: 700;
        margin: 0 0 24px;
        color: #000000;
    }
    .header-center {
        display: grid;
        gap: 10px;
        padding-top: 48px;
        justify-items: end;
        text-align: right;
    }
    .header-right {
        display: grid;
        gap: 10px;
        justify-items: end;
        text-align: right;
        align-self: start;
        padding-top: 0;
    }
    .company-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        width: auto;
        max-width: 120px;
        max-height: 96px;
        background: transparent;
    }
    .company-logo img {
        width: auto;
        max-width: 120px;
        max-height: 96px;
        object-fit: contain;
        border: 0;
        border-radius: 0;
    }
    .company-logo-fallback {
        width: 96px;
        height: 96px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        color: #ffffff;
        font-weight: 700;
    }
    .company-logo-fallback span {
        font-size: 20px;
        font-weight: 700;
        line-height: 1;
    }
    .company-panel {
        display: grid;
        gap: 0;
        justify-items: end;
        max-width: 260px;
        text-align: right;
    }
    .company-name,
    .company-local-name {
        font-weight: 700;
    }
    .bill-to-block {
        margin-bottom: 16px;
    }
    .bill-to-eyebrow,
    .left-meta-label,
    .doc-meta-label {
        color: #111827;
        font-weight: 700;
    }
    .bill-to-name,
    .bill-to-line,
    .left-meta-value,
    .doc-meta-value,
    .company-copy {
        color: #111827;
    }
    .bill-to-name {
        margin-top: 8px;
    }
    .left-meta-block {
        display: grid;
        gap: 12px;
    }
    .doc-meta-item {
        display: grid;
        gap: 4px;
        justify-items: end;
    }
    .grand-total-display {
        padding: 16px 0;
        text-align: right;
    }
    .grand-total-label {
        color: #111827;
        font-weight: 700;
        margin-bottom: 4px;
    }
    .grand-total-value {
        color: #000000;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
    }
    .layout-addon {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed #e0e0e0;
        color: #334155;
    }
    .content-stack {
        display: grid;
        gap: 16px;
    }
    .info-card,
    .signature-card {
        border-top: 1px solid #e0e0e0;
        padding-top: 8px;
    }
    .payment-card {
        grid-column: 1 / -1;
    }
    .card-eyebrow {
        color: #6b7280;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 8px;
    }
    .reference-grid {
        display: grid;
        gap: 4px;
    }
    .reference-row {
        display: grid;
        grid-template-columns: 110px minmax(0, 1fr);
        gap: 10px;
    }
    .reference-label {
        color: #6b7280;
        font-weight: 700;
        text-transform: uppercase;
    }
    .reference-value {
        color: #111827;
        font-weight: 700;
        word-break: break-word;
    }
    .table-section {
        width: 100%;
    }
    .document-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        border-top: 1px solid #e0e0e0;
    }
    .document-table thead {
        display: table-header-group;
    }
    .document-table thead th {
        padding: 8px;
        background: #ffffff;
        color: #111827;
        font-weight: 700;
        text-align: left;
        border-bottom: 1px solid #e0e0e0;
        white-space: normal;
    }
    .document-table thead th.cell-right {
        text-align: right;
    }
    .document-table thead th.cell-center {
        text-align: center;
    }
    .document-table tbody tr {
        page-break-inside: avoid;
    }
    .table-cell {
        padding: 10px 8px;
        color: #111827;
        vertical-align: top;
        border-bottom: 1px solid #e0e0e0;
        word-break: break-word;
    }
    .table-empty {
        padding: 16px 8px;
        text-align: center;
        color: #9ca3af;
        border-bottom: 1px solid #e0e0e0;
    }
    .cell-right { text-align: right; }
    .cell-center { text-align: center; }
    .cell-index {
        color: #111827;
        vertical-align: middle;
    }
    .cell-strong { font-weight: 700; }
    .cell-unit,
    .cell-sub {
        color: #111827;
        margin-top: 4px;
    }
    .cell-description {
        min-width: 0;
    }
    .description-wrap {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        min-width: 0;
    }
    .item-thumb {
        width: 64px;
        height: 64px;
        max-width: 64px;
        max-height: 64px;
        object-fit: contain;
        flex: 0 0 64px;
        background: transparent;
    }
    .description-copy {
        flex: 1 1 auto;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .description-title {
        color: #111827;
        font-weight: 700;
        margin-bottom: 2px;
    }
    .description-line,
    .desc-detail-line {
        color: #111827;
        margin-top: 1px;
    }
    .summary-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-top: 16px;
    }
    .summary-notes {}
    .summary-label {
        color: #9ca3af;
        font-weight: 700;
        margin-bottom: 8px;
    }
    .summary-label-terms {
        margin-top: 16px;
    }
    .notes-copy {
        color: #111827;
        white-space: pre-wrap;
    }
    .notes-copy-empty {
        min-height: 58px;
    }
    .summary-totals {
        display: flex;
        justify-content: flex-end;
    }
    .totals-table {
        width: auto;
        border-collapse: collapse;
    }
    .totals-table td {
        padding: 5px 0;
        border: 0;
    }
    .tot-label {
        color: #111827;
        font-weight: 700;
        text-align: right;
        padding-right: 12px;
        white-space: nowrap;
    }
    .tot-amount {
        color: #111827;
        text-align: right;
        font-weight: 700;
        min-width: 80px;
        white-space: nowrap;
    }
    .grand-total-row td {
        padding-top: 6px;
        font-weight: 700;
        font-size: 11px;
    }
    .balance-due-row td {
        font-weight: 700;
    }
    .amount-negative td {
        color: #b91c1c;
    }
    .signature-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 16px;
    }
    .signature-line {
        padding-top: 8px;
        border-top: 1px solid #9ca3af;
        text-align: center;
        color: #4b5563;
    }
    .document-footer {
        margin-top: 16px;
        padding-top: 8px;
        border-top: 1px solid #e0e0e0;
        color: #6b7280;
    }
    .footer-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
    }
    .footer-center {
        flex: 1;
        text-align: center;
    }
    .footer-right {
        text-align: right;
    }
    .footer-brand {
        display: flex;
        justify-content: flex-end;
        margin-top: 6px;
    }
    .footer-brand img {
        width: auto;
        height: 14px;
        opacity: 0.62;
    }
    .document-watermark {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 0;
    }
    .document-watermark span {
        transform: rotate(-28deg);
        color: rgba(17, 24, 39, 0.05);
        font-weight: 700;
        line-height: 1;
    }
    .print-date-stamp {
        margin-top: 16px;
        padding-top: 8px;
        border-top: 1px solid #e0e0e0;
        color: #6b7280;
        text-align: left;
    }
    .stamp-container {
        text-align: right;
        margin-top: 10px;
    }
    .stamp-container img {
        max-width: 120px;
        opacity: 0.85;
    }
    .page-num::before { content: counter(page); }
    .page-total::before { content: counter(pages); }
    @media (max-width: 720px) {
        .document-header,
        .signature-grid {
            grid-template-columns: 1fr;
        }
        .document-title {
            margin-bottom: 16px;
        }
        .header-center,
        .header-right {
            padding-top: 0;
            text-align: left;
            justify-items: start;
        }
        .company-panel {
            justify-items: start;
        }
        .doc-meta-item,
        .header-right,
        .summary-totals {
            text-align: left;
            justify-items: start;
            justify-content: flex-start;
        }
        .tot-label {
            text-align: left;
            padding-right: 14px;
        }
        .footer-bar {
            flex-direction: column;
            align-items: flex-start;
        }
        .footer-center,
        .footer-right {
            text-align: left;
        }
    }
`;

const buildPrintStyles = (paperSize = 'A4', orientation = 'Portrait') => {
    const resolvedPaperSize = paperSize || 'A4';
    const resolvedOrientation = orientation || 'Portrait';
    const page = resolvePaperDimensions(resolvedPaperSize, resolvedOrientation);

    return `
        @page {
            size: ${resolvedPaperSize} ${resolvedOrientation};
            margin: 0;
        }
        html,
        body {
            width: ${page.width}mm;
            min-height: ${page.height}mm;
        }
        body {
            background: #000000;
            padding: 0;
        }
        .document-shell {
            width: ${page.width}mm;
            min-height: ${page.height}mm;
            height: auto;
            max-width: none;
            margin: 0 auto;
            padding: 12mm;
            border-radius: 0;
            background: #ffffff;
        }
        .document-footer {
            position: static;
        }
        @media print {
            html,
            body {
                width: ${page.width}mm;
                min-height: ${page.height}mm;
                background: #ffffff;
            }
            body {
                padding: 0;
            }
            .document-shell {
                width: ${page.width}mm;
                min-height: ${page.height}mm;
                height: auto;
                margin: 0;
                padding: 12mm;
                border-radius: 0;
                box-shadow: none;
            }
            /* Force 3-column header layout — prevents the responsive breakpoint
               from collapsing columns on narrow paper sizes like A4 */
            .document-header {
                grid-template-columns: minmax(0, 1.15fr) minmax(180px, 240px) minmax(240px, 300px) !important;
                gap: 28px !important;
            }
            .signature-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
            .document-title {
                margin-bottom: 24px !important;
            }
            .header-center {
                padding-top: 48px !important;
                text-align: right !important;
                justify-items: end !important;
            }
            .header-right {
                padding-top: 0 !important;
                text-align: right !important;
                justify-items: end !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-end !important;
                gap: 8px !important;
            }
            .company-logo {
                display: flex !important;
                justify-content: flex-end !important;
                align-items: flex-end !important;
                width: 100% !important;
                max-width: none !important;
            }
            .company-logo img {
                display: block !important;
                max-width: 120px !important;
                max-height: 80px !important;
                object-fit: contain !important;
                margin-left: auto !important;
            }
            .company-logo-fallback {
                margin-left: auto !important;
            }
            .company-panel {
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-end !important;
                text-align: right !important;
                width: 100% !important;
            }
            .company-name,
            .company-local-name,
            .company-copy {
                text-align: right !important;
            }
            .doc-meta-item {
                text-align: right !important;
                justify-items: end !important;
            }
            .summary-totals {
                justify-content: flex-end !important;
            }
            .tot-label {
                text-align: right !important;
                padding-right: 12px !important;
            }
            .footer-bar {
                flex-direction: row !important;
                align-items: center !important;
            }
            .footer-center,
            .footer-right {
                text-align: right !important;
            }
        }
    `;
};

const buildEmailStyles = () => `
    body {
        background: #000000;
        padding: 24px;
    }
    .document-shell {
        max-width: 1000px;
        margin: 0 auto;
        padding: 24px;
        border-radius: 8px;
        background: #ffffff;
    }
`;

const enrichItems = (items, documentSalesPerson = '', documentLocation = '') =>
    items.map((item) => ({
        ...item,
        salesPerson: firstNonEmpty(item.salesPerson, documentSalesPerson),
        location: firstNonEmpty(item.location, documentLocation)
    }));

const normalisePurchaseLayout = (template, data, companyProfile, renderTarget) => {
    const company = normalizeDocumentCompanyProfile(companyProfile);
    const displayOptions = sanitizeTemplateDisplayOptions(
        template.displayOptions,
        {
            ...DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
            showTerms: template.category !== 'Payment Voucher'
        }
    );
    const columnOptions = sanitizeTemplateColumns(template.columns, getColumnDefaults(template.category, true));
    const columnModel = createColumnModel(columnOptions);
    const currency = resolveCurrency(company, data.totals || {}, data.summaryAmount || {});
    const headerMeta = Array.isArray(data.headerMeta) ? data.headerMeta.filter((row) => row?.value) : [];
    const references = Array.isArray(data.references) ? data.references.filter((row) => row?.value) : [];
    const paymentDetails = Array.isArray(data.paymentDetails) ? data.paymentDetails.filter((row) => row?.value) : [];
    const documentSalesPerson = firstNonEmpty(
        data.meta?.salesPerson,
        data.meta?.salesperson,
        headerMeta.find((row) => /buyer|prepared by|salesperson|sales person/i.test(asText(row.label)))?.value,
        references.find((row) => /buyer|prepared by|salesperson|sales person/i.test(asText(row.label)))?.value
    );
    const documentLocation = firstNonEmpty(
        data.meta?.location,
        data.meta?.branch,
        data.meta?.branchName,
        headerMeta.find((row) => /location|warehouse|branch/i.test(asText(row.label)))?.value,
        references.find((row) => /location|warehouse|branch/i.test(asText(row.label)))?.value
    );

    const headerRows = [
        { label: 'Date', value: data.date || '-' },
        ...headerMeta.filter((row) => /due date|expected delivery|valid/i.test(asText(row.label)))
    ].filter((row) => row?.value);

    const referenceRows = [
        ...headerMeta.filter((row) => !/due date|expected delivery|valid/i.test(asText(row.label))),
        ...references
    ].filter((row) => row?.value);

    const items = enrichItems(
        Array.isArray(data.items) ? data.items.map(normaliseItem) : [],
        documentSalesPerson,
        documentLocation
    );
    const summaryLabel = data.summaryAmount?.label || (asNumber(data.totals?.balanceDue) > 0 ? 'Balance Due' : 'Grand Total');
    const summaryValue = data.summaryAmount?.value ?? (
        summaryLabel.toLowerCase().includes('balance')
            ? data.totals?.balanceDue
            : data.totals?.grandTotal
    );
    const totals = {
        subTotal: asNumber(data.totals?.subTotal),
        tax: asNumber(data.totals?.tax),
        grandTotal: asNumber(data.totals?.grandTotal ?? data.summaryAmount?.value),
        amountPaid: asNumber(data.totals?.amountPaid),
        balanceDue: asNumber(data.totals?.balanceDue),
        billDiscount: asNumber(data.totals?.billDiscount),
        billDiscountAmount: asNumber(data.totals?.billDiscountAmount ?? data.totals?.discountAmount)
    };

    return {
        title: asText(data.title || template.category || 'PURCHASE DOCUMENT'),
        docNo: asText(data.docNo || ''),
        docNoLabel: DOC_NO_LABELS[template.category] || 'Document Number',
        status: asText(data.status || ''),
        company,
        currency,
        partyLabel: template.category === 'Payment Voucher' ? 'Paid To' : 'Vendor',
        party: data.party || null,
        referenceRows,
        paymentRows: paymentDetails,
        headerRows,
        items,
        columnOptions,
        columnModel,
        totals,
        notes: asText(data.notes || ''),
        terms: asText(template.termsContent || ''),
        displayOptions,
        showItemTable: items.length > 0,
        showTotalsSection: totals.grandTotal > 0 || totals.amountPaid > 0,
        showHighlight: summaryValue !== undefined && summaryValue !== null && asNumber(summaryValue) > 0,
        showPaymentDetails: paymentDetails.length > 0,
        showSignatureBlock: false,
        highlight: {
            label: summaryLabel,
            value: asNumber(summaryValue)
        },
        headerAddon: resolveCompanyVars(template.headerContent, company),
        footerAddon: resolveCompanyVars(template.footerContent, company),
        renderTarget
    };
};

const normaliseGenericLayout = (template, data, companyProfile, renderTarget) => {
    const company = normalizeDocumentCompanyProfile(companyProfile);
    const displayOptions = sanitizeTemplateDisplayOptions(template.displayOptions);
    const columnOptions = sanitizeTemplateColumns(template.columns, getColumnDefaults(template.category, false));
    const columnModel = createColumnModel(columnOptions);
    const currency = resolveCurrency(company, data.totals || {}, {});
    const customer = data.customer || {};
    const documentSalesPerson = firstNonEmpty(data.meta?.salesPerson, data.meta?.salesperson, data.meta?.accountExecutive);
    const documentLocation = firstNonEmpty(data.meta?.location, data.meta?.branch, data.meta?.branchName);
    const items = enrichItems(
        Array.isArray(data.items) ? data.items.map(normaliseItem) : [],
        documentSalesPerson,
        documentLocation
    );
    const totals = {
        subTotal: asNumber(data.totals?.subTotal),
        tax: asNumber(data.totals?.tax),
        grandTotal: asNumber(data.totals?.grandTotal),
        amountPaid: asNumber(data.totals?.amountPaid),
        balanceDue: asNumber(data.totals?.balanceDue),
        billDiscount: asNumber(data.totals?.billDiscount),
        billDiscountAmount: asNumber(data.totals?.billDiscountAmount ?? data.totals?.discountAmount)
    };
    const highlightValue = totals.balanceDue > 0 ? totals.balanceDue : totals.grandTotal;
    const referenceRows = [
        data.meta?.poNumber ? { label: 'P.O Number', value: data.meta.poNumber } : null,
        columnOptions.salesPerson && documentSalesPerson ? { label: 'Sales Person', value: documentSalesPerson } : null,
        data.meta?.reference ? { label: 'Reference', value: data.meta.reference } : null,
        columnOptions.location && documentLocation ? { label: 'Location / Branch', value: documentLocation } : null
    ].filter(Boolean);

    return {
        title: asText(data.title || template.category || 'DOCUMENT'),
        docNo: asText(data.docNo || ''),
        docNoLabel: DOC_NO_LABELS[template.category] || 'Document Number',
        status: asText(data.meta?.status || ''),
        company,
        currency,
        partyLabel: asText(data.meta?.partyLabel || 'Bill To'),
        party: {
            name: firstNonEmpty(customer.name, customer.customerName, 'Unknown Customer'),
            code: firstNonEmpty(customer.code, customer.customerCode),
            address: firstNonEmpty(customer.address, customer.billingAddress),
            phone: firstNonEmpty(customer.phone, customer.mobile),
            email: firstNonEmpty(customer.email),
            taxId: firstNonEmpty(customer.trn, customer.taxId)
        },
        referenceRows,
        paymentRows: [],
        headerRows: [
            { label: 'Date', value: data.date || '-' },
            ...(data.meta?.validTill ? [{ label: data.meta.validTillLabel || 'Due Date', value: data.meta.validTill }] : [])
        ],
        items,
        columnOptions,
        columnModel,
        totals,
        notes: asText(data.meta?.notes || ''),
        terms: asText(template.termsContent || ''),
        displayOptions,
        showItemTable: items.length > 0,
        showTotalsSection: totals.grandTotal > 0 || totals.amountPaid > 0,
        showHighlight: highlightValue > 0,
        showPaymentDetails: false,
        showSignatureBlock: false,
        highlight: {
            label: totals.balanceDue > 0 ? 'Balance Due' : 'Grand Total',
            value: highlightValue
        },
        headerAddon: resolveCompanyVars(template.headerContent, company),
        footerAddon: resolveCompanyVars(template.footerContent, company),
        renderTarget
    };
};

const buildLayout = (template, data, options = {}, renderTarget = 'print') => {
    const companyProfile = options.companyProfile || {};
    const shouldUsePurchaseLayout = PURCHASE_TEMPLATE_CATEGORIES.has(template?.category) || looksLikePurchasePayload(data);

    return shouldUsePurchaseLayout
        ? normalisePurchaseLayout(template, data, companyProfile, renderTarget)
        : normaliseGenericLayout(template, data, companyProfile, renderTarget);
};

const buildDocumentHtml = (template, data, options = {}, renderTarget = 'print') => {
    const layout = buildLayout(template, data, options, renderTarget);
    const styles = renderTarget === 'email'
        ? `${buildCoreStyles()}${buildEmailStyles()}`
        : `${buildCoreStyles()}${buildPrintStyles(template.paperSize || 'A4', template.orientation || 'Portrait')}`;
    
    const documentTitle = generateDocFilename(
        layout.title,
        layout.docNo,
        layout.party?.name,
        resolveLayoutDate(layout),
        layout.currency
    );

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapeHtml(documentTitle)}</title>
            <style>${styles}</style>
        </head>
        <body>
            <div class="document-shell">
                ${buildHeader(layout)}
                ${buildHeaderAddon(layout)}
                ${buildGrandTotal(layout)}
                <main class="content-stack">
                    ${buildPaymentCard(layout)}
                    ${buildItemsTable(layout)}
                    ${buildSummarySection(layout)}
                    ${buildSignatureBlock(layout)}
                    ${buildStampBlock(layout, renderTarget)}
                    ${buildPrintDateStamp(layout, renderTarget)}
                </main>
                ${buildFooterBar(layout, renderTarget, options.billBullLogo)}
                ${buildFooterAddon(layout)}
                ${buildWatermark(layout.status)}
            </div>
        </body>
        </html>
    `;
};

export const generateDocumentPrintHtml = (template, data, options = {}) =>
    buildDocumentHtml(template, data, options, 'print');

export const generateDocumentEmailHtml = (template, data, options = {}) =>
    buildDocumentHtml(template, data, options, 'email');
