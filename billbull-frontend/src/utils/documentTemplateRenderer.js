import { getImageUrl } from './urlUtils';
import {
    DEFAULT_TEMPLATE_COLUMNS,
    DEFAULT_TEMPLATE_DISPLAY_OPTIONS,
    sanitizeTemplateColumns,
    sanitizeTemplateDisplayOptions
} from './printTemplateConfig';

const PURCHASE_TEMPLATE_CATEGORIES = new Set([
    'Local Purchase Order',
    'Goods Receipt Note',
    'Purchase Invoice',
    'Payment Voucher'
]);

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

const formatNumber = (value, decimals = 2) =>
    asNumber(value).toLocaleString('en-AE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });

const formatCurrency = (currency, value) => `${currency} ${formatNumber(value)}`;

const joinAddress = (...parts) => compactValues(parts).join(', ');

const resolveLogoUrl = (companyProfile = {}) => {
    const logoPath =
        companyProfile.logoUrl ||
        companyProfile.logo ||
        companyProfile.companyLogo ||
        companyProfile.logoPath ||
        '';

    return logoPath ? getImageUrl(logoPath) : null;
};

export const normalizeDocumentCompanyProfile = (companyProfile = {}) => {
    const address = firstNonEmpty(
        companyProfile.fullAddress,
        joinAddress(companyProfile.address, companyProfile.city, companyProfile.country),
        companyProfile.address
    );

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
        currency: firstNonEmpty(companyProfile.currencySymbol, companyProfile.currency, 'AED'),
        currencySymbol: firstNonEmpty(companyProfile.currencySymbol, companyProfile.currency, 'AED')
    };
};

const resolveCurrency = (companyProfile = {}, totals = {}, summaryAmount = {}) =>
    firstNonEmpty(
        totals.currency,
        summaryAmount.currency,
        companyProfile.currencySymbol,
        companyProfile.currency,
        'AED'
    );

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
            details: Array.isArray(item.description.details)
                ? item.description.details.filter(Boolean)
                : []
        };
    }

    return {
        title: item.name || item.item || '-',
        details: compactValues(item.desc, typeof item.description === 'string' ? item.description : '')
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
        localName: item.localName || item.arabicName || '',
        name: item.name || item.item || description.title || '-',
        description,
        image: item.image || item.imageUrl || '',
        unit: item.unit || item.uom || '',
        qty,
        price,
        taxableAmount,
        taxAmount,
        taxPercent: asNumber(item.taxPercent ?? item.taxRate ?? item.tax ?? 0),
        discountPercent: asNumber(item.disc ?? item.discount ?? item.discountPercent ?? 0),
        total
    };
};

const getColumnDefaults = (category, isPurchaseDocument) =>
    isPurchaseDocument
        ? {
            ...DEFAULT_TEMPLATE_COLUMNS,
            qty: category !== 'Payment Voucher',
            unitPrice: category !== 'Payment Voucher',
            tax: category === 'Purchase Invoice'
        }
        : DEFAULT_TEMPLATE_COLUMNS;

const createColumnModel = (rawColumns = {}, isPurchaseDocument = false, category = '') => {
    const columns = sanitizeTemplateColumns(rawColumns, getColumnDefaults(category, isPurchaseDocument));
    const showTaxableAmount = isPurchaseDocument && category !== 'Payment Voucher';
    const showDescription = columns.description || columns.productId || columns.sku || columns.arabicName;

    return [
        {
            key: 'index',
            label: '#',
            align: 'center',
            width: '28px',
            enabled: true
        },
        {
            key: 'description',
            label: 'Description',
            align: 'left',
            width: 'auto',
            enabled: showDescription
        },
        {
            key: 'qty',
            label: 'Qty',
            align: 'right',
            width: '72px',
            enabled: columns.qty
        },
        {
            key: 'unitPrice',
            label: 'Unit Price',
            align: 'right',
            width: '96px',
            enabled: columns.unitPrice
        },
        {
            key: 'taxableAmount',
            label: 'Taxable Amount',
            align: 'right',
            width: '116px',
            enabled: showTaxableAmount
        },
        {
            key: 'discount',
            label: 'Discount',
            align: 'center',
            width: '82px',
            enabled: columns.discount
        },
        {
            key: 'tax',
            label: 'Tax',
            align: 'right',
            width: '92px',
            enabled: columns.tax
        },
        {
            key: 'total',
            label: 'Total',
            align: 'right',
            width: '104px',
            enabled: columns.total
        }
    ].filter((column) => column.enabled);
};

