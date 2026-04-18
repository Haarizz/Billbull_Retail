const PURCHASE_TEMPLATE_CATEGORIES = new Set([
    'Local Purchase Order',
    'Goods Receipt Note',
    'Purchase Invoice',
    'Payment Voucher'
]);

const parseObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const asNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const asText = (value) => (value === null || value === undefined ? '' : String(value));

const escapeHtml = (value) =>
    asText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const formatNumber = (value, decimals = 2) => asNumber(value).toFixed(decimals);

const formatCurrency = (currency, value) => `${currency} ${formatNumber(value)}`;

const resolveLogoUrl = (companyProfile = {}) =>
    companyProfile.logoUrl || companyProfile.logo || companyProfile.companyLogo || null;

const resolveCurrency = (companyProfile = {}, totals = {}, summaryAmount = {}) =>
    totals.currency ||
    summaryAmount.currency ||
    companyProfile.currencySymbol ||
    companyProfile.currency ||
    'AED';

const resolveCompanyVars = (html, company, logoUrl) => {
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
            logoUrl ? `<img src="${logoUrl}" style="height:56px;width:auto;" alt="Company Logo" />` : ''
        )
        .replace(
            /{logo}/g,
            logoUrl ? `<img src="${logoUrl}" style="height:56px;width:auto;" alt="Company Logo" />` : ''
        );
};

const looksLikePurchasePayload = (data) =>
    data &&
    typeof data === 'object' &&
    (data.party || Array.isArray(data.headerMeta) || Array.isArray(data.references) || Array.isArray(data.paymentDetails));

const normaliseDescription = (item = {}) => {
    const rawDescription = item.description;

    if (rawDescription && typeof rawDescription === 'object') {
        return {
            title: rawDescription.title || item.name || item.item || '-',
            details: Array.isArray(rawDescription.details)
                ? rawDescription.details.filter(Boolean)
                : []
        };
    }

    const details = [];
    if (item.desc) details.push(item.desc);
    if (item.description && typeof item.description === 'string') details.push(item.description);

    return {
        title: item.name || item.item || '-',
        details
    };
};

const normaliseItem = (item = {}) => {
    const description = normaliseDescription(item);
    const qty = asNumber(item.qty ?? item.quantity ?? 0);
    const price = asNumber(item.price ?? item.unitPrice ?? item.unitCost ?? 0);
    const taxableAmount = asNumber(item.taxableAmount ?? (qty * price));
    const taxAmount = asNumber(item.taxAmt ?? item.taxAmount ?? item.tax ?? 0);
    const total = asNumber(item.total ?? item.lineAmount ?? (taxableAmount + taxAmount));

    return {
        code: item.code || item.productId || item.itemCode || '',
        sku: item.sku || item.skuCode || '',
        localName: item.localName || item.arabicName || '',
        name: item.name || item.item || description.title || '-',
        description,
        image: item.image || '',
        unit: item.unit || item.uom || '',
        qty,
        price,
        taxableAmount,
        taxAmount,
        taxPercent: asNumber(item.taxPercent ?? item.taxRate ?? 0),
        discountPercent: asNumber(item.disc ?? item.discount ?? item.discountPercent ?? 0),
        total
    };
};

const createColumnModel = (rawColumns = {}, isPurchaseDocument = false) => {
    const columns = parseObject(rawColumns);
    const showDescription = columns.item !== false || columns.description !== false;
    const showTaxableAmount = columns.taxableAmount === true || (isPurchaseDocument && columns.showTaxableAmount !== false);

    return [
        {
            key: 'index',
            label: '#',
            align: 'center',
            width: '34px',
            enabled: true
        },
        {
            key: 'productId',
            label: 'Product id',
            align: 'left',
            width: '88px',
            enabled: Boolean(columns.productId)
        },
        {
            key: 'sku',
            label: 'Sku',
            align: 'left',
            width: '96px',
            enabled: Boolean(columns.sku)
        },
        {
            key: 'arabicName',
            label: 'Arabic name',
            align: 'right',
            width: '116px',
            enabled: Boolean(columns.arabicName)
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
            width: '88px',
            enabled: columns.qty !== false
        },
        {
            key: 'unitPrice',
            label: 'Price',
            align: 'right',
            width: '92px',
            enabled: columns.unitPrice !== false
        },
        {
            key: 'taxableAmount',
            label: 'Taxable amount',
            align: 'right',
            width: '118px',
            enabled: showTaxableAmount
        },
        {
            key: 'tax',
            label: 'Vat amount',
            align: 'right',
            width: '104px',
            enabled: Boolean(columns.tax)
        },
        {
            key: 'discount',
            label: 'Disc%',
            align: 'center',
            width: '70px',
            enabled: Boolean(columns.discount)
        },
        {
            key: 'total',
            label: 'Line amount',
            align: 'right',
            width: '112px',
            enabled: columns.total !== false
        }
    ].filter((column) => column.enabled);
};

