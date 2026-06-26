import QRCode from 'qrcode';
import {
    generateDocumentEmailHtml,
    generateDocumentPrintHtml,
    generateDocumentPdfHtml
} from './documentTemplateRenderer';
import {
    resolveCurrencyDisplayConfig,
    UAE_DIRHAM_SYMBOL_IMAGE
} from './countryCurrencyOptions';
import toast from 'react-hot-toast';

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const renderCurrencySymbolHtml = (companyProfile = {}) => {
    const currencyConfig = resolveCurrencyDisplayConfig(companyProfile);
    if (currencyConfig.hasImage) {
        return `<img src="${UAE_DIRHAM_SYMBOL_IMAGE}" alt="${escapeHtml(currencyConfig.ariaLabel)}" style="height:0.82em;width:auto;display:inline-block;vertical-align:-0.08em;margin:0 0.12em;" />`;
    }

    return escapeHtml(currencyConfig.label);
};

// Rewrites currency-code tokens in a string to the configured symbol/image.
// The configured currency code (e.g. AED, USD, EUR) is the primary token; "AED"
// is always also matched so legacy view-models that still emit literal "AED"
// pick up the active currency. For AED this yields the dirham symbol image; for
// any other currency it yields that currency's narrow symbol ($, €, ₹, …).
const renderTextWithCurrencySymbols = (value, companyProfile = {}) => {
    const currencySymbolHtml = renderCurrencySymbolHtml(companyProfile);
    const config = resolveCurrencyDisplayConfig(companyProfile);
    const codes = Array.from(new Set([config.currency, 'AED'].filter(Boolean)));
    const codeAlt = codes.map(escapeRegExp).join('|');
    const tokenPattern = new RegExp(`(^|[^A-Za-z0-9_])(?:${codeAlt})(?=$|[^A-Za-z0-9_])`, 'gi');
    const amountBeforePattern = new RegExp(
        `([+-]?\\d[\\d,]*(?:\\.\\d+)?)(\\s+)(?:${codeAlt})(?=$|[^A-Za-z0-9_])`, 'gi');

    return (
        escapeHtml(value)
            .replace(amountBeforePattern, `${currencySymbolHtml} $1`)
            .replace(tokenPattern, `$1${currencySymbolHtml}`)
    );
};

export const generatePrintHtml = (template, data, options = {}) =>
    generateDocumentPrintHtml(template, data, options);

export const generateEmailHtml = (template, data, options = {}) =>
    generateDocumentEmailHtml(template, data, options);

const getTemplateDesignerSettingsQuick = (template = {}) => {
    if (template.salesDesignerSettings && typeof template.salesDesignerSettings === 'object') {
        return template.salesDesignerSettings;
    }
    if (template.purchaseDesignerSettings && typeof template.purchaseDesignerSettings === 'object') {
        return template.purchaseDesignerSettings;
    }
    try {
        const displayOptions = typeof template.displayOptions === 'string'
            ? JSON.parse(template.displayOptions)
            : (template.displayOptions || {});
        return displayOptions.salesDesignerSettings || displayOptions.purchaseDesignerSettings || displayOptions.designerSettings || {};
    } catch {
        return {};
    }
};

const fmt2 = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '0.00');

const buildQrContent = (data, companyName) => {
    const lines = [];

    // ── Document identity ──────────────────────────────────────────────
    if (data.title) lines.push(`Type: ${data.title}`);
    if (data.docNo) lines.push(`Doc No: ${data.docNo}`);
    if (data.date) lines.push(`Date: ${data.date}`);
    const docStatus = data.status || data.meta?.status;
    if (docStatus) lines.push(`Status: ${docStatus}`);

    // ── Company (issuer) ───────────────────────────────────────────────
    if (companyName) lines.push(`Company: ${companyName}`);

    // ── Party (purchase: data.party / sales: data.customer) ───────────
    const p = data.party || data.customer;
    const partyLabel = data.party ? 'Vendor' : 'Customer';
    if (p?.name) lines.push(`${partyLabel}: ${p.name}`);
    if (p?.code) lines.push(`${partyLabel} Code: ${p.code}`);
    if (p?.taxId || p?.trn) lines.push(`${partyLabel} TRN: ${p.taxId || p.trn}`);
    if (p?.phone) lines.push(`${partyLabel} Phone: ${p.phone}`);
    if (p?.address) lines.push(`${partyLabel} Address: ${p.address}`);

    // ── Header meta (purchase format) ─────────────────────────────────
    if (Array.isArray(data.headerMeta)) {
        for (const row of data.headerMeta) {
            if (row?.label && row?.value) lines.push(`${row.label}: ${row.value}`);
        }
    }

    // ── References (purchase format) ──────────────────────────────────
    if (Array.isArray(data.references)) {
        for (const row of data.references) {
            if (row?.label && row?.value) lines.push(`${row.label}: ${row.value}`);
        }
    }

    // ── Sales meta fields ──────────────────────────────────────────────
    if (data.meta) {
        const m = data.meta;
        if (m.paymentTerm || m.paymentTerms) lines.push(`Payment Terms: ${m.paymentTerm || m.paymentTerms}`);
        if (m.salesPerson || m.salesperson) lines.push(`Sales Person: ${m.salesPerson || m.salesperson}`);
        if (m.poNumber) lines.push(`P.O Number: ${m.poNumber}`);
        if (m.location || m.branch) lines.push(`Location: ${m.location || m.branch}`);
    }

    // ── Items summary ──────────────────────────────────────────────────
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length > 0) {
        lines.push(`Items: ${items.length}`);
        for (const item of items) {
            const name = item.name || item.description?.title || item.itemName || '';
            const qty = item.qty ?? item.quantity ?? '';
            const code = item.code || item.itemCode || '';
            const itemLine = [name, code && `(${code})`, qty && `Qty: ${qty}`].filter(Boolean).join(' ');
            if (itemLine) lines.push(`  - ${itemLine}`);
        }
    }

    // ── Totals ─────────────────────────────────────────────────────────
    const t = data.totals || {};
    const currency = t.currency || 'AED';
    if (t.subTotal != null) lines.push(`Sub Total: ${currency} ${fmt2(t.subTotal)}`);
    if (t.tax != null && Number(t.tax) > 0) lines.push(`VAT: ${currency} ${fmt2(t.tax)}`);
    if (t.grandTotal != null) lines.push(`Grand Total: ${currency} ${fmt2(t.grandTotal)}`);
    if (t.amountPaid != null && Number(t.amountPaid) > 0) lines.push(`Amount Paid: ${currency} ${fmt2(t.amountPaid)}`);
    if (t.balanceDue != null && Number(t.balanceDue) > 0) lines.push(`Balance Due: ${currency} ${fmt2(t.balanceDue)}`);

    // ── Notes (purchase: data.notes / sales: data.meta.notes) ─────────
    const docNotes = data.notes || data.meta?.notes;
    if (docNotes) lines.push(`Notes: ${docNotes}`);

    return lines.join('\n');
};

