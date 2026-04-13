/**
 * Utility to generate HTML for printing documents based on templates.
 * Company details are now dynamic — passed via options.companyProfile
 * which is loaded from the backend CompanyProfile API (per-client DB row).
 *
 * No hardcoded company data lives in this file.
 */

// ---------------------------------------------------------------------------
// Helper: replace {placeholders} inside custom headerContent / footerContent
// stored in the print_templates table with live company values.
// ---------------------------------------------------------------------------
const resolveCompanyVars = (html, company, logoUrl) => {
    if (!html) return '';
    return html
        .replace(/{company_name}/g,    company.companyName    || '')
        .replace(/{company_address}/g, company.address        || '')
        .replace(/{company_phone}/g,   company.phone          || '')
        .replace(/{company_email}/g,   company.email          || '')
        .replace(/{company_trn}/g,     company.trn            || '')
        .replace(/{company_logo}/g,
            logoUrl
                ? `<img src="${logoUrl}" style="height:60px; width:auto;" />`
                : ''
        )
        // Legacy placeholder used by older templates
        .replace(/{logo}/g,
            logoUrl
                ? `<img src="${logoUrl}" style="height:60px; width:auto;" />`
                : ''
        );
};

// ---------------------------------------------------------------------------
// Main document print generator (Quotation, Invoice, Delivery Note, etc.)
// ---------------------------------------------------------------------------

/**
 * Generates the HTML string for a print document.
 *
 * @param {Object} template       - PrintTemplate object from DB.
 * @param {Object} data           - Document data (quotation, invoice, etc.).
 * @param {Object} options
 * @param {Object} options.companyProfile - Company profile from CompanyContext.
 *                                          Fields: companyName, address, phone,
 *                                          email, trn, logoUrl, currency, etc.
 * @param {string} [options.billBullLogo] - URL for the "Powered by BillBull" logo.
 * @returns {string} Full HTML string ready for printHtml().
 */