const buildDescriptionCell = (item, displayOptions = {}) => {
    const title = displayOptions.showTitle !== false ? item.description.title || item.name || '-' : '';
    const detailLines = displayOptions.showDescriptionLines === false ? [] : item.description.details || [];
    const showImage = displayOptions.showItemImage && item.image;

    return `
        <div class="description-wrap">
            ${showImage ? `<img src="${item.image}" class="item-thumb" alt="" />` : ''}
            <div class="description-copy">
                ${title ? `<div class="description-title">${escapeHtml(title)}</div>` : ''}
                ${detailLines.map((line) => `<div class="description-line">&bull; ${escapeHtml(line)}</div>`).join('')}
                ${!title && detailLines.length === 0 ? '<div class="description-line">-</div>' : ''}
            </div>
        </div>
    `;
};

const renderTableCell = (column, item, index, displayOptions = {}) => {
    switch (column.key) {
        case 'index':
            return `<td class="table-cell cell-center cell-muted">${index + 1}</td>`;
        case 'productId':
            return `<td class="table-cell">${escapeHtml(item.code || '-')}</td>`;
        case 'sku':
            return `<td class="table-cell">${escapeHtml(item.sku || '-')}</td>`;
        case 'arabicName':
            return `<td class="table-cell cell-right rtl-cell">${escapeHtml(item.localName || '-')}</td>`;
        case 'description':
            return `<td class="table-cell cell-description">${buildDescriptionCell(item, displayOptions)}</td>`;
        case 'qty':
            return `<td class="table-cell cell-right">${escapeHtml(`${item.qty}${item.unit ? ` ${item.unit}` : ''}`)}</td>`;
        case 'unitPrice':
            return `<td class="table-cell cell-right">${formatNumber(item.price)}</td>`;
        case 'taxableAmount':
            return `<td class="table-cell cell-right">${formatNumber(item.taxableAmount)}</td>`;
        case 'tax':
            return `
                <td class="table-cell cell-right vat-cell">
                    <div class="vat-amount">${formatNumber(item.taxAmount)}</div>
                    ${item.taxPercent > 0 ? `<div class="vat-rate">${formatNumber(item.taxPercent, 0)}%</div>` : ''}
                </td>
            `;
        case 'discount':
            return `<td class="table-cell cell-center">${item.discountPercent > 0 ? `${formatNumber(item.discountPercent, 0)}%` : '-'}</td>`;
        case 'total':
            return `<td class="table-cell cell-right cell-strong">${formatNumber(item.total)}</td>`;
        default:
            return '<td class="table-cell">-</td>';
    }
};