export const generatePrintHtmlAsync = async (template, data, options = {}) => {
    const settings = getTemplateDesignerSettingsQuick(template);
    const showQR = Boolean(settings.showQRCode || settings.showQR);

    if (showQR) {
        try {
            const companyName = options.companyProfile?.companyName || options.companyProfile?.name || '';
            const qrContent = buildQrContent(data, companyName);
            const qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
                width: 160,
                margin: 1,
                errorCorrectionLevel: 'L'
            });
            return generateDocumentPrintHtml(template, data, { ...options, qrCodeDataUrl });
        } catch (e) {
            console.warn('QR code generation failed, printing without QR:', e);
        }
    }

    return generateDocumentPrintHtml(template, data, options);
};

// Same as generatePrintHtmlAsync but uses the 'pdf' render target so the
// output has flat CSS (no @media/@page) suitable for html2canvas capture.
export const generatePdfHtmlAsync = async (template, data, options = {}) => {
    const settings = getTemplateDesignerSettingsQuick(template);
    const showQR = Boolean(settings.showQRCode || settings.showQR);

    if (showQR) {
        try {
            const companyName = options.companyProfile?.companyName || options.companyProfile?.name || '';
            const qrContent = buildQrContent(data, companyName);
            const qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
                width: 160,
                margin: 1,
                errorCorrectionLevel: 'L'
            });
            return generateDocumentPdfHtml(template, data, { ...options, qrCodeDataUrl });
        } catch (e) {
            console.warn('QR code generation failed, continuing without QR:', e);
        }
    }

    return generateDocumentPdfHtml(template, data, options);
};

// ──────────────────────────────────────────────────────────────────────────
// A4 portrait report template (canonical — shared by Print + PDF)
//
// Consumes a view-model identical to what the screen renders:
//   { reportTitle, sections: [{ title?, columns, rows, totals?, totalsLabel? }],
//     kpis?: [{ label, value, hint? }], note?, meta: {...} }
// No values are recomputed here — totals come straight from the view-model.
// ──────────────────────────────────────────────────────────────────────────