const buildDescriptionCell = (item, displayOptions = {}, columnOptions = {}) => {
    const showImage = displayOptions.showItemImage && item.image;
    const metadataLines = [
        columnOptions.productId && item.code ? `Product ID: ${item.code}` : '',
        columnOptions.arabicName && item.localName ? `Arabic Name: ${item.localName}` : '',
        columnOptions.sku && item.sku ? `SKU: ${item.sku}` : ''
    ].filter(Boolean);
    const detailLines = (item.description.details || []).filter((line) => {
        const normalized = asText(line).trim().toLowerCase();
        if (!normalized) return false;
        if (columnOptions.productId && normalized.startsWith('product id:')) return false;
        if (columnOptions.arabicName && normalized.startsWith('arabic name:')) return false;
        if (columnOptions.sku && normalized.startsWith('sku:')) return false;
        return true;
    });
    const combinedLines = [...metadataLines, ...detailLines];

    return `
        <div class="description-wrap">
            ${showImage ? `<img src="${item.image}" class="item-thumb" alt="" />` : ''}
            <div class="description-copy">
                <div class="description-title">${escapeHtml(item.description.title || item.name || '-')}</div>
                ${combinedLines.map((line) => `<div class="description-line">${escapeHtml(line)}</div>`).join('')}
            </div>
        </div>
    `;
};

