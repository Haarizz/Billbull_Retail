import QRCode from 'qrcode';
import {
    generateDocumentEmailHtml,
    generateDocumentPrintHtml
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
            font-weight: 800;
            color: #1a1200;
            letter-spacing: 0.04em;
        }
        .header-bar .badge {
            background: rgba(255,255,255,0.35);
            color: #1a1200;
            font-size: 9px;
            font-weight: 700;
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
            font-weight: 700;
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
            font-weight: 700;
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
            font-weight: 700;
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
            font-weight: 700;
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

// Renders the generated HTML to a real PDF file and downloads it directly —
// no print dialog, no new tab. Uses a hidden iframe for layout fidelity, then
// html2canvas to rasterise each A4 page, assembled by jsPDF.
export const downloadPdf = async (htmlContent, filename = 'document') => {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
    ]);

    const A4_W_MM = 210;
    const A4_H_MM = 297;

    // Render in a hidden off-screen iframe so all inline styles and @font-face
    // rules apply correctly (can't do this with a plain div).
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
        'position:fixed;left:-9999px;top:0;width:794px;height:1123px;' +
        'border:none;visibility:hidden;background:#fff;';
    document.body.appendChild(iframe);

    try {
        await new Promise((resolve, reject) => {
            iframe.onload = resolve;
            iframe.onerror = reject;
            iframe.srcdoc = htmlContent;
        });

        // Allow fonts / images to finish loading
        await new Promise(r => setTimeout(r, 1200));

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const totalH = iframeDoc.documentElement.scrollHeight;
        iframe.style.height = `${totalH}px`;

        // Re-allow layout to settle at the new height
        await new Promise(r => setTimeout(r, 200));

        const fullCanvas = await html2canvas(iframeDoc.body, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: 794,
            height: totalH,
            windowWidth: 794,
            logging: false,
        });

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const canvasW = fullCanvas.width;
        // How many canvas pixels equal one A4 page in height?
        const a4PagePx = Math.round(canvasW * (A4_H_MM / A4_W_MM));
        const totalPages = Math.ceil(fullCanvas.height / a4PagePx);

        for (let page = 0; page < totalPages; page++) {
            if (page > 0) pdf.addPage();

            const srcY = page * a4PagePx;
            const srcH = Math.min(a4PagePx, fullCanvas.height - srcY);

            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvasW;
            pageCanvas.height = a4PagePx;
            const ctx = pageCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvasW, a4PagePx);
            ctx.drawImage(fullCanvas, 0, srcY, canvasW, srcH, 0, 0, canvasW, srcH);

            pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4_W_MM, A4_H_MM);
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
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:none;pointer-events:none;';
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

    iframe.onload = () => setTimeout(runPrint, 250);
    setTimeout(runPrint, 800);
};