const reportA4Styles = `
    /* Margins live on the content wrapper (.page-pad) rather than @page, so the
       print output and the html2canvas/jsPDF raster output (which ignores
       @page) get the same whitespace. A small @page margin keeps the browser's
       own header/footer off the page in the print path. */
    @page { size: A4 portrait; margin: 8mm; }
    @page { @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 7pt; color: #94a3b8; } }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        color: #1e293b;
        font-size: 9pt;
        line-height: 1.4;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
    .page-pad { padding: 4mm 2mm; }

    /* ── Document header (repeats visually at top of doc) ── */
    .doc-head {
        border-bottom: 2px solid #E5B426;
        padding-bottom: 8px;
        margin-bottom: 10px;
    }
    .doc-head .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
    }
    .doc-head .company h2 {
        margin: 0 0 2px;
        font-size: 14pt;
        font-weight: 500;
        color: #111827;
        letter-spacing: 0.01em;
    }
    .doc-head .company p {
        margin: 0;
        font-size: 7.5pt;
        color: #64748b;
        line-height: 1.35;
    }
    .doc-head .company { max-width: 52%; }
    .doc-head .title-block { text-align: right; min-width: 42%; flex-shrink: 0; }
    .doc-head .title-block .badge {
        display: inline-block;
        background: #F5C742;
        color: #1a1200;
        font-size: 7pt;
        font-weight: 500;
        letter-spacing: 0.08em;
        padding: 2px 9px;
        border-radius: 3px;
        margin-bottom: 5px;
    }
    .doc-head .title-block h1 {
        margin: 0;
        font-size: 15pt;
        font-weight: 500;
        color: #111827;
    }
    .doc-head .title-block .note {
        margin: 3px 0 0;
        font-size: 8pt;
        color: #92400e;
        font-weight: 500;
    }

    /* ── Filter / meta strip ── */
    .meta-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 6px;
        margin-bottom: 10px;
    }
    .meta-strip .pill {
        display: inline-block;
        background: #FFF8E7;
        border: 1px solid #FDE6A9;
        border-radius: 3px;
        padding: 2px 8px;
        font-size: 7.5pt;
        color: #7c5e00;
        white-space: nowrap;
    }
    .meta-strip .pill b { color: #5b4500; font-weight: 500; }

    /* ── KPI strip ── */
    .kpi-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 12px;
    }
    .kpi {
        flex: 1 1 0;
        min-width: 110px;
        border: 1px solid #FDE6A9;
        border-radius: 5px;
        background: #FFFBF0;
        padding: 6px 9px;
    }
    .kpi .k-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.05em; color: #94855a; font-weight: 500; }
    .kpi .k-value { font-size: 12pt; font-weight: 500; color: #1a1200; margin-top: 1px; }
    .kpi .k-hint  { font-size: 6.8pt; color: #a8a29e; margin-top: 1px; }

    /* ── Section ── */
    .section { margin-bottom: 14px; }
    .section > h3 {
        margin: 0 0 5px;
        font-size: 9.5pt;
        font-weight: 500;
        color: #1a1200;
        padding-left: 7px;
        border-left: 3px solid #F5C742;
    }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; border-spacing: 0; }
    thead { display: table-header-group; }   /* repeat header on every page */
    tfoot { display: table-row-group; }
    thead th {
        background: #F5C742;
        color: #1a1200;
        font-weight: 500;
        font-size: 7.5pt;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 5px 7px;
        text-align: left;
        border: 0.5px solid #E5B426;
    }
    thead th.num { text-align: right; }
    thead th.center { text-align: center; }
    tbody td {
        padding: 4px 7px;
        font-size: 8pt;
        border: 0.5px solid #eef2f6;
        color: #334155;
        vertical-align: middle;
        word-break: break-word;
    }
    tbody td.num { text-align: right; }
    tbody td.center { text-align: center; }
    tbody tr:nth-child(even) { background: #FFFCF4; }
    tr { page-break-inside: avoid; }

    tfoot td {
        padding: 5px 7px;
        font-size: 8pt;
        font-weight: 500;
        background: #FFF3D1;
        border: 0.5px solid #E5B426;
        color: #5b4500;
    }
    tfoot td.num { text-align: right; }

    /* ── Footer band ── */
    .doc-foot {
        margin-top: 10px;
        padding-top: 6px;
        border-top: 1px solid #FDE6A9;
        display: flex;
        justify-content: space-between;
        font-size: 7pt;
        color: #94a3b8;
    }
`;

// Normalise monetary cells to a consistent 2-decimal, thousands-separated
// format. Reports build values as "AED <number>" via toLocaleString(), which
// drops trailing decimals (e.g. "AED 14,297.8", "AED 920.2", "AED 0"). This
// rewrites the numeric portion of any "AED <number>" / "<number> AED" string
// to 2dp so totals, subtotals and figures read uniformly across every output.
const MONEY_NUMBER_PATTERN = /(AED\s*)([+-]?\d[\d,]*(?:\.\d+)?)|([+-]?\d[\d,]*(?:\.\d+)?)(\s*AED)/gi;
const formatMoneyNumber = (raw) => {
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) return raw;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
// Negative-zero (e.g. "-0.0%", "AED -0.00") reads as a defect — strip the sign.
const stripNegativeZero = (text) =>
    text.replace(/-(0(?:\.0+)?)(?=%|\s|$|[^0-9.])/g, '$1');
const normaliseReportMoney = (value) => {
    let text = String(value);
    if (/AED/i.test(text)) {
        text = text.replace(MONEY_NUMBER_PATTERN, (match, pre, n1, n2, post) =>
            pre !== undefined ? `${pre}${formatMoneyNumber(n1)}` : `${formatMoneyNumber(n2)}${post}`
        );
    }
    return stripNegativeZero(text);
};