const buildItemsTable = (layout) => {
    if (!layout.showItemTable) return '';

    const columnModel = layout.columnModel;
    const rows = layout.items.map((item, index) => `
        <tr>
            ${columnModel.map((column) => renderTableCell(column, item, index, layout.displayOptions)).join('')}
        </tr>
    `).join('');

    return `
        <div class="table-wrap">
            <table class="document-table">
                <thead>
                    <tr>
                        ${columnModel.map((column) => `
                            <th class="${column.align === 'right' ? 'cell-right' : column.align === 'center' ? 'cell-center' : ''}" style="width:${column.width};">
                                ${escapeHtml(column.label)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${layout.items.length > 0
                        ? rows
                        : `<tr><td class="table-empty" colspan="${columnModel.length}">No items found.</td></tr>`}
                </tbody>
            </table>
        </div>
    `;
};

const buildTotalsSection = (layout) => {
    if (layout.showTotalsSection === false || layout.displayOptions.showTotalsPanel === false) return '';

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
                        <td>VAT</td>
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
    const rows = layout.referenceRows || [];
    if (rows.length === 0) return '';

    return `
        <section class="info-card">
            <div class="card-eyebrow">${escapeHtml(layout.referenceLabel || 'Reference')}</div>
            <div class="reference-grid">
                ${rows.map((row) => `
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
    if (!layout.paymentRows?.length || layout.displayOptions.showPaymentDetails === false) return '';

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
    if (!layout.displayOptions.showSignatureBlock) return '';

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
    const showWatermark = ['DRAFT', 'CANCELLED', 'REJECTED'].includes(upperStatus);

    return showWatermark
        ? `<div class="document-watermark"><span>${escapeHtml(upperStatus.replace(/_/g, ' '))}</span></div>`
        : '';
};

const buildHeaderAddon = (layout) =>
    layout.headerAddon
        ? `<div class="layout-addon layout-addon-header">${layout.headerAddon}</div>`
        : '';

const buildFooterAddon = (layout) =>
    layout.footerAddon
        ? `<div class="layout-addon layout-addon-footer">${layout.footerAddon}</div>`
        : '';

const buildHeader = (layout) => `
    <header class="document-header">
        <div class="header-left">
            <div class="document-title">${escapeHtml(layout.title)}</div>
            <div class="document-meta-list">
                ${layout.headerRows.map((row) => `
                    <div class="document-meta-row">
                        <span class="document-meta-label">${escapeHtml(row.label)}</span>
                        <span class="document-meta-value">${escapeHtml(row.value)}</span>
                    </div>
                `).join('')}
                <div class="document-meta-row">
                    <span class="document-meta-label">Document No</span>
                    <span class="document-meta-value">${escapeHtml(layout.docNo || '-')}</span>
                </div>
            </div>
        </div>
        <div class="header-right">
            ${layout.displayOptions.showLogo && layout.logoUrl ? `
                <div class="company-logo">
                    <img src="${layout.logoUrl}" alt="Company Logo" />
                </div>
            ` : ''}
            ${layout.displayOptions.showCompanyDetails !== false ? `
                <div class="company-name">${escapeHtml(layout.company.companyName || '')}</div>
                <div class="company-copy">${escapeHtml(layout.company.address || '')}</div>
                ${layout.company.email ? `<div class="company-copy">${escapeHtml(layout.company.email)}</div>` : ''}
                ${layout.company.phone ? `<div class="company-copy">${escapeHtml(layout.company.phone)}</div>` : ''}
                ${layout.company.trn ? `<div class="company-copy">TRN: ${escapeHtml(layout.company.trn)}</div>` : ''}
            ` : ''}
            ${layout.showHighlight ? `
                <div class="highlight-panel">
                    <div class="highlight-label">${escapeHtml(layout.highlight.label)}</div>
                    <div class="highlight-value">${escapeHtml(layout.currency)} ${asNumber(layout.highlight.value).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
            ` : ''}
        </div>
    </header>
`;

const buildFooterBar = (layout, renderTarget, billBullLogo) => `
    <footer class="document-footer">
        <div class="footer-bar">
            <div>${escapeHtml(layout.company.companyName || '')}</div>
            <div class="footer-center">${renderTarget === 'email' ? 'Professional document email layout' : ''}</div>
            <div class="footer-right">
                ${renderTarget === 'print'
        ? 'Page <span class="page-num"></span> of <span class="page-total"></span>'
        : `Document ${escapeHtml(layout.docNo || '-')}`}
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
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: #0f172a;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    body { background: #ffffff; }
    .document-shell {
        position: relative;
        width: 100%;
    }
    .document-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: 28px;
        align-items: start;
        padding-bottom: 18px;
        border-bottom: 1px solid #dbe3ec;
    }
    .document-title {
        font-size: 26px;
        font-weight: 800;
        letter-spacing: 0.03em;
        line-height: 1.1;
        margin-bottom: 16px;
    }
    .document-meta-list {
        display: grid;
        gap: 8px;
    }
    .document-meta-row {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 10px;
        align-items: baseline;
    }
    .document-meta-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #64748b;
        font-weight: 700;
    }
    .document-meta-value {
        font-size: 14px;
        color: #0f172a;
        font-weight: 600;
    }
    .header-right { text-align: right; }
    .company-logo { margin-bottom: 10px; }
    .company-logo img {
        max-width: 190px;
        max-height: 60px;
        width: auto;
        height: auto;
        object-fit: contain;
    }
    .company-name {
        font-size: 16px;
        font-weight: 800;
        line-height: 1.25;
        margin-bottom: 4px;
    }
    .company-copy {
        font-size: 11px;
        line-height: 1.6;
        color: #334155;
        white-space: pre-line;
    }
    .highlight-panel {
        margin-top: 18px;
        padding-top: 12px;
        border-top: 1px solid #dbe3ec;
    }
    .highlight-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #64748b;
        font-weight: 700;
    }
    .highlight-value {
        font-size: 34px;
        line-height: 1.08;
        font-weight: 800;
        margin-top: 4px;
        color: #111827;
    }
    .layout-addon {
        margin-top: 18px;
        padding: 14px 16px;
        border: 1px dashed #cbd5e1;
        border-radius: 16px;
        background: #f8fafc;
        font-size: 12px;
        color: #334155;
    }
    .content-stack {
        margin-top: 22px;
        display: grid;
        gap: 22px;
    }
    .info-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
        gap: 16px;
    }
    .info-card,
    .notes-card,
    .signature-card {
        border: 1px solid #dbe3ec;
        border-radius: 18px;
        padding: 18px 20px;
        background: #ffffff;
    }
    .payment-card { grid-column: 1 / -1; }
    .card-eyebrow {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: #64748b;
        font-weight: 800;
        margin-bottom: 10px;
    }
    .card-title {
        font-size: 16px;
        font-weight: 800;
        margin-bottom: 8px;
    }
    .card-copy {
        font-size: 12px;
        line-height: 1.7;
        color: #334155;
    }
    .reference-grid {
        display: grid;
        gap: 10px;
    }
    .reference-row {
        display: grid;
        grid-template-columns: 118px 1fr;
        gap: 10px;
        align-items: start;
    }
    .reference-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #94a3b8;
        font-weight: 700;
    }
    .reference-value {
        font-size: 12px;
        line-height: 1.55;
        font-weight: 600;
        color: #0f172a;
        word-break: break-word;
    }
    .table-wrap {
        width: 100%;
        overflow: visible;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        background: #ffffff;
    }
    .document-table {
        width: 100%;
        border-collapse: collapse;
    }
    .document-table thead { display: table-header-group; }
    .document-table thead th {
        padding: 13px 12px;
        background: #f8fafc;
        color: #475569;
        font-size: 11px;
        text-transform: none;
        letter-spacing: 0.01em;
        font-weight: 700;
        text-align: left;
        border-bottom: 1px solid #dbe3ec;
        white-space: nowrap;
    }
    .document-table tbody tr { page-break-inside: avoid; }
    .table-cell {
        padding: 14px 12px;
        font-size: 12px;
        vertical-align: top;
        border-bottom: 1px solid #f1f5f9;
    }
    .table-empty {
        padding: 26px 12px;
        text-align: center;
        color: #94a3b8;
        font-size: 12px;
    }
    .cell-right { text-align: right; }
    .cell-center { text-align: center; }
    .cell-muted { color: #94a3b8; }
    .cell-strong { font-weight: 800; color: #111827; }
    .rtl-cell { direction: rtl; }
    .description-wrap {
        display: flex;
        align-items: flex-start;
        gap: 10px;
    }
    .item-thumb {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        border: 1px solid #dbe3ec;
        object-fit: cover;
        flex-shrink: 0;
    }
    .description-copy { min-width: 0; }
    .description-title {
        font-size: 13px;
        font-weight: 800;
        line-height: 1.45;
        color: #0f172a;
    }
    .description-line {
        font-size: 11px;
        line-height: 1.55;
        color: #475569;
        margin-top: 2px;
    }
    .vat-cell .vat-amount { font-weight: 700; }
    .vat-cell .vat-rate {
        font-size: 10px;
        color: #94a3b8;
        margin-top: 2px;
    }
    .totals-section {
        display: flex;
        justify-content: flex-end;
    }
    .totals-table {
        width: min(100%, 340px);
        border-collapse: collapse;
    }
    .totals-table td {
        padding: 7px 0;
        font-size: 12px;
        border-bottom: 1px solid #eef2f7;
    }
    .totals-table td:last-child {
        text-align: right;
        font-weight: 700;
    }
    .grand-total-row td {
        padding-top: 10px;
        border-top: 1px solid #cbd5e1;
        border-bottom: none;
        font-size: 16px;
        font-weight: 800;
        color: #0f172a;
    }
    .balance-due-row td { font-weight: 800; }
    .amount-negative td { color: #dc2626; }
    .notes-card {
        display: grid;
        gap: 16px;
        background: #f8fafc;
    }
    .notes-copy {
        font-size: 11px;
        line-height: 1.8;
        color: #475569;
        white-space: pre-wrap;
    }
    .signature-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 22px;
        margin-top: 20px;
    }
    .signature-line {
        padding-top: 8px;
        border-top: 1px solid #94a3b8;
        text-align: center;
        font-size: 11px;
        color: #475569;
    }
    .document-footer {
        margin-top: 24px;
        font-size: 10px;
        color: #64748b;
    }
    .footer-bar {
        display: flex;
        gap: 16px;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid #dbe3ec;
        padding-top: 10px;
    }
    .footer-center { flex: 1; text-align: center; }
    .footer-right { text-align: right; }
    .footer-brand {
        margin-top: 10px;
        display: flex;
        justify-content: flex-end;
    }
    .footer-brand img {
        height: 16px;
        width: auto;
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
        font-size: 92px;
        line-height: 1;
        letter-spacing: 0.2em;
        color: rgba(15, 23, 42, 0.05);
        font-weight: 800;
    }
    .page-num::before { content: counter(page); }
    .page-total::before { content: counter(pages); }
    @media (max-width: 720px) {
        .document-header,
        .info-grid,
        .signature-grid {
            grid-template-columns: 1fr;
        }
        .header-right { text-align: left; }
        .reference-row,
        .document-meta-row {
            grid-template-columns: 1fr;
            gap: 4px;
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
        margin: 16mm 18mm 20mm;
    }
    body {
        background: #eef2f7;
        padding: 24px;
        font-size: 12px;
    }
    .document-shell {
        max-width: 860px;
        min-height: calc(100vh - 48px);
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #dbe3ec;
        border-radius: 28px;
        box-shadow: 0 24px 54px rgba(15, 23, 42, 0.12);
        padding: clamp(20px, 4vw, 36px);
    }
    .document-watermark {
        position: absolute;
    }
    .document-footer {
        position: running(document-footer);
    }
    .table-wrap { overflow-x: auto; }
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
            border-radius: 0;
            box-shadow: none;
            padding: 0;
        }
        .document-watermark {
            position: fixed;
        }
        .document-footer {
            position: fixed;
            left: 18mm;
            right: 18mm;
            bottom: 0;
            background: #ffffff;
        }
    }
`;

const buildEmailStyles = () => `
    body {
        background: #eef2f7;
        padding: 24px;
        font-size: 12px;
    }
    .document-shell {
        max-width: 860px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #dbe3ec;
        border-radius: 28px;
        box-shadow: 0 24px 54px rgba(15, 23, 42, 0.12);
        padding: clamp(20px, 4vw, 36px);
    }
    .document-watermark {
        position: absolute;
    }
    .table-wrap { overflow-x: auto; }
`;

const normalisePurchaseLayout = (template, data, companyProfile, renderTarget) => {
    const displayOptions = parseObject(template.displayOptions);
    const columnModel = createColumnModel(template.columns, true);
    const currency = resolveCurrency(companyProfile, data.totals || {}, data.summaryAmount || {});
    const headerMeta = Array.isArray(data.headerMeta) ? data.headerMeta.filter((row) => row?.value) : [];
    const references = Array.isArray(data.references) ? data.references.filter((row) => row?.value) : [];
    const paymentDetails = Array.isArray(data.paymentDetails) ? data.paymentDetails.filter((row) => row?.value) : [];

    const headerRows = [
        { label: 'Date', value: data.date || '-' },
        ...headerMeta.filter((row) => /due date|expected delivery|valid/i.test(asText(row.label)))
    ].filter((row) => row?.value);

    const statusRow = data.status ? [{ label: 'Status', value: data.status }] : [];
    const extraMetaRows = headerMeta.filter((row) => !/due date|expected delivery|valid/i.test(asText(row.label)));
    const referenceRows = [
        ...extraMetaRows,
        ...references,
        ...statusRow
    ].filter((row) => row?.value);

    const items = Array.isArray(data.items) ? data.items.map(normaliseItem) : [];
    const summaryLabel = data.summaryAmount?.label || (asNumber(data.totals?.balanceDue) > 0 ? 'Balance Due' : 'Grand Total');
    const summaryValue = data.summaryAmount?.value ?? (summaryLabel.toLowerCase().includes('balance')
        ? data.totals?.balanceDue
        : data.totals?.grandTotal);

    return {
        title: asText(data.title || template.category || 'PURCHASE DOCUMENT'),
        docNo: asText(data.docNo || ''),
        status: asText(data.status || ''),
        company: companyProfile,
        logoUrl: resolveLogoUrl(companyProfile),
        currency,
        partyLabel: template.category === 'Payment Voucher' ? 'Paid To' : 'Vendor Details',
        party: data.party || null,
        referenceLabel: 'Reference',
        referenceRows,
        paymentRows: paymentDetails,
        headerRows,
        items,
        columnModel,
        totals: {
            subTotal: asNumber(data.totals?.subTotal),
            tax: asNumber(data.totals?.tax),
            grandTotal: asNumber(data.totals?.grandTotal ?? data.summaryAmount?.value),
            amountPaid: asNumber(data.totals?.amountPaid),
            balanceDue: asNumber(data.totals?.balanceDue),
            billDiscount: asNumber(data.totals?.billDiscount),
            billDiscountAmount: asNumber(data.totals?.billDiscountAmount ?? data.totals?.discountAmount)
        },
        notes: asText(data.notes || ''),
        terms: asText(template.termsContent || ''),
        displayOptions,
        showItemTable: displayOptions.showItemTable !== false,
        showTotalsSection: displayOptions.showTotalsPanel !== false,
        showHighlight: summaryValue !== undefined && summaryValue !== null && (displayOptions.showTotalsPanel !== false || displayOptions.showBalancePanel !== false),
        highlight: {
            label: summaryLabel,
            value: asNumber(summaryValue)
        },
        headerAddon: resolveCompanyVars(template.headerContent, companyProfile, resolveLogoUrl(companyProfile)),
        footerAddon: resolveCompanyVars(template.footerContent, companyProfile, resolveLogoUrl(companyProfile)),
        renderTarget
    };
};

const normaliseGenericLayout = (template, data, companyProfile, renderTarget) => {
    const displayOptions = parseObject(template.displayOptions);
    const columnModel = createColumnModel(template.columns, false);
    const currency = resolveCurrency(companyProfile, data.totals || {}, {});
    const customer = data.customer || {};
    const items = Array.isArray(data.items) ? data.items.map(normaliseItem) : [];

    const highlightValue = asNumber(data.totals?.balanceDue) > 0
        ? asNumber(data.totals?.balanceDue)
        : asNumber(data.totals?.grandTotal);
    const highlightLabel = asNumber(data.totals?.balanceDue) > 0 ? 'Balance Due' : 'Grand Total';

    const referenceRows = [
        data.meta?.paymentTerm ? { label: 'Payment Term', value: data.meta.paymentTerm } : null,
        data.meta?.status ? { label: 'Status', value: data.meta.status } : null
    ].filter(Boolean);

    return {
        title: asText(data.title || template.category || 'DOCUMENT'),
        docNo: asText(data.docNo || ''),
        status: asText(data.meta?.status || ''),
        company: companyProfile,
        logoUrl: resolveLogoUrl(companyProfile),
        currency,
        partyLabel: asText(data.meta?.partyLabel || 'Bill To'),
        party: {
            name: customer.name || 'Unknown Customer',
            address: customer.address || '',
            phone: customer.phone || '',
            email: customer.email || '',
            taxId: customer.trn || customer.taxId || ''
        },
        referenceLabel: 'Document Info',
        referenceRows,
        paymentRows: [],
        headerRows: [
            { label: 'Date', value: data.date || '-' },
            ...(data.meta?.validTill ? [{ label: data.meta.validTillLabel || 'Due Date', value: data.meta.validTill }] : [])
        ],
        items,
        columnModel,
        totals: {
            subTotal: asNumber(data.totals?.subTotal),
            tax: asNumber(data.totals?.tax),
            grandTotal: asNumber(data.totals?.grandTotal),
            amountPaid: asNumber(data.totals?.amountPaid),
            balanceDue: asNumber(data.totals?.balanceDue),
            billDiscount: asNumber(data.totals?.billDiscount),
            billDiscountAmount: asNumber(data.totals?.billDiscountAmount ?? data.totals?.discountAmount)
        },
        notes: asText(data.meta?.notes || ''),
        terms: asText(template.termsContent || ''),
        displayOptions,
        showItemTable: true,
        showTotalsSection: parseObject(template.columns).total !== false,
        showHighlight: highlightValue > 0,
        highlight: {
            label: highlightLabel,
            value: highlightValue
        },
        headerAddon: resolveCompanyVars(template.headerContent, companyProfile, resolveLogoUrl(companyProfile)),
        footerAddon: resolveCompanyVars(template.footerContent, companyProfile, resolveLogoUrl(companyProfile)),
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

    const infoGrid = (buildPartyCard(layout) || buildReferenceCard(layout))
        ? `
            <div class="info-grid">
                ${buildPartyCard(layout) || '<div></div>'}
                ${buildReferenceCard(layout) || '<div></div>'}
            </div>
        `
        : '';

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
                    ${infoGrid}
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
