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
import { ROBOTO_MONO_FONT_FACE } from './receiptFont';
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

export const buildQrContent = (data, companyName) => {
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

    /* Modern POS report overrides. Kept later in the template so older report
       styles are neutralized without changing the renderer contract. */
    @page {
        size: A4 portrait;
        margin: 10mm 9mm 12mm;
        @bottom-right {
            content: "Page " counter(page) " of " counter(pages);
            font-size: 7pt;
            color: #64748b;
        }
        @bottom-left {
            content: "BillBull ERP | Confidential";
            font-size: 7pt;
            color: #64748b;
        }
    }
    html, body { background: #fff; }
    body {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        font-family: Inter, "Segoe UI", Arial, sans-serif;
        color: #0f172a;
        font-size: 8.2pt;
        line-height: 1.38;
    }
    .page-pad { width: 100%; padding: 2mm 1mm 4mm; background: #fff; }
    .doc-head {
        border: 1px solid #d7dde6;
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 9px;
        background: #fff;
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .doc-head .top {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(220px, .9fr);
        gap: 16px;
        align-items: start;
    }
    .company-row { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
    .company-logo { width: 54px; height: 54px; object-fit: contain; flex: 0 0 auto; }
    .company-logo-placeholder {
        width: 54px;
        height: 54px;
        border: 1px solid #d7dde6;
        border-radius: 8px;
        background: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13pt;
        font-weight: 700;
        color: #475569;
        flex: 0 0 auto;
    }
    .doc-head .company { max-width: none; min-width: 0; }
    .doc-head .company h2 {
        margin: 0 0 3px;
        font-size: 13.5pt;
        line-height: 1.15;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0;
    }
    .doc-head .company p {
        margin: 0;
        font-size: 7.4pt;
        color: #475569;
        line-height: 1.35;
    }
    .doc-head .company .branch-name { margin: 2px 0 1px; color: #1e293b; font-weight: 650; }
    .doc-head .title-block, .title-block { text-align: right; min-width: 0; }
    .doc-head .title-block .badge, .title-block .badge {
        display: inline-block;
        background: #f1f5f9;
        color: #334155;
        border: 1px solid #d7dde6;
        font-size: 6.6pt;
        font-weight: 700;
        letter-spacing: .08em;
        padding: 2px 8px;
        border-radius: 999px;
        margin-bottom: 5px;
    }
    .doc-head .title-block h1, .title-block h1 {
        margin: 0;
        font-size: 15pt;
        line-height: 1.18;
        font-weight: 750;
        color: #0f172a;
    }
    .doc-head .title-block .note, .title-block .note {
        margin: 4px 0 0;
        font-size: 7.2pt;
        color: #475569;
        font-weight: 500;
    }
    .report-meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 10px;
        margin-top: 9px;
        padding-top: 8px;
        border-top: 1px solid #e2e8f0;
        text-align: left;
    }
    .report-meta .meta-item {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
        font-size: 7.1pt;
    }
    .report-meta .meta-label {
        color: #64748b;
        text-transform: uppercase;
        font-weight: 700;
        white-space: nowrap;
    }
    .report-meta .meta-value {
        color: #0f172a;
        font-weight: 650;
        text-align: right;
        word-break: break-word;
    }
    .meta-strip { gap: 4px 6px; margin: 0 0 9px; }
    .meta-strip .pill {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 7pt;
        color: #475569;
    }
    .meta-strip .pill b { color: #1e293b; font-weight: 700; }
    .kpi-strip {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 6px;
        margin-bottom: 10px;
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .kpi {
        min-height: 58px;
        border: 1px solid #d7dde6;
        border-radius: 8px;
        background: #fff;
        padding: 7px 8px;
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        column-gap: 7px;
        align-items: start;
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .k-icon {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        color: #475569;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 6.5pt;
        font-weight: 800;
        line-height: 1;
    }
    .k-content { min-width: 0; }
    .kpi .k-label { font-size: 6.6pt; color: #64748b; font-weight: 750; line-height: 1.2; }
    .kpi .k-value { font-size: 11.2pt; font-weight: 750; color: #0f172a; margin-top: 2px; white-space: nowrap; }
    .kpi .k-hint { font-size: 6.5pt; color: #64748b; margin-top: 1px; line-height: 1.2; }
    .section {
        margin-bottom: 10px;
        break-inside: avoid-page;
        page-break-inside: avoid;
    }
    .section > h3 {
        margin: 0;
        padding: 5px 8px;
        font-size: 8.7pt;
        font-weight: 750;
        color: #0f172a;
        background: #f8fafc;
        border: 1px solid #d7dde6;
        border-bottom: 0;
        border-radius: 7px 7px 0 0;
    }
    table {
        width: 100%;
        max-width: 100%;
        table-layout: fixed;
        border: 1px solid #d7dde6;
    }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    thead th {
        background: #eef2f7;
        color: #334155;
        font-weight: 750;
        font-size: 6.8pt;
        padding: 5px 6px;
        border: 1px solid #d7dde6;
        word-break: break-word;
    }
    tbody td {
        padding: 4.5px 6px;
        font-size: 7.3pt;
        border: 1px solid #e5eaf1;
        color: #1e293b;
        vertical-align: top;
        overflow-wrap: anywhere;
    }
    tbody td.num { text-align: right; white-space: normal; }
    tbody tr:nth-child(even) { background: #fafbfc; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    .wide-section table { font-size: 6.6pt; }
    .wide-section thead th,
    .wide-section tbody td,
    .wide-section tfoot td { padding-left: 4px; padding-right: 4px; font-size: 6.45pt; }
    tfoot td {
        padding: 5px 6px;
        font-size: 7.3pt;
        font-weight: 750;
        background: #f8fafc;
        border: 1px solid #d7dde6;
        color: #0f172a;
    }
    .doc-foot {
        margin-top: 12px;
        padding: 8px 0 0;
        border-top: 1px solid #d7dde6;
        display: grid;
        grid-template-columns: 1.3fr .9fr .8fr .8fr;
        gap: 8px;
        font-size: 6.8pt;
        color: #64748b;
    }
    .doc-foot b { color: #334155; font-weight: 750; }
    .confidential { text-align: right; text-transform: uppercase; letter-spacing: .08em; font-weight: 750; }
    .print-page-number::after { content: "Page " counter(page) " of " counter(pages); }
    @media print {
        body { width: auto; min-height: auto; }
        .page-pad { padding: 0; }
        .doc-head, .kpi, .section { break-inside: avoid; page-break-inside: avoid; }
        table { page-break-inside: auto; }
        thead { display: table-header-group; }
        tr, img { break-inside: avoid; page-break-inside: avoid; }
    }
    @media screen {
        body { box-shadow: 0 18px 60px rgba(15, 23, 42, .12); }
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
    const sectionClass = columns.length > 5 ? 'section wide-section' : 'section';
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

    return `<div class="${sectionClass}">${title ? `<h3>${escapeHtml(title)}</h3>` : ''}<table>${head}<tbody>${body}</tbody>${foot}</table></div>`;
};

const kpiInitials = (label = '') => {
    const words = String(label || '')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return 'R';
    return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
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
    const reportMeta = Array.isArray(viewModel.reportMeta) ? viewModel.reportMeta : [];
    const generatedBy = meta.user || viewModel.generatedBy || 'BillBull ERP';
    const logoHtml = companyProfile.showLogo !== false && companyProfile.logoUrl
        ? `<img class="company-logo" src="${escapeHtml(companyProfile.logoUrl)}" alt="${companyName} logo" />`
        : `<div class="company-logo-placeholder">${escapeHtml((companyProfile.companyName || companyProfile.name || 'B').trim().charAt(0) || 'B')}</div>`;
    const branchMeta = branchDisplay ? `<p class="branch-name">Branch: ${branchDisplay}</p>` : '';
    const contactParts = [];
    if (phone) contactParts.push(`Phone: ${phone}`);
    if (email) contactParts.push(`Email: ${email}`);
    const reportMetaHtml = reportMeta.length
        ? `<div class="report-meta">${reportMeta
            .filter((item) => item && item.label)
            .map((item) => {
                const value = item.value === null || item.value === undefined || item.value === '' ? '-' : item.value;
                return `<div class="meta-item"><span class="meta-label">${escapeHtml(item.label)}</span><span class="meta-value">${renderTextWithCurrencySymbols(normaliseReportMoney(value), companyProfile)}</span></div>`;
            })
            .join('')}</div>`
        : '';

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
                    `<div class="kpi"><div class="k-icon">${escapeHtml(k.icon || kpiInitials(k.label))}</div><div class="k-content"><div class="k-label">${escapeHtml(k.label)}</div><div class="k-value">${renderTextWithCurrencySymbols(normaliseReportMoney(k.value), companyProfile)}</div>${k.hint ? `<div class="k-hint">${escapeHtml(k.hint)}</div>` : ''}</div></div>`
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
            <div class="company-row">
                ${logoHtml}
                <div class="company">
                    <h2>${companyName}</h2>
                    ${branchMeta}
                    ${address ? `<p>${address}</p>` : ''}
                    ${contactParts.length ? `<p>${contactParts.join(' | ')}</p>` : ''}
                    ${trn ? `<p>TRN: ${trn}</p>` : ''}
                </div>
            </div>
            <div class="title-block">
                <span class="badge">OFFICIAL REPORT</span>
                <h1>${reportTitle}</h1>
                ${note ? `<p class="note">${note}</p>` : ''}
                ${reportMetaHtml}
            </div>
        </div>
    </div>

    <div class="meta-strip">${pills.join('')}</div>

    ${kpiHtml}

    ${sectionsHtml}

    ${(companyProfile.showStampInPrint !== false && companyProfile.stampUrl) ? `<div style="text-align:right;margin-top:20px;padding-right:24px;"><img src="${companyProfile.stampUrl}" style="height:60px;max-width:200px;object-fit:contain;display:inline-block;" /></div>` : ''}

    <div class="doc-foot">
        <span><b>Generated By</b><br />${escapeHtml(generatedBy)}</span>
        <span><b>Generated Time</b><br />${escapeHtml(generatedAt)}</span>
        <span><b>Page</b><br /><span class="print-page-number"></span></span>
        <span class="confidential">Confidential</span>
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

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(reportTitle)}</title><style>${ROBOTO_MONO_FONT_FACE}
@page{margin:0;size:${paper} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #444;margin:6px 0}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin:2px 0}
.row .lbl{flex:1;text-align:left;word-break:break-word;overflow-wrap:anywhere}
.row .val{flex:0 0 auto;text-align:right;white-space:nowrap}
.info-row{display:flex;justify-content:flex-start;align-items:flex-start;margin:2px 0;font-family:'Roboto Mono','Courier New',monospace;font-size:11px;line-height:1.4}
.info-row .info-lbl{flex:0 0 auto;width:${paper === '58mm' ? '78px' : '92px'};text-align:left;white-space:nowrap;overflow:hidden;font-weight:normal}
.info-row .info-col{flex:0 0 auto;width:12px;text-align:center;white-space:nowrap;font-weight:normal}
.info-row .info-val{flex:1 1 auto;text-align:left;white-space:normal;word-break:normal;overflow-wrap:break-word;min-width:0;padding-left:2px}
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
        const isSessionInfo = section.title && section.title.toLowerCase().includes('session information');
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

            if (isSessionInfo && cells.length === 2) {
                let mt = '2px';
                if (label === 'Session No.' || label === 'Branch' || label === 'Terminal' || label === 'Device Info' || label === 'Shift') {
                    mt = '8px';
                }
                html += `<div class="info-row" style="margin-top:${mt}"><span class="info-lbl">${esc(label)}</span><span class="info-col">:</span><span class="info-val">${esc(value)}</span></div>`;
            } else {
                html += `<div class="row"><span class="lbl">${esc(fullLabel)}</span><span class="val">${renderTextWithCurrencySymbols(normaliseReportMoney(value), companyProfile)}</span></div>`;
            }
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

// Plain-text counterpart to generateReportThermalHtml — same viewModel, rendered as
// raw lines for the local print agent's text path (no HTML/driver dialog involved).
export const generateReportThermalText = (viewModel = {}, companyProfile = {}, meta = {}) => {
    const paper = meta.paper === '58mm' ? '58mm' : '80mm';
    const width = THERMAL_WIDTHS[paper];
    const hr = '-'.repeat(width);

    const companyName = companyProfile.companyName || companyProfile.name || 'BillBull ERP';
    const branch = companyProfile.branchName || (meta.branch && meta.branch !== 'All' ? meta.branch : '');
    const trn = companyProfile.trn || '';
    const reportTitle = viewModel.reportTitle || meta.reportTitle || 'POS Report';
    const sections = Array.isArray(viewModel.sections) ? viewModel.sections : [];
    const kpis = Array.isArray(viewModel.kpis) ? viewModel.kpis : [];

    const lines = [];
    lines.push(centerThermal(companyName.toUpperCase(), width));
    if (branch) lines.push(centerThermal(branch, width));
    if (trn) lines.push(centerThermal(`TRN: ${trn}`, width));
    lines.push(hr);
    lines.push(centerThermal(reportTitle.toUpperCase(), width));
    lines.push(hr);

    if (viewModel.note) {
        String(viewModel.note).split('|').map(s => s.trim()).filter(Boolean)
            .forEach(part => lines.push(centerThermal(part, width)));
        lines.push(hr);
    }

    if (Array.isArray(meta.filters)) {
        meta.filters.forEach(f => {
            if (f && f.label) lines.push(padThermalRow(f.label, String(f.value ?? ''), width));
        });
        if (meta.filters.length) lines.push(hr);
    }

    if (kpis.length) {
        kpis.forEach(k => lines.push(padThermalRow(k.label, k.value, width)));
        lines.push(hr);
    }

    sections.forEach(section => {
        if (section.title) lines.push(section.title.toUpperCase().slice(0, width));
        const isSessionInfo = section.title && section.title.toLowerCase().includes('session information');
        const rows = Array.isArray(section.rows) ? section.rows : [];
        rows.forEach(row => {
            const cells = Array.isArray(row) ? row : [row];
            if (cells.length === 0) return;
            if (cells.length === 1) {
                lines.push(String(cells[0] ?? '').slice(0, width));
                return;
            }
            const label = cells[0];
            const value = cells[cells.length - 1];
            const middle = cells.slice(1, -1).filter(c => c !== '' && c != null);
            const fullLabel = middle.length ? `${label} (${middle.join('/')})` : label;
            if (isSessionInfo && cells.length === 2) {
                lines.push(`${String(label)}: ${String(value)}`.slice(0, width));
            } else {
                lines.push(padThermalRow(fullLabel, value, width));
            }
        });
        if (Array.isArray(section.footer) && section.footer.length) {
            const f = section.footer;
            const label = f[0];
            const value = f[f.length - 1];
            const middle = f.slice(1, -1).filter(c => c !== '' && c != null);
            const fullLabel = middle.length ? `${label} (${middle.join('/')})` : label;
            lines.push(hr);
            lines.push(padThermalRow(fullLabel, value, width));
        }
        lines.push(hr);
    });

    lines.push(centerThermal(`Generated ${new Date().toLocaleString()}`, width));
    if (meta.user) lines.push(centerThermal(`By: ${meta.user}`, width));
    lines.push(centerThermal('*** END OF REPORT ***', width));
    lines.push('');
    lines.push('');
    return lines.join('\n');
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

// opts.fast: for lightweight documents (POS thermal receipts — plain text plus at
// most a small logo/QR image) where we don't need the full worst-case safety
// margin that image-heavy A4 documents (invoices with logos/stamps) still get
// by default.
export const printHtml = (htmlContent, { fast = false } = {}) => {
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
            if (win) { win.document.write(htmlContent); win.document.close(); setTimeout(() => win.print(), fast ? 150 : 500); }
        }
        cleanup();
    };

    // Fire the moment every <img> in the frame has actually finished loading (or
    // errored) instead of blindly waiting out a fixed delay — a receipt with no
    // logo/QR resolves in ~0ms this way rather than paying the full worst-case
    // padding every single print, while an image-heavy document still waits for
    // its images for correctness.
    const waitForImagesThenPrint = () => {
        const frameDoc = iframe.contentWindow?.document;
        const imgs = frameDoc ? Array.from(frameDoc.images || []) : [];
        const pending = imgs.filter((img) => !img.complete);
        if (pending.length === 0) { runPrint(); return; }
        let remaining = pending.length;
        const settle = () => { if (--remaining <= 0) runPrint(); };
        pending.forEach((img) => {
            img.addEventListener('load', settle, { once: true });
            img.addEventListener('error', settle, { once: true });
        });
    };

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.onload = () => setTimeout(waitForImagesThenPrint, fast ? 20 : 350);
    setTimeout(runPrint, fast ? 350 : 900);
};