// Two section shapes flow into this renderer (see project_sales_reports_pipeline):
//
//   A) Sales-report shape (the renderer's native format):
//      { title, columns: [{ header, key, align }], rows: [{ key: value }],
//        totals: { key: value }, totalsLabel }
//
//   B) Legacy POS X/Z-report shape (built in POSSales.buildX/ZReportViewModel):
//      { title, cols: ['Header', …], rows: [['cell', …], …], footer: ['cell', …] }
//
// Feeding shape B straight into the renderer crashed it: `section.columns` was
// undefined, so `columns.map(...)` threw "Cannot read properties of undefined
// (reading 'map')" (the X/Z-Report / Export / Session-Close print crash).
// normalizeReportSection converts B → A so a single renderer serves both, and
// also hardens A against missing/legacy fields. The downstream code can then
// assume `columns` is always an array of { header, key, align }.
const normalizeReportSection = (section = {}) => {
    // Already in native shape — only fill defensive gaps.
    if (Array.isArray(section.columns)) {
        return {
            title: section.title || '',
            columns: section.columns,
            rows: Array.isArray(section.rows) ? section.rows : [],
            totals: section.totals || null,
            totalsLabel: section.totalsLabel || 'TOTAL',
        };
    }

    // Legacy { cols, rows: [[…]], footer } shape — map positionally onto
    // synthetic keys (c0, c1, …) so the keyed renderer can consume it.
    const cols = Array.isArray(section.cols) ? section.cols : [];
    const columns = cols.map((header, idx) => ({
        header,
        key: `c${idx}`,
        // First column is a label; remaining columns are numeric/amount → right-align.
        align: idx === 0 ? 'left' : 'right',
    }));
    const rows = (Array.isArray(section.rows) ? section.rows : []).map((row) => {
        const cells = Array.isArray(row) ? row : [];
        const obj = {};
        columns.forEach((col, idx) => { obj[col.key] = cells[idx]; });
        return obj;
    });
    let totals = null;
    if (Array.isArray(section.footer) && section.footer.length) {
        totals = {};
        columns.forEach((col, idx) => { totals[col.key] = section.footer[idx]; });
    }

    return {
        title: section.title || '',
        columns,
        rows,
        totals,
        totalsLabel: 'TOTAL',
    };
};

const renderReportColumnsHtml = (columns, companyProfile) =>
    (Array.isArray(columns) ? columns : [])
        .map((col) => {
            const cls = col.align === 'right' ? 'num' : col.align === 'center' ? 'center' : '';
            return `<th class="${cls}">${renderTextWithCurrencySymbols(col.header, companyProfile)}</th>`;
        })
        .join('');

const renderReportCellHtml = (col, value, companyProfile) => {
    const cls = col.align === 'right' ? 'num' : col.align === 'center' ? 'center' : '';
    const display =
        value !== null && value !== undefined && value !== ''
            ? renderTextWithCurrencySymbols(normaliseReportMoney(value), companyProfile)
            : '—';
    return `<td class="${cls}">${display}</td>`;
};

const renderReportSectionHtml = (rawSection, companyProfile) => {
    const { title, columns, rows, totals, totalsLabel } = normalizeReportSection(rawSection);
    const head = `<thead><tr>${renderReportColumnsHtml(columns, companyProfile)}</tr></thead>`;
    const body = rows.length
        ? rows
            .map(
                (row) =>
                    `<tr>${columns.map((col) => renderReportCellHtml(col, row[col.key], companyProfile)).join('')}</tr>`
            )
            .join('')
        : `<tr><td colspan="${columns.length}" style="text-align:center;color:#94a3b8;padding:14px;">No records for the selected filters.</td></tr>`;

    let foot = '';
    if (totals) {
        const cells = columns
            .map((col, idx) => {
                const cls = col.align === 'right' ? 'num' : col.align === 'center' ? 'center' : '';
                let value = totals[col.key];
                if ((value === null || value === undefined || value === '') && idx === 0) {
                    value = totalsLabel || 'TOTAL';
                }
                const display =
                    value !== null && value !== undefined && value !== ''
                        ? renderTextWithCurrencySymbols(normaliseReportMoney(value), companyProfile)
                        : '';
                return `<td class="${cls}">${display}</td>`;
            })
            .join('');
        foot = `<tfoot><tr>${cells}</tr></tfoot>`;
    }

    return `<div class="section">${title ? `<h3>${escapeHtml(title)}</h3>` : ''}<table>${head}<tbody>${body}</tbody>${foot}</table></div>`;
};

