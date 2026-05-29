import QRCode from 'qrcode';
import {
    generateDocumentEmailHtml,
    generateDocumentPrintHtml
} from './documentTemplateRenderer';
import { generateReportFilename } from './filenameUtils';
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

const AED_TOKEN_PATTERN = /(^|[^A-Za-z0-9_])AED(?=$|[^A-Za-z0-9_])/gi;
const AMOUNT_BEFORE_AED_PATTERN = /([+-]?\d[\d,]*(?:\.\d+)?)(\s+)AED(?=$|[^A-Za-z0-9_])/gi;

const renderCurrencySymbolHtml = (companyProfile = {}) => {
    const currencyConfig = resolveCurrencyDisplayConfig(companyProfile);
    if (currencyConfig.hasImage) {
        return `<img src="${UAE_DIRHAM_SYMBOL_IMAGE}" alt="${escapeHtml(currencyConfig.ariaLabel)}" style="height:0.82em;width:auto;display:inline-block;vertical-align:-0.08em;margin:0 0.12em;" />`;
    }

    return escapeHtml(currencyConfig.label);
};

const renderTextWithCurrencySymbols = (value, companyProfile = {}) => {
    const currencySymbolHtml = renderCurrencySymbolHtml(companyProfile);

    return (
        escapeHtml(value)
            .replace(AMOUNT_BEFORE_AED_PATTERN, `${currencySymbolHtml} $1`)
            .replace(AED_TOKEN_PATTERN, `$1${currencySymbolHtml}`)
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

export const generateReportPrintHtml = (_template, reportTitle, columns, data, companyProfile = {}) => {
    const generatedAt = new Date().toLocaleString();

    const pageStyles = `
        @page { size: A4 Landscape; margin: 20mm; }
        body {
            margin: 0;
            padding: 0;
            font-family: 'Helvetica Neue', Arial, sans-serif;
            color: #1e293b;
            font-size: 10pt;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 16px;
            margin-bottom: 24px;
        }
        .company-info h2 {
            margin: 0;
            font-size: 18px;
            color: #111827;
        }
        .company-info p {
            margin: 2px 0;
            font-size: 11px;
            color: #64748b;
        }
        .report-meta {
            text-align: right;
        }
        .report-meta h1 {
            margin: 0;
            font-size: 24px;
            color: #111827;
        }
        .report-meta p {
            margin: 4px 0 0;
            font-size: 11px;
            color: #64748b;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #f8fafc;
            text-align: left;
            padding: 10px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #475569;
            font-weight: 700;
            border: 1px solid #e2e8f0;
        }
        td {
            padding: 10px;
            font-size: 11px;
            border: 1px solid #e2e8f0;
            color: #334155;
        }
        .text-right {
            text-align: right;
        }
        .footer {
            margin-top: 28px;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
        }
    `;

    const headers = columns.map((column) => `<th>${renderTextWithCurrencySymbols(column.header, companyProfile)}</th>`).join('');
    const rows = data.map((row) => `
        <tr>
            ${columns.map((column) => {
        const value = row[column.key];
        const isNumeric = typeof value === 'number';
        return `<td class="${isNumeric ? 'text-right' : ''}">${value !== null && value !== undefined ? renderTextWithCurrencySymbols(value, companyProfile) : '-'}</td>`;
    }).join('')}
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <title>${escapeHtml(generateReportFilename(reportTitle))}</title>
            <style>${pageStyles}</style>
        </head>
        <body>
            <div class="header">
                <div class="company-info">
                    <h2>${escapeHtml(companyProfile.companyName || '')}</h2>
                    <p>${escapeHtml(companyProfile.address || '')}</p>
                    <p>Email: ${escapeHtml(companyProfile.email || '')} | Phone: ${escapeHtml(companyProfile.phone || '')}</p>
                    <p>TRN: ${escapeHtml(companyProfile.trn || '')}</p>
                </div>
                <div class="report-meta">
                    <h1>${escapeHtml(reportTitle)}</h1>
                    <p>Generated on: ${escapeHtml(generatedAt)}</p>
                    <p>Total Records: ${data.length}</p>
                </div>
            </div>

            <table>
                <thead>
                    <tr>${headers}</tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div class="footer">
                Generated by BillBull ERP
            </div>
        </body>
        </html>
    `;
};

export const printHtml = (htmlContent) => {
    const printWindow = window.open('', '_blank', 'width=960,height=760');
    if (!printWindow) {
        toast.error('Pop-up blocked! Please allow pop-ups for this site.');
        return;
    }

    let hasPrinted = false;
    const printDate = new Date().toISOString().slice(0, 10);
    const runPrint = () => {
        if (hasPrinted || printWindow.closed) return;
        hasPrinted = true;
        printWindow.focus();
        printWindow.print();
    };

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Ensure the title is set for the Save as PDF filename
    const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        printWindow.document.title = titleMatch[1];
    }

    try {
        printWindow.history.replaceState(null, '', `/print/${printDate}`);
    } catch {
        // Browser print helpers may block history changes in some contexts.
    }

    printWindow.onload = () => {
        setTimeout(runPrint, 300);
    };

    setTimeout(() => {
        runPrint();
    }, 900);
};