const renderTableCell = (column, item, index, displayOptions = {}, columnOptions = {}) => {
    switch (column.key) {
        case 'index':
            return `<td class="table-cell cell-center cell-index">${index + 1}</td>`;
        case 'description':
            return `<td class="table-cell cell-description">${buildDescriptionCell(item, displayOptions, columnOptions)}</td>`;
        case 'qty':
            return `<td class="table-cell cell-right">${escapeHtml(`${formatNumber(item.qty, 0)}${item.unit ? ` ${item.unit}` : ''}`)}</td>`;
        case 'unitPrice':
            return `<td class="table-cell cell-right">${formatNumber(item.price)}</td>`;
        case 'taxableAmount':
            return `<td class="table-cell cell-right">${formatNumber(item.taxableAmount)}</td>`;
        case 'discount':
            return `<td class="table-cell cell-center">${item.discountPercent > 0 ? `${formatNumber(item.discountPercent, 0)}%` : '-'}</td>`;
        case 'tax':
            return `
                <td class="table-cell cell-right">
                    <div class="table-value-strong">${formatNumber(item.taxAmount)}</div>
                    ${item.taxPercent > 0 ? `<div class="table-helper">${formatNumber(item.taxPercent, 0)}%</div>` : ''}
                </td>
            `;
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

const buildTotalsSection = (layout) => {
    if (!layout.showTotalsSection) return '';

    const discountAmount = asNumber(layout.totals.billDiscountAmount ?? layout.totals.discountAmount ?? 0);
    const discountPercent = asNumber(layout.totals.billDiscount ?? 0);
    const amountPaid = asNumber(layout.totals.amountPaid ?? 0);
    const balanceDue = asNumber(layout.totals.balanceDue ?? Math.max(asNumber(layout.totals.grandTotal) - amountPaid, 0));

    return `
        <section class="totals-section">
            <table class="totals-table">
                <tbody>
                    <tr>
                        <td>Subtotal</td>
                        <td>${formatCurrency(layout.currency, layout.totals.subTotal)}</td>
                    </tr>
                    ${discountAmount > 0 ? `
                        <tr class="amount-negative">
                            <td>Discount${discountPercent > 0 ? ` (${formatNumber(discountPercent, 0)}%)` : ''}</td>
                            <td>- ${formatCurrency(layout.currency, discountAmount)}</td>
                        </tr>
                    ` : ''}
                    <tr>
                        <td>Tax</td>
                        <td>${formatCurrency(layout.currency, layout.totals.tax)}</td>
                    </tr>
                    <tr class="grand-total-row">
                        <td>Grand Total</td>
                        <td>${formatCurrency(layout.currency, layout.totals.grandTotal)}</td>
                    </tr>
                    ${amountPaid > 0 ? `
                        <tr>
                            <td>Amount Paid</td>
                            <td>- ${formatCurrency(layout.currency, amountPaid)}</td>
                        </tr>
                        <tr class="balance-due-row">
                            <td>Balance Due</td>
                            <td>${formatCurrency(layout.currency, balanceDue)}</td>
                        </tr>
                    ` : ''}
                </tbody>
            </table>
        </section>
    `;
};

const buildPartyCard = (layout) => {
    if (layout.displayOptions.showCustomerDetails === false || !layout.party) return '';

    const lines = [
        layout.party.code ? `Code: ${layout.party.code}` : '',
        layout.party.address || '',
        layout.party.phone ? `Phone: ${layout.party.phone}` : '',
        layout.party.email ? `Email: ${layout.party.email}` : '',
        layout.party.taxId ? `TRN: ${layout.party.taxId}` : ''
    ].filter(Boolean);

    return `
        <section class="info-card">
            <div class="card-eyebrow">${escapeHtml(layout.partyLabel)}</div>
            <div class="card-title">${escapeHtml(layout.party.name || '-')}</div>
            <div class="card-copy">
                ${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
            </div>
        </section>
    `;
};

const buildReferenceCard = (layout) => {
    if (!layout.referenceRows?.length) return '';

    return `
        <section class="info-card">
            <div class="card-eyebrow">${escapeHtml(layout.referenceLabel)}</div>
            <div class="reference-grid">
                ${layout.referenceRows.map((row) => `
                    <div class="reference-row">
                        <div class="reference-label">${escapeHtml(row.label)}</div>
                        <div class="reference-value">${escapeHtml(row.value)}</div>
                    </div>
                `).join('')}
            </div>
        </section>
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

const buildNotesBlock = (layout) => {
    const hasNotes = Boolean(layout.notes);
    const hasTerms = Boolean(layout.displayOptions.showTerms !== false && layout.terms);

    if (!hasNotes && !hasTerms) return '';

    return `
        <section class="notes-card">
            ${hasNotes ? `
                <div class="notes-section">
                    <div class="card-eyebrow">Notes</div>
                    <div class="notes-copy">${escapeHtml(layout.notes)}</div>
                </div>
            ` : ''}
            ${hasTerms ? `
                <div class="notes-section">
                    <div class="card-eyebrow">Terms &amp; Conditions</div>
                    <div class="notes-copy">${escapeHtml(layout.terms)}</div>
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

const buildHeaderAddon = (layout) =>
    layout.headerAddon
        ? `<div class="layout-addon layout-addon-header">${layout.headerAddon}</div>`
        : '';

const buildFooterAddon = (layout) =>
    layout.footerAddon
        ? `<div class="layout-addon layout-addon-footer">${layout.footerAddon}</div>`
        : '';

const buildHeader = (layout) => {
    const metaRows = [
        { label: 'Document No', value: layout.docNo || '-' },
        ...(layout.headerRows || [])
    ];
    const companyLines = compactValues(
        layout.company.address,
        layout.company.email,
        layout.company.phone,
        layout.company.trn ? `TRN: ${layout.company.trn}` : '',
        layout.company.website
    );

    return `
        <header class="document-header">
            <div class="header-left">
                <div class="document-title">${escapeHtml(layout.title)}</div>
                <div class="document-meta-list">
                    ${metaRows.map((row) => `
                        <div class="document-meta-row">
                            <span class="document-meta-label">${escapeHtml(row.label)}</span>
                            <span class="document-meta-value">${escapeHtml(row.value)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="header-right">
                ${layout.displayOptions.showLogo && layout.company.logoUrl ? `
                    <div class="company-logo">
                        <img src="${layout.company.logoUrl}" alt="Company Logo" />
                    </div>
                ` : ''}

                ${layout.displayOptions.showCompanyDetails !== false ? `
                    <div class="company-panel">
                        <div class="company-name">${escapeHtml(layout.company.companyName || '')}</div>
                        ${layout.company.localName && layout.company.localName !== layout.company.companyName
                            ? `<div class="company-copy company-local-name">${escapeHtml(layout.company.localName)}</div>`
                            : ''}
                        ${companyLines.map((line) => `<div class="company-copy">${escapeHtml(line)}</div>`).join('')}
                    </div>
                ` : ''}

                ${layout.showHighlight ? `
                    <div class="highlight-panel">
                        <div class="highlight-label">${escapeHtml(layout.highlight.label)}</div>
                        <div class="highlight-value">${escapeHtml(layout.currency)} ${formatNumber(layout.highlight.value)}</div>
                    </div>
                ` : ''}
            </div>
        </header>
    `;
};

const buildFooterBar = (layout, renderTarget, billBullLogo) => `
    <footer class="document-footer">
        <div class="footer-bar">
            <div>${escapeHtml(layout.company.companyName || '')}</div>
            <div class="footer-center">${renderTarget === 'email' ? `Document ${escapeHtml(layout.docNo || '-')}` : ''}</div>
            <div class="footer-right">
                ${renderTarget === 'print'
        ? 'Page <span class="page-num"></span> of <span class="page-total"></span>'
        : escapeHtml(layout.title)}
            </div>
        </div>
        ${billBullLogo && renderTarget === 'email'
        ? `<div class="footer-brand"><img src="${billBullLogo}" alt="Powered by BillBull" /></div>`
        : ''}
    </footer>
`;

const buildCoreStyles = () => `
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: #111827;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    body { background: #ffffff; }
    .document-shell {
        position: relative;
        width: 100%;
        background: #ffffff;
    }
    .document-shell > *:not(.document-watermark) {
        position: relative;
        z-index: 1;
    }
    .document-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 280px;
        gap: 28px;
        align-items: start;
        padding-bottom: 20px;
        border-bottom: 1px solid #d1d5db;
    }
    .document-title {
        font-size: 28px;
        line-height: 1.05;
        font-weight: 700;
        letter-spacing: -0.03em;
        margin-bottom: 16px;
    }
    .document-meta-list {
        display: grid;
        gap: 7px;
        max-width: 360px;
    }
    .document-meta-row {
        display: grid;
        grid-template-columns: 104px minmax(0, 1fr);
        gap: 12px;
        align-items: baseline;
    }
    .document-meta-label {
        color: #6b7280;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
    }
    .document-meta-value {
        color: #111827;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
        word-break: break-word;
    }
    .header-right {
        text-align: right;
    }
    .company-logo {
        margin-bottom: 10px;
    }
    .company-logo img {
        max-width: 132px;
        max-height: 132px;
        width: auto;
        height: auto;
        object-fit: contain;
    }
    .company-panel {
        display: grid;
        gap: 3px;
    }
    .company-name {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.35;
    }
    .company-copy {
        color: #4b5563;
        font-size: 10.5px;
        line-height: 1.5;
        white-space: pre-line;
    }
    .company-local-name {
        font-weight: 600;
        color: #374151;
    }
    .highlight-panel {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid #d1d5db;
    }
    .highlight-label {
        color: #6b7280;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }
    .highlight-value {
        color: #111827;
        font-size: 34px;
        font-weight: 700;
        line-height: 1.05;
        margin-top: 4px;
    }
    .layout-addon {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed #cbd5e1;
        font-size: 11px;
        line-height: 1.6;
        color: #334155;
    }
    .content-stack {
        margin-top: 16px;
        display: grid;
        gap: 16px;
    }
    .info-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(240px, 290px);
        gap: 24px;
        align-items: start;
    }
    .info-card,
    .notes-card,
    .signature-card {
        border-top: 1px solid #d1d5db;
        padding-top: 12px;
        background: transparent;
    }
    .payment-card {
        grid-column: 1 / -1;
    }
    .card-eyebrow {
        color: #6b7280;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 7px;
    }
    .card-title {
        color: #111827;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 5px;
    }
    .card-copy {
        color: #374151;
        font-size: 11px;
        line-height: 1.55;
    }
    .reference-grid {
        display: grid;
        gap: 6px;
    }
    .reference-row {
        display: grid;
        grid-template-columns: 110px minmax(0, 1fr);
        gap: 12px;
        align-items: start;
    }
    .reference-label {
        color: #6b7280;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .reference-value {
        color: #111827;
        font-size: 11px;
        line-height: 1.45;
        font-weight: 600;
        word-break: break-word;
    }
    .table-section {
        border-top: 1px solid #d1d5db;
        border-bottom: 1px solid #d1d5db;
    }
    .document-table {
        width: 100%;
        border-collapse: collapse;
    }
    .document-table thead {
        display: table-header-group;
    }
    .document-table thead th {
        padding: 10px 8px;
        color: #6b7280;
        font-size: 10px;
        font-weight: 700;
        text-align: left;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-bottom: 1px solid #d1d5db;
        white-space: nowrap;
    }
    .document-table tbody tr {
        page-break-inside: avoid;
    }
    .document-table tbody tr:last-child .table-cell {
        border-bottom: 0;
    }
    .table-cell {
        padding: 11px 8px;
        color: #111827;
        font-size: 11px;
        vertical-align: top;
        border-bottom: 1px solid #e5e7eb;
    }
    .table-empty {
        padding: 22px 8px;
        text-align: center;
        color: #9ca3af;
        font-size: 11px;
    }
    .cell-right { text-align: right; }
    .cell-center { text-align: center; }
    .cell-index { color: #6b7280; }
    .cell-strong { font-weight: 700; }
    .rtl-cell { direction: rtl; }
    .description-wrap {
        display: flex;
        align-items: flex-start;
        gap: 12px;
    }
    .item-thumb {
        width: 54px;
        height: 54px;
        border-radius: 10px;
        border: 1px solid #d1d5db;
        object-fit: cover;
        flex-shrink: 0;
        background: #f8fafc;
    }
    .description-copy {
        min-width: 0;
    }
    .description-title {
        color: #111827;
        font-size: 11.5px;
        line-height: 1.45;
        font-weight: 700;
    }
    .description-line {
        color: #4b5563;
        font-size: 10px;
        line-height: 1.45;
        margin-top: 2px;
    }
    .table-value-strong {
        font-weight: 700;
    }
    .table-helper {
        color: #6b7280;
        font-size: 9.5px;
        margin-top: 2px;
    }
    .totals-section {
        display: flex;
        justify-content: flex-end;
        padding-top: 4px;
    }
    .totals-table {
        width: min(100%, 330px);
        border-collapse: collapse;
    }
    .totals-table td {
        padding: 6px 0;
        font-size: 11px;
        border-bottom: 1px solid #e5e7eb;
    }
    .totals-table td:last-child {
        text-align: right;
        font-weight: 700;
    }
    .grand-total-row td {
        padding-top: 10px;
        border-top: 1px solid #9ca3af;
        border-bottom: 0;
        font-size: 15px;
        font-weight: 700;
    }
    .balance-due-row td {
        font-weight: 700;
    }
    .amount-negative td {
        color: #b91c1c;
    }
    .notes-card {
        display: grid;
        gap: 12px;
    }
    .notes-copy {
        color: #4b5563;
        font-size: 11px;
        line-height: 1.7;
        white-space: pre-wrap;
    }
    .signature-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 28px;
        margin-top: 18px;
    }
    .signature-line {
        padding-top: 8px;
        border-top: 1px solid #9ca3af;
        text-align: center;
        color: #4b5563;
        font-size: 11px;
    }
    .document-footer {
        margin-top: 18px;
        padding-top: 9px;
        border-top: 1px solid #d1d5db;
        color: #6b7280;
        font-size: 10px;
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
        margin-top: 8px;
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
        font-size: 90px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.18em;
    }
    .page-num::before { content: counter(page); }
    .page-total::before { content: counter(pages); }
    @media (max-width: 720px) {
        .document-header,
        .info-grid,
        .signature-grid {
            grid-template-columns: 1fr;
        }
        .header-right {
            text-align: left;
        }
        .document-meta-row,
        .reference-row {
            grid-template-columns: 1fr;
            gap: 3px;
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

const buildPrintStyles = (paperSize, orientation) => `
    @page {
        size: ${paperSize} ${orientation};
        margin: 14mm 16mm 18mm;
    }
    body {
        background: #eef2f7;
        padding: 22px;
        font-size: 12px;
    }
    .document-shell {
        max-width: 860px;
        min-height: calc(100vh - 44px);
        margin: 0 auto;
        border: 1px solid #d1d5db;
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);
        padding: 28px 30px 24px;
    }
    .document-footer {
        position: running(document-footer);
    }
    @media print {
        body {
            background: #ffffff;
            padding: 0;
        }
        .document-shell {
            max-width: none;
            min-height: auto;
            margin: 0;
            border: 0;
            box-shadow: none;
            padding: 0;
        }
        .document-footer {
            position: fixed;
            left: 16mm;
            right: 16mm;
            bottom: 0;
            background: #ffffff;
        }
    }
`;

const buildEmailStyles = () => `
    body {
        background: #eef2f7;
        padding: 22px;
        font-size: 12px;
    }
    .document-shell {
        max-width: 860px;
        margin: 0 auto;
        border: 1px solid #d1d5db;
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);
        padding: 28px 30px 24px;
    }
`;

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
    const columnModel = createColumnModel(columnOptions, true, template.category);
    const currency = resolveCurrency(company, data.totals || {}, data.summaryAmount || {});
    const headerMeta = Array.isArray(data.headerMeta) ? data.headerMeta.filter((row) => row?.value) : [];
    const references = Array.isArray(data.references) ? data.references.filter((row) => row?.value) : [];
    const paymentDetails = Array.isArray(data.paymentDetails) ? data.paymentDetails.filter((row) => row?.value) : [];

    const headerRows = [
        { label: 'Date', value: data.date || '-' },
        ...headerMeta.filter((row) => /due date|expected delivery|valid/i.test(asText(row.label)))
    ].filter((row) => row?.value);

    const statusRow = data.status ? [{ label: 'Status', value: data.status }] : [];
    const referenceRows = [
        ...headerMeta.filter((row) => !/due date|expected delivery|valid/i.test(asText(row.label))),
        ...references,
        ...statusRow
    ].filter((row) => row?.value);

    const items = Array.isArray(data.items) ? data.items.map(normaliseItem) : [];
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
        status: asText(data.status || ''),
        company,
        currency,
        partyLabel: template.category === 'Payment Voucher' ? 'Paid To' : 'Vendor',
        party: data.party || null,
        referenceLabel: 'Document Details',
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
    const columnModel = createColumnModel(columnOptions, false, template.category);
    const currency = resolveCurrency(company, data.totals || {}, {});
    const customer = data.customer || {};
    const items = Array.isArray(data.items) ? data.items.map(normaliseItem) : [];
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
        data.meta?.paymentTerm ? { label: 'Payment Term', value: data.meta.paymentTerm } : null,
        data.meta?.status ? { label: 'Status', value: data.meta.status } : null,
        data.meta?.reference ? { label: 'Reference', value: data.meta.reference } : null
    ].filter(Boolean);

    return {
        title: asText(data.title || template.category || 'DOCUMENT'),
        docNo: asText(data.docNo || ''),
        status: asText(data.meta?.status || ''),
        company,
        currency,
        partyLabel: asText(data.meta?.partyLabel || 'Customer'),
        party: {
            name: firstNonEmpty(customer.name, customer.customerName, 'Unknown Customer'),
            code: firstNonEmpty(customer.code, customer.customerCode),
            address: firstNonEmpty(customer.address, customer.billingAddress),
            phone: firstNonEmpty(customer.phone, customer.mobile),
            email: firstNonEmpty(customer.email),
            taxId: firstNonEmpty(customer.trn, customer.taxId)
        },
        referenceLabel: 'Document Details',
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

    const partyCard = buildPartyCard(layout);
    const referenceCard = buildReferenceCard(layout);

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapeHtml(`${layout.title} - ${layout.docNo}`)}</title>
            <style>${styles}</style>
        </head>
        <body>
            <div class="document-shell">
                ${buildHeader(layout)}
                ${buildHeaderAddon(layout)}
                <main class="content-stack">
                    ${(partyCard || referenceCard) ? `
                        <div class="info-grid">
                            ${partyCard || '<div></div>'}
                            ${referenceCard || '<div></div>'}
                        </div>
                    ` : ''}
                    ${buildPaymentCard(layout)}
                    ${buildItemsTable(layout)}
                    ${buildTotalsSection(layout)}
                    ${buildNotesBlock(layout)}
                    ${buildSignatureBlock(layout)}
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