export const generateReportA4Html = (viewModel = {}, companyProfile = {}, meta = {}) => {
    const generatedAt = new Date().toLocaleString();
    // Landscape support: swap the @page size only (margins/page-number rule unchanged).
    const a4Styles = meta.orientation === 'landscape'
        ? reportA4Styles.replace('size: A4 portrait;', 'size: A4 landscape;')
        : reportA4Styles;
    const companyName = escapeHtml(companyProfile.companyName || companyProfile.name || 'BillBull ERP');
    const address = escapeHtml(companyProfile.address || '');
    const email = escapeHtml(companyProfile.email || '');
    const phone = escapeHtml(companyProfile.phone || '');
    const trn = escapeHtml(companyProfile.trn || '');
    const branchDisplay = escapeHtml(
        companyProfile.branchName ||
        (meta.branch && meta.branch !== 'All' ? String(meta.branch) : '')
    );

    const reportTitle = escapeHtml(viewModel.reportTitle || meta.reportTitle || 'Sales Report');
    const sections = Array.isArray(viewModel.sections) ? viewModel.sections : [];
    const kpis = Array.isArray(viewModel.kpis) ? viewModel.kpis : [];
    const note = viewModel.note ? escapeHtml(viewModel.note) : '';

    // Applied-filter pills — only show filters that are actually set.
    const filters = Array.isArray(meta.filters) ? meta.filters : [];
    const pills = filters
        .filter((f) => f && f.value && String(f.value).trim() && String(f.value) !== 'All')
        .map(
            (f) =>
                `<span class="pill"><b>${escapeHtml(f.label)}:</b> ${renderTextWithCurrencySymbols(String(f.value), companyProfile)}</span>`
        );
    pills.push(`<span class="pill"><b>Generated:</b> ${escapeHtml(generatedAt)}</span>`);
    if (meta.user) pills.push(`<span class="pill"><b>User:</b> ${escapeHtml(meta.user)}</span>`);

    const kpiHtml = kpis.length
        ? `<div class="kpi-strip">${kpis
            .map(
                (k) =>
                    `<div class="kpi"><div class="k-label">${escapeHtml(k.label)}</div><div class="k-value">${renderTextWithCurrencySymbols(normaliseReportMoney(k.value), companyProfile)}</div>${k.hint ? `<div class="k-hint">${escapeHtml(k.hint)}</div>` : ''}</div>`
            )
            .join('')}</div>`
        : '';

    const sectionsHtml = sections.length
        ? sections.map((s) => renderReportSectionHtml(s, companyProfile)).join('')
        : '<p style="text-align:center;color:#94a3b8;padding:24px;">No data available for this report.</p>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>${reportTitle}</title>
    <style>${a4Styles}</style>
</head>
<body>
  <div class="page-pad">
    <div class="doc-head">
        <div class="top">
            <div class="company">
                ${(companyProfile.showLogo !== false && companyProfile.logoUrl) ? `<img src="${companyProfile.logoUrl}" style="height:50px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px;" />` : ''}
                <h2>${companyName}</h2>
                ${branchDisplay ? `<p style="font-size:8pt;color:#b45309;font-weight:500;margin-top:1px;">Branch: ${branchDisplay}</p>` : ''}
                ${address ? `<p>${address}</p>` : ''}
                ${(email || phone) ? `<p>${email ? `Email: ${email}` : ''}${email && phone ? ' &nbsp;|&nbsp; ' : ''}${phone ? `Phone: ${phone}` : ''}</p>` : ''}
                ${trn ? `<p>TRN: ${trn}</p>` : ''}
            </div>
            <div class="title-block">
                <span class="badge">OFFICIAL REPORT</span>
                <h1>${reportTitle}</h1>
                ${note ? `<p class="note">${note}</p>` : ''}
            </div>
        </div>
    </div>

    <div class="meta-strip">${pills.join('')}</div>

    ${kpiHtml}

    ${sectionsHtml}

    ${(companyProfile.showStampInPrint !== false && companyProfile.stampUrl) ? `<div style="text-align:right;margin-top:20px;padding-right:24px;"><img src="${companyProfile.stampUrl}" style="height:60px;max-width:200px;object-fit:contain;display:inline-block;" /></div>` : ''}

    <div class="doc-foot">
        <span>Generated by ${companyName} &nbsp;|&nbsp; Confidential</span>
        <span>${escapeHtml(generatedAt)}</span>
    </div>
  </div>
</body>
</html>`;
};

// ──────────────────────────────────────────────────────────────────────────
// Thermal (58mm / 80mm) X/Z report renderer.
//
// Consumes the SAME view-model as generateReportA4Html:
//   { reportTitle, note?, kpis?: [{label,value,hint?}],
//     sections: [{ title?, cols:[...], rows:[[...]], footer?:[...] }] }
// so preview / print / PDF all render identical data — only layout differs.
//
// Monospace, fixed character width (58mm≈32ch, 80mm≈48ch). Each section becomes a
// label/value block: the first column is the row label, the LAST column is the
// right-aligned amount, and any middle column (e.g. a count) is appended to the
// label in parentheses. This keeps wide A4 tables legible on a narrow roll with
// no clipped values and no horizontal overflow.
// ──────────────────────────────────────────────────────────────────────────

const THERMAL_WIDTHS = { '58mm': 32, '80mm': 48 };

const padThermalRow = (left, right, width) => {
    const l = String(left ?? '');
    const r = String(right ?? '');
    if (!r) return l.length > width ? l.slice(0, width) : l;
    const space = width - r.length;
    if (l.length >= space) {
        // Wrap the label across lines, keep the value on the first line's tail.
        const head = l.slice(0, Math.max(0, space - 1));
        return `${head} ${r}`;
    }
    return l + ' '.repeat(space - l.length) + r;
};

const centerThermal = (text, width) => {
    const t = String(text ?? '');
    if (t.length >= width) return t.slice(0, width);
    const pad = Math.floor((width - t.length) / 2);
    return ' '.repeat(pad) + t;
};

export const generateReportThermalHtml = (viewModel = {}, companyProfile = {}, meta = {}) => {
    const paper = meta.paper === '58mm' ? '58mm' : '80mm';
    const pw = paper === '58mm' ? '50mm' : '72mm';

    const companyName = companyProfile.companyName || companyProfile.name || 'BillBull ERP';
    const branch = companyProfile.branchName || (meta.branch && meta.branch !== 'All' ? meta.branch : '');
    const trn = companyProfile.trn || '';
    const reportTitle = viewModel.reportTitle || meta.reportTitle || 'POS Report';
    const sections = Array.isArray(viewModel.sections) ? viewModel.sections : [];
    const kpis = Array.isArray(viewModel.kpis) ? viewModel.kpis : [];
    const D = `<div class="d"></div>`;
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(reportTitle)}</title><style>
@page{margin:0;size:${paper} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:6px 0}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin:2px 0}
.row .lbl{flex:1;text-align:left;word-break:break-word;overflow-wrap:anywhere}
.row .val{flex:0 0 auto;text-align:right;white-space:nowrap}
.s{font-size:11px;font-weight:bold;text-transform:uppercase;color:#000;margin:10px 0 4px;border-bottom:1px solid #000;padding-bottom:2px}
</style></head><body>`;

    if (companyProfile.showLogo !== false && companyProfile.logoUrl) {
        html += `<div class="c" style="margin:4px 0 6px"><img src="${companyProfile.logoUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`;
    }
    html += `<div class="c b" style="font-size:14px;margin-bottom:2px">${esc(companyName.toUpperCase())}</div>`;
    if (branch) html += `<div class="c" style="font-size:11px">${esc(branch)}</div>`;
    if (trn) html += `<div class="c" style="font-size:11px">TRN: ${esc(trn)}</div>`;
    html += D;
    html += `<div class="c b" style="font-size:13px">${esc(reportTitle.toUpperCase())}</div>`;
    html += D;

    if (viewModel.note) {
        String(viewModel.note).split('|').map(s => s.trim()).filter(Boolean)
            .forEach(part => {
                html += `<div class="c" style="font-size:10px;margin:2px 0">${esc(part)}</div>`;
            });
        html += D;
    }

    if (kpis.length) {
        kpis.forEach(k => {
            html += `<div class="row b"><span class="lbl">${esc(k.label)}</span><span class="val">${renderTextWithCurrencySymbols(normaliseReportMoney(k.value), companyProfile)}</span></div>`;
        });
        html += D;
    }

    sections.forEach(section => {
        if (section.title) {
            html += `<div class="s">${esc(section.title)}</div>`;
        }
        const rows = Array.isArray(section.rows) ? section.rows : [];
        rows.forEach(row => {
            const cells = Array.isArray(row) ? row : [row];
            if (cells.length === 0) return;
            if (cells.length === 1) {
                html += `<div class="row"><span class="lbl">${esc(cells[0])}</span></div>`;
                return;
            }
            const label = cells[0];
            const value = cells[cells.length - 1];
            const middle = cells.slice(1, -1).filter(c => c !== '' && c != null);
            const fullLabel = middle.length ? `${label} (${middle.join('/')})` : label;
            html += `<div class="row"><span class="lbl">${esc(fullLabel)}</span><span class="val">${renderTextWithCurrencySymbols(normaliseReportMoney(value), companyProfile)}</span></div>`;
        });
        if (Array.isArray(section.footer) && section.footer.length) {
            const f = section.footer;
            const label = f[0];
            const value = f[f.length - 1];
            const middle = f.slice(1, -1).filter(c => c !== '' && c != null);
            const fullLabel = middle.length ? `${label} (${middle.join('/')})` : label;
            html += D;
            html += `<div class="row b"><span class="lbl">${esc(fullLabel)}</span><span class="val">${renderTextWithCurrencySymbols(normaliseReportMoney(value), companyProfile)}</span></div>`;
        }
    });

    html += D;
    html += `<div class="c" style="font-size:10px;margin:4px 0">Generated ${new Date().toLocaleString()}</div>`;
    if (meta.user) html += `<div class="c" style="font-size:10px;margin-bottom:4px">By: ${esc(meta.user)}</div>`;
    if (companyProfile.showStampInPrint !== false && companyProfile.stampUrl) {
        html += `<div class="c" style="margin:12px 0 6px"><img src="${companyProfile.stampUrl}" style="height:56px;max-width:80%;object-fit:contain;display:block;margin:0 auto" /></div>`;
    }
    html += `<div class="c b" style="font-size:11px;margin-top:6px">*** END OF REPORT ***</div>`;
    html += `</body></html>`;
    return html;
};

