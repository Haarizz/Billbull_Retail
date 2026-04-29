import {
    generateDocumentEmailHtml,
    generateDocumentPrintHtml
} from './documentTemplateRenderer';
import { generateReportFilename } from './filenameUtils';
import { UAE_DIRHAM_SYMBOL_IMAGE } from './countryCurrencyOptions';

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const AED_TOKEN_PATTERN = /(^|[^A-Za-z0-9_])AED(?=$|[^A-Za-z0-9_])/gi;
const AMOUNT_BEFORE_AED_PATTERN = /([+-]?\d[\d,]*(?:\.\d+)?)(\s+)AED(?=$|[^A-Za-z0-9_])/gi;
const AED_SYMBOL_HTML = `<img src="${UAE_DIRHAM_SYMBOL_IMAGE}" alt="AED" style="height:0.82em;width:auto;display:inline-block;vertical-align:-0.08em;margin:0 0.12em;" />`;

const renderTextWithCurrencySymbols = (value) =>
    escapeHtml(value)
        .replace(AMOUNT_BEFORE_AED_PATTERN, `${AED_SYMBOL_HTML} $1`)
        .replace(AED_TOKEN_PATTERN, `$1${AED_SYMBOL_HTML}`);

export const generatePrintHtml = (template, data, options = {}) =>
    generateDocumentPrintHtml(template, data, options);

export const generateEmailHtml = (template, data, options = {}) =>
    generateDocumentEmailHtml(template, data, options);

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

    const headers = columns.map((column) => `<th>${renderTextWithCurrencySymbols(column.header)}</th>`).join('');
    const rows = data.map((row) => `
        <tr>
            ${columns.map((column) => {
                const value = row[column.key];
                const isNumeric = typeof value === 'number';
                return `<td class="${isNumeric ? 'text-right' : ''}">${value !== null && value !== undefined ? renderTextWithCurrencySymbols(value) : '-'}</td>`;
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
        alert('Pop-up blocked! Please allow pop-ups for this site.');
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