export const generatePrintHtml = (template, data, options = {}) => {
    const {
        paperSize = 'A4',
        orientation = 'Portrait',
        headerContent,
        footerContent,
        termsContent,
        displayOptions: displayOptionsRaw,
        columns: columnsRaw
    } = template;

    const displayOptions = typeof displayOptionsRaw === 'string'
        ? JSON.parse(displayOptionsRaw)
        : (displayOptionsRaw || {});

    const columns = typeof columnsRaw === 'string'
        ? JSON.parse(columnsRaw)
        : (columnsRaw || {});

    const {
        title    = 'DOCUMENT',
        docNo    = '',
        date     = '',
        customer = {},
        items    = [],
        totals   = {},
        meta     = {}
    } = data;

    const { billBullLogo, companyProfile = {} } = options;
    const logoUrl = companyProfile.logoUrl || null;

    // --- CSS ---
    const pageStyles = `
        @page { size: ${paperSize} ${orientation}; margin: 12mm 14mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; background: #fff; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page-container { width: 100%; }
        .footer { margin-top: 24px; }
        .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; color: rgba(0,0,0,0.05); white-space: nowrap; pointer-events: none; z-index: -1; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { text-align: left; padding: 4px 5px; font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; border-bottom: 2px solid #e2e8f0; white-space: nowrap; overflow: hidden; }
        td { padding: 4px 5px; font-size: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; overflow-wrap: break-word; word-break: normal; }
        tr { page-break-inside: avoid; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .text-sm { font-size: 12px; }
        .text-xs { font-size: 10px; }
        .text-slate-500 { color: #64748b; }
        .bg-slate-50 { background-color: #f8fafc; }
        .border-t { border-top: 1px solid #e2e8f0; }
    `;

    // --- HEADER ---
    let headerHtml = '';
    if (headerContent && headerContent.trim() !== '') {
        // Custom HTML header from template — replace placeholders
        headerHtml = resolveCompanyVars(headerContent, companyProfile, logoUrl);
    } else {
        // Default header
        headerHtml = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${displayOptions.showLogo && logoUrl
                        ? `<img src="${logoUrl}" alt="Logo" style="height: 52px; width: auto; object-fit: contain;" />`
                        : ''}
                    ${displayOptions.showCompanyDetails !== false ? `
                        <div>
                            <h2 style="font-size: 15px; font-weight: 700; color: #1e293b; margin: 0; line-height: 1.2;">${companyProfile.companyName || ''}</h2>
                            <p style="font-size: 9px; color: #6b7280; margin: 3px 0 0 0;">${companyProfile.address || ''}</p>
                            <p style="font-size: 9px; color: #6b7280; margin: 2px 0 0 0;">Email: ${companyProfile.email || ''} | Phone: ${companyProfile.phone || ''}</p>
                            <p style="font-size: 9px; color: #6b7280; margin: 2px 0 0 0;">TRN: ${companyProfile.trn || ''}</p>
                        </div>
                    ` : ''}
                </div>
                <div style="text-align: right;">
                    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0;">${title}</h1>
                    <p style="font-size: 11px; color: #6b7280; margin: 3px 0 0 0;">Date: ${date}</p>
                    <p style="font-size: 11px; color: #6b7280; margin: 2px 0 0 0;">Ref: ${docNo}</p>
                    ${meta.validTill ? `<p style="font-size: 11px; color: #6b7280; margin: 2px 0 0 0;">Valid Till: ${meta.validTill}</p>` : ''}
                </div>
            </div>
        `;
    }

    // --- CUSTOMER INFO ---
    const infoSection = `
        <div style="margin-bottom: 14px;">
            ${displayOptions.showCustomerDetails ? `
                <h3 style="font-size: 12px; font-weight: 700; color: #1e293b; margin: 0 0 3px 0;">Bill To:</h3>
                <div style="font-size: 11px; color: #4b5563;">
                    <p style="font-weight: 600; margin: 0;">${customer.name || 'Unknown Customer'}</p>
                    ${customer.address ? `<p style="margin: 1px 0 0 0;">${customer.address}</p>` : ''}
                    ${customer.trn     ? `<p style="margin: 1px 0 0 0;">TRN: ${customer.trn}</p>` : ''}
                    ${customer.phone   ? `<p style="margin: 1px 0 0 0;">Phone: ${customer.phone}</p>` : ''}
                </div>
            ` : ''}
            ${meta.paymentTerm ? `<p style="font-size: 11px; color: #6b7280; margin: 6px 0 0 0;">Payment Terms: <span style="font-weight: 600;">${meta.paymentTerm}</span></p>` : ''}
        </div>
    `;

    // --- ITEMS TABLE ---
    const tableHeader = `
        <thead>
            <tr>
                <th style="width: 22px;">#</th>
                ${columns.productId  ? `<th style="width: 50px;">Prod ID</th>`                         : ''}
                ${columns.sku        ? `<th style="width: 65px;">SKU</th>`                             : ''}
                ${columns.arabicName ? `<th style="width: 90px; direction: rtl;">Arabic Name</th>`    : ''}
                ${columns.item       ? `<th>Item</th>`                                                 : ''}
                ${columns.description? `<th>Description</th>`                                         : ''}
                ${columns.qty        ? `<th class="text-center" style="width: 42px;">Qty</th>`        : ''}
                ${columns.unitPrice  ? `<th class="text-right"  style="width: 70px;">Price</th>`      : ''}
                ${columns.discount   ? `<th class="text-center" style="width: 50px;">Disc%</th>`      : ''}
                ${columns.tax        ? `<th class="text-right"  style="width: 55px;">Tax</th>`        : ''}
                ${columns.total      ? `<th class="text-right"  style="width: 75px;">Total</th>`      : ''}
            </tr>
        </thead>
    `;

    const tableRows = items.map((item, index) => `
        <tr>
            <td style="color: #94a3b8;">${index + 1}</td>
            ${columns.productId   ? `<td style="font-family: monospace; font-size: 9px; color: #64748b; white-space: nowrap;">${item.code || '-'}</td>` : ''}
            ${columns.sku         ? `<td style="font-family: monospace; font-size: 9px; color: #64748b; overflow-wrap: break-word;">${item.sku || '-'}</td>` : ''}
            ${columns.arabicName  ? `<td style="font-size: 10px; color: #1e293b; direction: rtl; text-align: right;">${item.localName || '-'}</td>` : ''}
            ${columns.item        ? `<td>
                ${(displayOptions.showItemImage && item.image) ? `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <img src="${item.image}" style="width: 28px; height: 28px; object-fit: cover; border-radius: 3px; flex-shrink: 0;" />
                    <span style="font-size: 10px; font-weight: 600; color: #1e293b;">${item.name || '-'}</span>
                </div>
                ` : `<span style="font-size: 10px; font-weight: 600; color: #1e293b;">${item.name || '-'}</span>`}
            </td>` : ''}
            ${columns.description ? `<td style="font-size: 10px; color: #374151;">
                ${(displayOptions.showItemImage && item.image) ? `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <img src="${item.image}" style="width: 28px; height: 28px; object-fit: cover; border-radius: 3px; flex-shrink: 0;" />
                    <span>${item.desc || '-'}</span>
                </div>
                ` : `<span>${item.desc || '-'}</span>`}
            </td>` : ''}
            ${columns.qty       ? `<td class="text-center" style="font-weight: 700; font-size: 10px; white-space: nowrap;">${item.qty} ${item.unit || ''}</td>` : ''}
            ${columns.unitPrice ? `<td class="text-right"  style="font-size: 10px; white-space: nowrap;">${Number(item.price).toFixed(2)}</td>` : ''}
            ${columns.discount  ? `<td class="text-center" style="font-size: 10px; color: #ef4444; white-space: nowrap;">${item.disc > 0 ? item.disc + '%' : '-'}</td>` : ''}
            ${columns.tax       ? `<td class="text-right"  style="font-size: 10px; color: #64748b; white-space: nowrap;">${Number(item.taxAmt || 0).toFixed(2)}</td>` : ''}
            ${columns.total     ? `<td class="text-right"  style="font-weight: 700; font-size: 10px; white-space: nowrap;">${Number(item.total).toFixed(2)}</td>` : ''}
        </tr>
    `).join('');

    const itemsTable = `
        <table style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            ${tableHeader}
            <tbody>
                ${items.length > 0 ? tableRows : '<tr><td colspan="10" class="text-center p-4 text-slate-400">No items found</td></tr>'}
            </tbody>
        </table>
    `;

    // --- TOTALS ---
    let totalsSection = '';
    if (columns.total) {
        totalsSection = `
        <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
            <table style="width: 260px; border-collapse: collapse;">
                <tr>
                    <td style="padding: 4px 0; font-size: 11px; color: #64748b; border: none;">Sub Total</td>
                    <td style="padding: 4px 0; font-size: 11px; text-align: right; font-weight: 600; border: none;">${totals.currency} ${Number(totals.subTotal || 0).toFixed(2)}</td>
                </tr>
                ${totals.billDiscount > 0 ? `
                <tr>
                    <td style="padding: 4px 0; font-size: 11px; color: #ef4444; border: none;">Discount (${totals.billDiscount}%)</td>
                    <td style="padding: 4px 0; font-size: 11px; text-align: right; font-weight: 600; color: #ef4444; border: none;">- ${totals.currency} ${Number(totals.billDiscountAmount || 0).toFixed(2)}</td>
                </tr>` : ''}
                <tr>
                    <td style="padding: 4px 0; font-size: 11px; color: #64748b; border: none;">Tax (VAT)</td>
                    <td style="padding: 4px 0; font-size: 11px; text-align: right; font-weight: 600; border: none;">${totals.currency} ${Number(totals.tax || 0).toFixed(2)}</td>
                </tr>
                <tr style="border-top: 2px solid #e2e8f0;">
                    <td style="padding: 8px 0 0 0; font-size: 13px; font-weight: 800; color: #0f172a; border: none;">Grand Total</td>
                    <td style="padding: 8px 0 0 0; text-align: right; font-size: 14px; font-weight: 800; color: #0f172a; border: none;">${totals.currency} ${Number(totals.grandTotal || 0).toFixed(2)}</td>
                </tr>
            </table>
        </div>
        `;
    }

    // --- NOTES & TERMS ---
    let extraContent = '';
    if (meta.notes) {
        extraContent += `
            <div style="margin-top: 14px; background: #f8fafc; padding: 10px 12px; border-radius: 4px; border: 1px solid #f1f5f9;">
                <h4 style="font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin: 0 0 4px 0;">Notes</h4>
                <p style="font-size: 11px; color: #475569; margin: 0; line-height: 1.4;">${meta.notes}</p>
            </div>
        `;
    }
    if (displayOptions.showTerms && termsContent) {
        extraContent += `
            <div style="margin-top: 12px;">
                <h4 style="font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin: 0 0 4px 0;">Terms & Conditions</h4>
                <div style="font-size: 10px; color: #64748b; line-height: 1.4; white-space: pre-wrap;">${termsContent}</div>
            </div>
        `;
    }

    // --- FOOTER ---
    let footerHtml = '';
    if (footerContent && footerContent.trim() !== '') {
        footerHtml = resolveCompanyVars(footerContent, companyProfile, logoUrl);
    } else {
        footerHtml = `
            <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; color: #94a3b8; font-size: 10px;">
                <p style="margin: 0 0 2px 0;">Thank you for your business!</p>
                <p style="margin: 0;">${companyProfile.companyName || ''} | ${companyProfile.email || ''} | ${companyProfile.phone || ''}</p>
                ${billBullLogo ? `<div style="margin-top: 6px; opacity: 0.5;"><img src="${billBullLogo}" style="height: 16px;" alt="Powered by BillBull" /></div>` : ''}
            </div>
        `;
    }

    // --- ASSEMBLE ---
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${title} - ${docNo}</title>
            <style>${pageStyles}</style>
        </head>
        <body>
            <div class="page-container">
                ${headerHtml}
                ${infoSection}
                ${itemsTable}
                ${totalsSection}
                ${extraContent}
                <div class="footer">${footerHtml}</div>
                ${meta.status === 'Draft' || meta.status === 'Cancelled'
                    ? `<div class="watermark">${meta.status.toUpperCase()}</div>`
                    : ''}
            </div>
        </body>
        </html>
    `;
};

// ---------------------------------------------------------------------------
// Report print generator (Low Stock, Out of Stock, Stock on Hand, etc.)
// ---------------------------------------------------------------------------

/**
 * Generates HTML for a generic report table.
 *
 * @param {Object}   template       - PrintTemplate (or empty object for fallback).
 * @param {string}   reportTitle    - Title shown on the report header.
 * @param {Array}    columns        - [{ header, key }]
 * @param {Array}    data           - Array of row objects.
 * @param {Object}   [companyProfile={}] - Company profile from CompanyContext.
 *                                         Backward-compatible: existing callers
 *                                         that omit this param get empty strings.
 */
export const generateReportPrintHtml = (_template, reportTitle, columns, data, companyProfile = {}) => {

    const date = new Date().toLocaleString();

    const pageStyles = `
        @page { size: A4 Landscape; margin: 20mm; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; line-height: 1.5; margin: 0; padding: 0; }
        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; }
        .company-info h2 { margin: 0; font-size: 18px; color: #111827; }
        .company-info p  { margin: 2px 0; font-size: 11px; color: #64748b; }
        .report-title { text-align: right; }
        .report-title h1 { margin: 0; font-size: 22px; color: #111827; }
        .report-title p  { margin: 4px 0 0; font-size: 12px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f8fafc; text-align: left; padding: 10px; font-size: 10px; text-transform: uppercase; color: #475569; font-weight: 700; border: 1px solid #e2e8f0; }
        td { padding: 10px; font-size: 11px; border: 1px solid #e2e8f0; color: #334155; }
        .text-right  { text-align: right; }
        .text-center { text-align: center; }
        .font-bold   { font-weight: 700; }
        .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; font-size: 10px; color: #94a3b8; }
    `;

    const headers = columns.map(col => `<th>${col.header}</th>`).join('');
    const rows = data.map(item => `
        <tr>
            ${columns.map(col => {
                const val = item[col.key];
                const isNum = typeof val === 'number';
                return `<td class="${isNum ? 'text-right' : ''}">${val !== null && val !== undefined ? val : '-'}</td>`;
            }).join('')}
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${reportTitle}</title>
            <style>${pageStyles}</style>
        </head>
        <body>
            <div class="header">
                <div class="company-info">
                    <h2>${companyProfile.companyName || ''}</h2>
                    <p>${companyProfile.address || ''}</p>
                    <p>Email: ${companyProfile.email || ''} | Phone: ${companyProfile.phone || ''}</p>
                    <p>TRN: ${companyProfile.trn || ''}</p>
                </div>
                <div class="report-title">
                    <h1>${reportTitle}</h1>
                    <p>Generated on: ${date}</p>
                    <p>Total Records: ${data.length}</p>
                </div>
            </div>

            <table>
                <thead><tr>${headers}</tr></thead>
                <tbody>${rows}</tbody>
            </table>

            <div class="footer">
                <p>Generated by BillBull ERP</p>
                <p>&copy; ${new Date().getFullYear()} ${companyProfile.companyName || 'BillBull'}. All rights reserved.</p>
            </div>
        </body>
        </html>
    `;
};

// ---------------------------------------------------------------------------
// Print helper — opens a new window and triggers the browser print dialog.
// ---------------------------------------------------------------------------

/**
 * Opens a print window with the generated HTML.
 * @param {string} htmlContent - Full HTML string to print.
 */
export const printHtml = (htmlContent) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 500);
    } else {
        alert('Pop-up blocked! Please allow pop-ups for this site.');
    }
};