export const generateReportPrintHtml = (_template, reportTitle, columns, data, companyProfile = {}, meta = {}) => {
    const generatedAt = new Date().toLocaleString();
    const companyName = escapeHtml(companyProfile.companyName || 'BillBull ERP');
    const address = escapeHtml(companyProfile.address || '');
    const email = escapeHtml(companyProfile.email || '');
    const phone = escapeHtml(companyProfile.phone || '');
    const trn = escapeHtml(companyProfile.trn || '');

    let metaBadges = `<span class="pill">Generated: ${escapeHtml(generatedAt)}</span>`;
    metaBadges += `<span class="pill">Records: ${data.length}</span>`;
    if (meta.dateFrom || meta.dateTo) {
        metaBadges += `<span class="pill">Period: ${escapeHtml(meta.dateFrom || '—')} → ${escapeHtml(meta.dateTo || '—')}</span>`;
    }
    if (meta.branch && meta.branch !== 'All') {
        metaBadges += `<span class="pill">Branch: ${escapeHtml(meta.branch)}</span>`;
    }

    const pageStyles = `
        @page { size: A4 landscape; margin: 0; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 0;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1e293b;
            font-size: 9.5pt;
            line-height: 1.45;
            background: #fff;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        /* ── Amber header bar ── */
        .header-bar {
            background: linear-gradient(90deg, #F5C742 0%, #E5B426 100%);
            padding: 10px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header-bar .brand {
            font-size: 15px;
            font-weight: 500;
            color: #1a1200;
            letter-spacing: 0.04em;
        }
        .header-bar .badge {
            background: rgba(255,255,255,0.35);
            color: #1a1200;
            font-size: 9px;
            font-weight: 500;
            padding: 3px 10px;
            border-radius: 20px;
            letter-spacing: 0.07em;
        }

        /* ── Meta / company section ── */
        .meta-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 14px 24px 10px;
            border-bottom: 2px solid #FDE6A9;
            background: #FFFBF0;
        }
        .company-block {
            max-width: 50%;
        }
        .company-block h2 {
            margin: 0 0 3px;
            font-size: 15px;
            font-weight: 500;
            color: #111827;
        }
        .company-block p {
            margin: 1px 0;
            font-size: 9px;
            color: #64748b;
        }
        .report-block {
            text-align: right;
        }
        .report-block h1 {
            margin: 0 0 6px;
            font-size: 19px;
            font-weight: 500;
            color: #111827;
        }
        .pills {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            justify-content: flex-end;
        }
        .pill {
            display: inline-block;
            background: #FFF8E7;
            border: 1px solid #FDE6A9;
            border-radius: 20px;
            padding: 2px 9px;
            font-size: 8.5px;
            color: #92400e;
            white-space: nowrap;
        }

        /* ── Table ── */
        .table-wrap {
            padding: 14px 24px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            border-spacing: 0;
        }
        thead th {
            background: #F5C742;
            color: #1a1200;
            font-weight: 500;
            font-size: 8.5px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 7px 9px;
            text-align: left;
            border: 1px solid #E5B426;
        }
        thead th.num { text-align: right; }
        tbody tr:nth-child(even) { background: #FFFBF0; }
        tbody tr:nth-child(odd)  { background: #ffffff; }
        tbody td {
            padding: 6px 9px;
            font-size: 9px;
            border: 1px solid #f1f5f9;
            color: #334155;
            vertical-align: middle;
        }
        tbody td.num { text-align: right; }
        tbody tr:last-child td { border-bottom: 1px solid #FDE6A9; }

        /* ── Summary row ── */
        tfoot td {
            padding: 6px 9px;
            font-size: 9px;
            font-weight: 500;
            background: #FFF8E7;
            border-top: 2px solid #E5B426;
            color: #92400e;
        }
        tfoot td.num { text-align: right; }

        /* ── Footer ── */
        .footer {
            padding: 8px 24px;
            border-top: 1px solid #FDE6A9;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #94a3b8;
        }

        /* ── Print page break ── */
        @media print {
            .header-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .meta-section { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tbody tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tfoot td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
        }
    `;

    // Detect numeric columns for right-alignment
    const numericKeys = new Set();
    data.slice(0, 5).forEach(row => {
        columns.forEach(col => {
            if (typeof row[col.key] === 'number') numericKeys.add(col.key);
        });
    });

    const headers = columns.map(col =>
        `<th class="${numericKeys.has(col.key) ? 'num' : ''}">${renderTextWithCurrencySymbols(col.header, companyProfile)}</th>`
    ).join('');

    const rows = data.map(row => `
        <tr>
            ${columns.map(col => {
        const value = row[col.key];
        const isNum = numericKeys.has(col.key);
        const display = value !== null && value !== undefined ? renderTextWithCurrencySymbols(String(value), companyProfile) : '—';
        return `<td class="${isNum ? 'num' : ''}">${display}</td>`;
    }).join('')}
        </tr>
    `).join('');

    // Compute numeric totals for footer
    const numericCols = columns.filter(col => numericKeys.has(col.key));
    const footerRow = numericCols.length > 0 ? (() => {
        const totals = {};
        numericCols.forEach(col => {
            totals[col.key] = data.reduce((sum, row) => sum + (Number(row[col.key]) || 0), 0);
        });
        const cells = columns.map(col => {
            if (numericKeys.has(col.key)) {
                return `<td class="num">${totals[col.key].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
            }
            return col === columns[0] ? `<td><strong>TOTALS</strong></td>` : '<td></td>';
        });
        return `<tfoot><tr>${cells.join('')}</tr></tfoot>`;
    })() : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(reportTitle)}</title>
    <style>${pageStyles}</style>
</head>
<body>
    <div class="header-bar">
        <span class="brand">${companyName}${meta.branch && meta.branch !== 'All' ? ` &nbsp;—&nbsp; ${escapeHtml(meta.branch)}` : ''}</span>
        <span class="badge">OFFICIAL REPORT</span>
    </div>

    <div class="meta-section">
        <div class="company-block">
            <h2>${companyName}</h2>
            ${address ? `<p>${address}</p>` : ''}
            ${(email || phone) ? `<p>${email ? `Email: ${email}` : ''}${email && phone ? ' &nbsp;|&nbsp; ' : ''}${phone ? `Phone: ${phone}` : ''}</p>` : ''}
            ${trn ? `<p>TRN: ${trn}</p>` : ''}
        </div>
        <div class="report-block">
            <h1>${escapeHtml(reportTitle)}</h1>
            <div class="pills">${metaBadges}</div>
        </div>
    </div>

    <div class="table-wrap">
        <table>
            <thead><tr>${headers}</tr></thead>
            <tbody>${rows}</tbody>
            ${footerRow}
        </table>
    </div>

    <div class="footer">
        <span>Generated by BillBull ERP &nbsp;|&nbsp; Confidential</span>
        <span>${escapeHtml(generatedAt)}</span>
    </div>
</body>
</html>`;
};

// Server-side PDF: posts the (working) PRINT HTML to the backend, which renders
// it with headless Chromium — the same layout engine that produces the perfect
// print preview. The result is a vector, selectable-text PDF with correct page
// breaks and alignment, identical to Ctrl+P → Save as PDF. This replaces the
// html2canvas slice-and-dice path (downloadPdf below) which cuts content
// mid-row because it screenshots the page and chops the bitmap at fixed offsets.
export const downloadPdfViaServer = async (htmlContent, filename = 'document') => {
    const { default: api } = await import('../api/axiosConfig');
    const res = await api.post(
        '/api/documents/pdf',
        { html: htmlContent, filename },
        { responseType: 'blob' }
    );

    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(filename).replace(/\.pdf$/i, '')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the click has had a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Renders the generated HTML to a real PDF file and downloads it directly —
export const downloadPdf = async (htmlContent, filename = 'document') => {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
    ]);

    const A4_W_MM = 210;
    const A4_H_MM = 297;
    const PAGE_W_PX = 794;

    // Strip residual scripts, then make all root-relative asset URLs absolute
    // so they resolve correctly inside an srcdoc iframe (which has no origin).
    const origin = window.location.origin;
    const flatHtml = htmlContent
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/(src=["'])(\/[^"']+["'])/gi, `$1${origin}$2`)
        .replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, `url($1${origin}$2$1)`);

    // Use opacity:0 not visibility:hidden — html2canvas cannot capture visibility:hidden elements.
    // Position off-screen (left:-9999px) so user never sees the render frame.
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
        `position:fixed;left:-9999px;top:0;width:${PAGE_W_PX}px;height:1123px;` +
        'border:none;opacity:0;pointer-events:none;background:#fff;';
    document.body.appendChild(iframe);

    try {
        await new Promise((resolve, reject) => {
            iframe.onload = resolve;
            iframe.onerror = reject;
            iframe.srcdoc = flatHtml;
        });

        // Wait for embedded fonts and images to fully load and render
        try {
            await iframe.contentDocument.fonts.ready;
        } catch { /* ignore if fonts API not available */ }
        await new Promise(r => setTimeout(r, 600));

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const totalH = iframeDoc.documentElement.scrollHeight;
        iframe.style.height = `${totalH}px`;
        // Force layout recalculation after resize
        void iframeDoc.documentElement.offsetHeight;
        await new Promise(r => setTimeout(r, 200));

        const scale = 2;
        const fullCanvas = await html2canvas(iframeDoc.body, {
            scale,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: PAGE_W_PX,
            height: totalH,
            windowWidth: PAGE_W_PX,
            scrollX: 0,
            scrollY: 0,
            logging: false,
        });

        // A4 page height in canvas pixels (scale already baked into fullCanvas)
        const a4PagePx = Math.round(fullCanvas.width * (A4_H_MM / A4_W_MM));
        const totalPages = Math.ceil(fullCanvas.height / a4PagePx);

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        for (let page = 0; page < totalPages; page++) {
            if (page > 0) pdf.addPage();

            const srcY  = page * a4PagePx;
            const srcH  = Math.min(a4PagePx, fullCanvas.height - srcY);

            const pageCanvas = document.createElement('canvas');
            pageCanvas.width  = fullCanvas.width;
            pageCanvas.height = a4PagePx;
            const ctx = pageCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, fullCanvas.width, a4PagePx);
            ctx.drawImage(fullCanvas, 0, srcY, fullCanvas.width, srcH,
                                      0, 0,    fullCanvas.width, srcH);

            pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95),
                'JPEG', 0, 0, A4_W_MM, A4_H_MM);
        }

        pdf.save(`${filename}.pdf`);
    } finally {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
};

export const printHtml = (htmlContent) => {
    // Remove any previous print frame
    const existing = document.getElementById('__bb_print_frame__');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = '__bb_print_frame__';
    // Must be wide enough (A4 = ~794px at 96dpi) so that getBoundingClientRect()
    // inside the document script returns real layout dimensions for the footer
    // spacer calculation. Positioned off-screen so it is invisible to the user.
    iframe.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;height:1123px;opacity:0;border:none;pointer-events:none;';
    document.body.appendChild(iframe);

    const cleanup = () => {
        setTimeout(() => { if (iframe.parentNode) iframe.remove(); }, 3000);
    };

    let hasPrinted = false;
    const runPrint = () => {
        if (hasPrinted) return;
        hasPrinted = true;
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch {
            // Fallback: open new window if iframe print is blocked
            const win = window.open('', '_blank');
            if (win) { win.document.write(htmlContent); win.document.close(); setTimeout(() => win.print(), 500); }
        }
        cleanup();
    };

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.onload = () => setTimeout(runPrint, 350);
    setTimeout(runPrint, 900);
};
