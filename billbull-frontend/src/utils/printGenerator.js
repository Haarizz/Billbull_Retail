/**
 * Utility to generate HTML for printing documents based on templates.
 * Company details are passed via options.companyProfile from CompanyContext.
 */

const parseObject = (value) => {
    if (!value) return {};
    if (typeof value === "object") return value;
    if (typeof value !== "string") return {};
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

const asText = (value) => (value === null || value === undefined ? "" : String(value));

const escapeHtml = (value) =>
    asText(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

// ---------------------------------------------------------------------------
// Helper: replace {placeholders} inside custom headerContent / footerContent
// stored in the print_templates table with live company values.
// ---------------------------------------------------------------------------
const resolveCompanyVars = (html, company, logoUrl) => {
    if (!html) return "";

    const pageNumberMarkup = '<span class="page-counter-number"></span>';
    const totalPagesMarkup = '<span class="page-counter-total"></span>';

    return html
        .replace(/{company_name}/g, company.companyName || "")
        .replace(/{company_address}/g, company.address || "")
        .replace(/{company_phone}/g, company.phone || "")
        .replace(/{company_email}/g, company.email || "")
        .replace(/{company_trn}/g, company.trn || "")
        .replace(/{page_number}/g, pageNumberMarkup)
        .replace(/{total_pages}/g, totalPagesMarkup)
        .replace(
            /{company_logo}/g,
            logoUrl
                ? `<img src="${logoUrl}" style="height:60px; width:auto;" alt="Company Logo" />`
                : ""
        )
        .replace(
            /{logo}/g,
            logoUrl
                ? `<img src="${logoUrl}" style="height:60px; width:auto;" alt="Company Logo" />`
                : ""
        );
};

const formatCurrency = (currency, value) => `${currency} ${asNumber(value).toFixed(2)}`;

const PURCHASE_TEMPLATE_CATEGORIES = new Set([
    "Local Purchase Order",
    "Goods Receipt Note",
    "Purchase Invoice",
    "Payment Voucher",
]);

const looksLikePurchasePayload = (data) =>
    data &&
    typeof data === "object" &&
    (
        data.party ||
        Array.isArray(data.headerMeta) ||
        Array.isArray(data.references) ||
        Array.isArray(data.paymentDetails)
    );

const buildDetailSection = (title, rows = []) => {
    const content = rows
        .filter((row) => row?.label && row?.value)
        .map((row) => `${row.label}: ${row.value}`)
        .join("\n");

    return content ? `${title}\n${content}` : "";
};

const mapPurchaseDataToGenericData = (template, data) => {
    if (!looksLikePurchasePayload(data)) {
        return data;
    }

    const headerMeta = Array.isArray(data.headerMeta) ? data.headerMeta.filter((row) => row?.value) : [];
    const references = Array.isArray(data.references) ? data.references.filter((row) => row?.value) : [];
    const paymentDetails = Array.isArray(data.paymentDetails) ? data.paymentDetails.filter((row) => row?.value) : [];
    const totals = data.totals || {};
    const party = data.party || {};

    const secondaryDateRow = headerMeta.find((row) => /due date|expected delivery|valid/i.test(asText(row?.label)));
    const paymentTermRow = headerMeta.find((row) => /payment term/i.test(asText(row?.label)));

    const remainingHeaderMeta = headerMeta.filter((row) =>
        row !== secondaryDateRow &&
        row !== paymentTermRow &&
        !/status|voucher no/i.test(asText(row?.label))
    );

    const notes = [
        buildDetailSection("Document Details", remainingHeaderMeta),
        buildDetailSection("References", references),
        buildDetailSection("Payment Details", paymentDetails),
        asText(data.notes),
    ].filter(Boolean).join("\n\n");

    const mappedItems = Array.isArray(data.items) && data.items.length > 0
        ? data.items.map((item) => ({
            code: item.code,
            sku: item.sku,
            localName: item.localName,
            name: item.name || item.description?.title || data.title || "Document Line",
            desc: item.desc
                || item.description?.details?.join(" | ")
                || item.description?.title
                || "",
            image: item.image,
            unit: item.unit,
            qty: item.qty,
            price: item.price,
            disc: item.disc ?? item.discount ?? 0,
            taxAmt: item.taxAmt ?? item.tax ?? 0,
            total: item.total ?? item.lineAmount ?? item.taxableAmount ?? item.price ?? 0,
        }))
        : [{
            code: "PAYMENT",
            name: data.title || "Payment",
            desc: paymentDetails.map((row) => `${row.label}: ${row.value}`).join(" | ") || notes || "Voucher summary",
            unit: "",
            qty: 1,
            price: data.summaryAmount?.value ?? totals.grandTotal ?? 0,
            disc: 0,
            taxAmt: 0,
            total: data.summaryAmount?.value ?? totals.grandTotal ?? 0,
        }];

    return {
        title: data.title || "PURCHASE DOCUMENT",
        docNo: data.docNo || "",
        date: data.date || "",
        customer: {
            name: party.name || "Unknown Vendor",
            address: [party.address, party.email].filter(Boolean).join(" | "),
            trn: party.taxId || "",
            phone: party.phone || "",
        },
        items: mappedItems,
        totals: {
            subTotal: totals.subTotal,
            tax: totals.tax,
            grandTotal: totals.grandTotal ?? data.summaryAmount?.value ?? 0,
            currency: totals.currency ?? data.summaryAmount?.currency ?? "",
            billDiscount: totals.billDiscount ?? 0,
            billDiscountAmount: totals.billDiscountAmount ?? totals.discountAmount ?? 0,
        },
        meta: {
            status: data.status || "",
            paymentTerm: paymentTermRow?.value || "",
            validTill: secondaryDateRow?.value || "",
            validTillLabel: secondaryDateRow?.label || "Valid Till",
            partyLabel: template?.category === "Payment Voucher" ? "Paid To:" : "Vendor Details:",
            notes,
        },
    };
};

const generateGenericDocumentHtml = (template, data, options = {}) => {
    const {
        paperSize = "A4",
        orientation = "Portrait",
        headerContent,
        footerContent,
        termsContent,
        displayOptions: displayOptionsRaw,
        columns: columnsRaw,
    } = template;

    const displayOptions = parseObject(displayOptionsRaw);
    const columns = parseObject(columnsRaw);

    const {
        title = "DOCUMENT",
        docNo = "",
        date = "",
        customer = {},
        items = [],
        totals = {},
        meta = {},
    } = data;

    const { billBullLogo, companyProfile = {} } = options;
    const logoUrl = companyProfile.logoUrl || null;

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
    `;

    let headerHtml = "";
    if (headerContent && headerContent.trim() !== "") {
        headerHtml = resolveCompanyVars(headerContent, companyProfile, logoUrl);
    } else {
        headerHtml = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${displayOptions.showLogo && logoUrl
                        ? `<img src="${logoUrl}" alt="Logo" style="height: 52px; width: auto; object-fit: contain;" />`
                        : ""}
                    ${displayOptions.showCompanyDetails !== false ? `
                        <div>
                            <h2 style="font-size: 15px; font-weight: 700; color: #1e293b; margin: 0; line-height: 1.2;">${companyProfile.companyName || ""}</h2>
                            <p style="font-size: 9px; color: #6b7280; margin: 3px 0 0 0;">${companyProfile.address || ""}</p>
                            <p style="font-size: 9px; color: #6b7280; margin: 2px 0 0 0;">Email: ${companyProfile.email || ""} | Phone: ${companyProfile.phone || ""}</p>
                            <p style="font-size: 9px; color: #6b7280; margin: 2px 0 0 0;">TRN: ${companyProfile.trn || ""}</p>
                        </div>
                    ` : ""}
                </div>
                <div style="text-align: right;">
                    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0;">${title}</h1>
                    <p style="font-size: 11px; color: #6b7280; margin: 3px 0 0 0;">Date: ${date}</p>
                    <p style="font-size: 11px; color: #6b7280; margin: 2px 0 0 0;">Ref: ${docNo}</p>
                    ${meta.validTill ? `<p style="font-size: 11px; color: #6b7280; margin: 2px 0 0 0;">${escapeHtml(meta.validTillLabel || "Valid Till")}: ${escapeHtml(meta.validTill)}</p>` : ""}
                </div>
            </div>
        `;
    }

    const infoSection = `
        <div style="margin-bottom: 14px;">
            ${displayOptions.showCustomerDetails ? `
                <h3 style="font-size: 12px; font-weight: 700; color: #1e293b; margin: 0 0 3px 0;">${escapeHtml(meta.partyLabel || "Bill To:")}</h3>
                <div style="font-size: 11px; color: #4b5563;">
                    <p style="font-weight: 600; margin: 0;">${customer.name || "Unknown Customer"}</p>
                    ${customer.address ? `<p style="margin: 1px 0 0 0;">${customer.address}</p>` : ""}
                    ${customer.trn ? `<p style="margin: 1px 0 0 0;">TRN: ${customer.trn}</p>` : ""}
                    ${customer.phone ? `<p style="margin: 1px 0 0 0;">Phone: ${customer.phone}</p>` : ""}
                </div>
            ` : ""}
            ${meta.paymentTerm ? `<p style="font-size: 11px; color: #6b7280; margin: 6px 0 0 0;">Payment Terms: <span style="font-weight: 600;">${meta.paymentTerm}</span></p>` : ""}
        </div>
    `;

    const tableHeader = `
        <thead>
            <tr>
                <th style="width: 22px;">#</th>
                ${columns.productId ? `<th style="width: 50px;">Prod ID</th>` : ""}
                ${columns.sku ? `<th style="width: 65px;">SKU</th>` : ""}
                ${columns.arabicName ? `<th style="width: 90px; direction: rtl;">Arabic Name</th>` : ""}
                ${columns.item ? `<th>Item</th>` : ""}
                ${columns.description ? `<th>Description</th>` : ""}
                ${columns.qty ? `<th class="text-center" style="width: 42px;">Qty</th>` : ""}
                ${columns.unitPrice ? `<th class="text-right" style="width: 70px;">Price</th>` : ""}
                ${columns.discount ? `<th class="text-center" style="width: 50px;">Disc%</th>` : ""}
                ${columns.tax ? `<th class="text-right" style="width: 55px;">Tax</th>` : ""}
                ${columns.total ? `<th class="text-right" style="width: 75px;">Total</th>` : ""}
            </tr>
        </thead>
    `;

    const tableRows = items.map((item, index) => `
        <tr>
            <td style="color: #94a3b8;">${index + 1}</td>
            ${columns.productId ? `<td style="font-family: monospace; font-size: 9px; color: #64748b; white-space: nowrap;">${item.code || "-"}</td>` : ""}
            ${columns.sku ? `<td style="font-family: monospace; font-size: 9px; color: #64748b; overflow-wrap: break-word;">${item.sku || "-"}</td>` : ""}
            ${columns.arabicName ? `<td style="font-size: 10px; color: #1e293b; direction: rtl; text-align: right;">${item.localName || "-"}</td>` : ""}
            ${columns.item ? `<td>
                ${(displayOptions.showItemImage && item.image) ? `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <img src="${item.image}" style="width: 28px; height: 28px; object-fit: cover; border-radius: 3px; flex-shrink: 0;" alt="Item" />
                    <span style="font-size: 10px; font-weight: 600; color: #1e293b;">${item.name || "-"}</span>
                </div>
                ` : `<span style="font-size: 10px; font-weight: 600; color: #1e293b;">${item.name || "-"}</span>`}
            </td>` : ""}
            ${columns.description ? `<td style="font-size: 10px; color: #374151;">
                ${(displayOptions.showItemImage && item.image) ? `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <img src="${item.image}" style="width: 28px; height: 28px; object-fit: cover; border-radius: 3px; flex-shrink: 0;" alt="Item" />
                    <span>${item.desc || "-"}</span>
                </div>
                ` : `<span>${item.desc || "-"}</span>`}
            </td>` : ""}
            ${columns.qty ? `<td class="text-center" style="font-weight: 700; font-size: 10px; white-space: nowrap;">${item.qty} ${item.unit || ""}</td>` : ""}
            ${columns.unitPrice ? `<td class="text-right" style="font-size: 10px; white-space: nowrap;">${asNumber(item.price).toFixed(2)}</td>` : ""}
            ${columns.discount ? `<td class="text-center" style="font-size: 10px; color: #ef4444; white-space: nowrap;">${item.disc > 0 ? `${item.disc}%` : "-"}</td>` : ""}
            ${columns.tax ? `<td class="text-right" style="font-size: 10px; color: #64748b; white-space: nowrap;">${asNumber(item.taxAmt).toFixed(2)}</td>` : ""}
            ${columns.total ? `<td class="text-right" style="font-weight: 700; font-size: 10px; white-space: nowrap;">${asNumber(item.total).toFixed(2)}</td>` : ""}
        </tr>
    `).join("");

    const itemsTable = `
        <table style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            ${tableHeader}
            <tbody>
                ${items.length > 0 ? tableRows : '<tr><td colspan="10" style="text-align:center; padding:16px; color:#94a3b8;">No items found</td></tr>'}
            </tbody>
        </table>
    `;

    let totalsSection = "";
    if (columns.total) {
        totalsSection = `
            <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
                <table style="width: 260px; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 4px 0; font-size: 11px; color: #64748b; border: none;">Sub Total</td>
                        <td style="padding: 4px 0; font-size: 11px; text-align: right; font-weight: 600; border: none;">${formatCurrency(totals.currency || "", totals.subTotal)}</td>
                    </tr>
                    ${asNumber(totals.billDiscount) > 0 ? `
                    <tr>
                        <td style="padding: 4px 0; font-size: 11px; color: #ef4444; border: none;">Discount (${totals.billDiscount}%)</td>
                        <td style="padding: 4px 0; font-size: 11px; text-align: right; font-weight: 600; color: #ef4444; border: none;">- ${formatCurrency(totals.currency || "", totals.billDiscountAmount)}</td>
                    </tr>` : ""}
                    <tr>
                        <td style="padding: 4px 0; font-size: 11px; color: #64748b; border: none;">Tax (VAT)</td>
                        <td style="padding: 4px 0; font-size: 11px; text-align: right; font-weight: 600; border: none;">${formatCurrency(totals.currency || "", totals.tax)}</td>
                    </tr>
                    <tr style="border-top: 2px solid #e2e8f0;">
                        <td style="padding: 8px 0 0 0; font-size: 13px; font-weight: 800; color: #0f172a; border: none;">Grand Total</td>
                        <td style="padding: 8px 0 0 0; text-align: right; font-size: 14px; font-weight: 800; color: #0f172a; border: none;">${formatCurrency(totals.currency || "", totals.grandTotal)}</td>
                    </tr>
                </table>
            </div>
        `;
    }

    let extraContent = "";
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

    const footerHtml = footerContent && footerContent.trim() !== ""
        ? resolveCompanyVars(footerContent, companyProfile, logoUrl)
        : `
            <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; color: #94a3b8; font-size: 10px;">
                <p style="margin: 0 0 2px 0;">Thank you for your business!</p>
                <p style="margin: 0;">${companyProfile.companyName || ""} | ${companyProfile.email || ""} | ${companyProfile.phone || ""}</p>
                ${billBullLogo ? `<div style="margin-top: 6px; opacity: 0.5;"><img src="${billBullLogo}" style="height: 16px;" alt="Powered by BillBull" /></div>` : ""}
            </div>
        `;

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
                ${meta.status === "Draft" || meta.status === "Cancelled"
                    ? `<div class="watermark">${meta.status.toUpperCase()}</div>`
                    : ""}
            </div>
        </body>
        </html>
    `;
};

const buildPurchaseTableRows = (items, columns, showItemImage) =>
    items.map((item, index) => {
        const descriptionLines = [];
        if (item.description?.title) descriptionLines.push(item.description.title);
        if (item.description?.details?.length) {
            descriptionLines.push(...item.description.details);
        } else {
            if (item.name && item.name !== item.description?.title) descriptionLines.push(item.name);
            if (item.desc) descriptionLines.push(item.desc);
        }

        const descriptionCell = `
            <td class="purchase-description">
                <div class="purchase-description-wrap">
                    ${(showItemImage && item.image)
                        ? `<img src="${item.image}" alt="Item" class="purchase-item-image" />`
                        : ""}
                    <div class="purchase-description-copy">
                        <div class="purchase-description-title">${escapeHtml(descriptionLines[0] || item.name || "-")}</div>
                        ${descriptionLines.slice(1).map((line) => `<div class="purchase-description-meta">${escapeHtml(line)}</div>`).join("")}
                    </div>
                </div>
            </td>
        `;

        const cells = [
            `<td class="purchase-index">${index + 1}</td>`,
            descriptionCell,
            columns.qty !== false ? `<td class="text-center">${escapeHtml(`${asNumber(item.qty)} ${asText(item.unit || "").trim()}`.trim())}</td>` : "",
            columns.unitPrice !== false ? `<td class="text-right">${asNumber(item.price).toFixed(2)}</td>` : "",
            columns.taxableAmount !== false ? `<td class="text-right">${asNumber(item.taxableAmount).toFixed(2)}</td>` : "",
            columns.tax !== false ? `<td class="text-right">${asNumber(item.taxAmt).toFixed(2)}</td>` : "",
            (columns.lineAmount !== false || columns.total !== false) ? `<td class="text-right purchase-line-total">${asNumber(item.total).toFixed(2)}</td>` : "",
        ].filter(Boolean);

        return `<tr>${cells.join("")}</tr>`;
    }).join("");

const generatePurchasePrintHtml = (template, data, options = {}) => {
    const {
        paperSize = "A4",
        orientation = "Portrait",
        headerContent,
        footerContent,
        termsContent,
        displayOptions: displayOptionsRaw,
        columns: columnsRaw,
    } = template;

    const displayOptions = parseObject(displayOptionsRaw);
    const columns = parseObject(columnsRaw);
    const { billBullLogo, companyProfile = {} } = options;
    const logoUrl = companyProfile.logoUrl || null;

    const title = asText(data.title || "PURCHASE DOCUMENT");
    const docNo = asText(data.docNo || "");
    const date = asText(data.date || "");
    const status = asText(data.status || "");
    const party = data.party || {};
    const headerMeta = Array.isArray(data.headerMeta) ? data.headerMeta.filter((item) => item?.value) : [];
    const references = Array.isArray(data.references) ? data.references.filter((item) => item?.value) : [];
    const items = Array.isArray(data.items) ? data.items : [];
    const totals = data.totals || {};
    const summaryAmount = data.summaryAmount || {
        label: "Grand Total",
        value: totals.grandTotal,
        currency: totals.currency,
    };
    const notes = asText(data.notes || "");
    const paymentDetails = Array.isArray(data.paymentDetails) ? data.paymentDetails.filter((item) => item?.value) : [];
    const isVoucher = displayOptions.showItemTable === false;

    const pageStyles = `
        @page { size: ${paperSize} ${orientation}; margin: 11mm 13mm 14mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #ffffff; color: #111827; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .purchase-page { width: 100%; position: relative; }
        .purchase-watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: -1; }
        .purchase-watermark span { transform: rotate(-28deg); font-size: 88px; letter-spacing: 10px; color: rgba(15, 23, 42, 0.05); font-weight: 700; }
        .purchase-top { display: grid; grid-template-columns: 1fr 320px; gap: 18px; align-items: start; }
        .purchase-doc-meta { border-top: 1px solid #cbd5e1; padding-top: 10px; min-height: 120px; }
        .purchase-doc-number { font-size: 13px; color: #475569; margin-bottom: 6px; }
        .purchase-doc-number strong { color: #0f172a; font-size: 15px; }
        .purchase-doc-grid { display: grid; grid-template-columns: repeat(2, minmax(120px, 1fr)); gap: 10px 18px; margin-top: 18px; }
        .purchase-meta-block { min-height: 26px; }
        .purchase-meta-label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; margin-bottom: 3px; }
        .purchase-meta-value { display: block; font-size: 11px; color: #0f172a; font-weight: 600; line-height: 1.35; }
        .purchase-company-panel { text-align: right; }
        .purchase-company-logo { margin-bottom: 8px; display: inline-flex; justify-content: flex-end; }
        .purchase-company-logo img { max-height: 56px; max-width: 180px; object-fit: contain; }
        .purchase-company-name { font-size: 15px; font-weight: 700; letter-spacing: 0.01em; color: #0f172a; margin-bottom: 4px; }
        .purchase-company-copy { font-size: 10px; line-height: 1.45; color: #334155; white-space: pre-line; }
        .purchase-summary-panel { margin-top: 18px; border-top: 1px solid #cbd5e1; padding-top: 10px; }
        .purchase-summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; }
        .purchase-summary-value { font-size: 34px; font-weight: 700; color: #0f172a; line-height: 1.1; margin-top: 5px; }
        .purchase-summary-currency { font-size: 12px; color: #64748b; display: block; margin-top: 4px; }
        .purchase-body { margin-top: 18px; }
        .purchase-info-row { display: grid; grid-template-columns: minmax(250px, 1fr) 300px; gap: 18px; align-items: start; margin-bottom: 18px; }
        .purchase-party-card, .purchase-reference-card, .purchase-details-card, .purchase-notes-card, .purchase-signature-card { border: 1px solid #dbe3ec; border-radius: 4px; padding: 12px 14px; background: #ffffff; }
        .purchase-section-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; margin-bottom: 8px; }
        .purchase-party-name { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
        .purchase-party-copy { font-size: 10px; line-height: 1.45; color: #334155; }
        .purchase-reference-list, .purchase-detail-list { display: grid; gap: 8px; }
        .purchase-reference-item { display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: start; }
        .purchase-reference-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; }
        .purchase-reference-value { font-size: 10px; color: #0f172a; line-height: 1.4; word-break: break-word; }
        .purchase-table { width: 100%; border-collapse: collapse; margin-top: 2px; }
        .purchase-table thead th { text-transform: uppercase; font-size: 9px; letter-spacing: 0.08em; color: #64748b; font-weight: 700; border-bottom: 1px solid #cbd5e1; padding: 8px 6px; white-space: nowrap; text-align: left; }
        .purchase-table tbody td { font-size: 10px; padding: 10px 6px; border-bottom: 1px solid #eef2f7; vertical-align: top; color: #0f172a; }
        .purchase-table tr { page-break-inside: avoid; }
        .purchase-table th.text-right, .purchase-table td.text-right { text-align: right; }
        .purchase-table th.text-center, .purchase-table td.text-center { text-align: center; }
        .purchase-index { width: 28px; color: #64748b; }
        .purchase-description-wrap { display: flex; align-items: flex-start; gap: 10px; }
        .purchase-item-image { width: 34px; height: 34px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0; flex-shrink: 0; }
        .purchase-description-title { font-size: 10px; font-weight: 700; color: #0f172a; line-height: 1.4; }
        .purchase-description-meta { font-size: 9px; color: #64748b; line-height: 1.45; margin-top: 1px; }
        .purchase-line-total { font-weight: 700; }
        .purchase-footer-grid { display: grid; grid-template-columns: minmax(240px, 1fr) 280px; gap: 18px; align-items: start; margin-top: 18px; }
        .purchase-totals-panel { width: 100%; border-collapse: collapse; }
        .purchase-totals-panel td { font-size: 10px; padding: 5px 0; border-bottom: 1px solid #eef2f7; }
        .purchase-totals-panel td:last-child { text-align: right; font-weight: 600; }
        .purchase-totals-grand td { border-top: 1px solid #cbd5e1; border-bottom: none; padding-top: 8px; font-size: 13px; font-weight: 700; color: #0f172a; }
        .purchase-balance-row td { color: #0f172a; font-weight: 700; }
        .purchase-notes-body { font-size: 10px; line-height: 1.55; color: #334155; white-space: pre-wrap; }
        .purchase-signature-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 20px; }
        .purchase-signature-line { margin-top: 28px; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #475569; text-align: center; }
        .purchase-page-footer { margin-top: 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid #dbe3ec; padding-top: 8px; font-size: 9px; color: #64748b; }
        .purchase-footer-branding { display: inline-flex; align-items: center; gap: 8px; }
        .purchase-footer-branding img { height: 14px; width: auto; }
        .page-counter-number::after { content: counter(page); }
        .page-counter-total::after { content: counter(pages); }
    `;

    const defaultHeader = `
        <div class="purchase-top">
            <div class="purchase-doc-meta">
                <div class="purchase-doc-number">Document No: <strong>${escapeHtml(docNo || "-")}</strong></div>
                <div class="purchase-doc-grid">
                    <div class="purchase-meta-block">
                        <span class="purchase-meta-label">Date</span>
                        <span class="purchase-meta-value">${escapeHtml(date || "-")}</span>
                    </div>
                    ${status ? `
                    <div class="purchase-meta-block">
                        <span class="purchase-meta-label">Status</span>
                        <span class="purchase-meta-value">${escapeHtml(status)}</span>
                    </div>` : ""}
                    ${headerMeta.map((item) => `
                    <div class="purchase-meta-block">
                        <span class="purchase-meta-label">${escapeHtml(item.label)}</span>
                        <span class="purchase-meta-value">${escapeHtml(item.value)}</span>
                    </div>`).join("")}
                </div>
            </div>
            <div class="purchase-company-panel">
                ${(displayOptions.showLogo && logoUrl) ? `
                <div class="purchase-company-logo">
                    <img src="${logoUrl}" alt="Company Logo" />
                </div>` : ""}
                ${displayOptions.showCompanyDetails !== false ? `
                <div class="purchase-company-name">${escapeHtml(companyProfile.companyName || "")}</div>
                <div class="purchase-company-copy">${escapeHtml(companyProfile.address || "")}</div>
                ${companyProfile.email ? `<div class="purchase-company-copy">${escapeHtml(companyProfile.email)}</div>` : ""}
                ${companyProfile.phone ? `<div class="purchase-company-copy">${escapeHtml(companyProfile.phone)}</div>` : ""}
                ${companyProfile.trn ? `<div class="purchase-company-copy">TRN: ${escapeHtml(companyProfile.trn)}</div>` : ""}
                ` : ""}
                ${displayOptions.showTotalsPanel !== false ? `
                <div class="purchase-summary-panel">
                    <div class="purchase-summary-label">${escapeHtml(summaryAmount.label || "Grand Total")}</div>
                    <div class="purchase-summary-value">${asNumber(summaryAmount.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    ${summaryAmount.currency ? `<span class="purchase-summary-currency">${escapeHtml(summaryAmount.currency)}</span>` : ""}
                </div>` : ""}
            </div>
        </div>
    `;

    const headerHtml = headerContent && headerContent.trim() !== ""
        ? resolveCompanyVars(headerContent, companyProfile, logoUrl)
        : defaultHeader;

    const partyCard = displayOptions.showCustomerDetails === false
        ? ""
        : `
            <div class="purchase-party-card">
                <div class="purchase-section-title">Vendor Details</div>
                <div class="purchase-party-name">${escapeHtml(party.name || "-")}</div>
                <div class="purchase-party-copy">
                    ${party.code ? `Code: ${escapeHtml(party.code)}<br />` : ""}
                    ${party.address ? `${escapeHtml(party.address)}<br />` : ""}
                    ${party.phone ? `Phone: ${escapeHtml(party.phone)}<br />` : ""}
                    ${party.email ? `Email: ${escapeHtml(party.email)}<br />` : ""}
                    ${party.taxId ? `Tax ID / TRN: ${escapeHtml(party.taxId)}` : ""}
                </div>
            </div>
        `;

    const referenceItems = references.filter((item) => {
        if (item.label === "Warehouse" || item.label === "Location") {
            return displayOptions.showWarehouseFields !== false;
        }
        return displayOptions.showReferenceFields !== false;
    });

    const referenceCard = referenceItems.length === 0
        ? ""
        : `
            <div class="purchase-reference-card">
                <div class="purchase-section-title">Reference</div>
                <div class="purchase-reference-list">
                    ${referenceItems.map((item) => `
                    <div class="purchase-reference-item">
                        <div class="purchase-reference-label">${escapeHtml(item.label)}</div>
                        <div class="purchase-reference-value">${escapeHtml(item.value)}</div>
                    </div>`).join("")}
                </div>
            </div>
        `;

    const infoSection = (partyCard || referenceCard)
        ? `
            <div class="purchase-info-row">
                ${partyCard || '<div></div>'}
                ${referenceCard || '<div></div>'}
            </div>
        `
        : "";

    const itemsTable = (!isVoucher && displayOptions.showItemTable !== false)
        ? `
            <table class="purchase-table">
                <thead>
                    <tr>
                        <th style="width: 28px;">#</th>
                        <th>Description</th>
                        ${columns.qty !== false ? '<th class="text-center" style="width: 76px;">Qty</th>' : ""}
                        ${columns.unitPrice !== false ? '<th class="text-right" style="width: 90px;">Price</th>' : ""}
                        ${columns.taxableAmount !== false ? '<th class="text-right" style="width: 110px;">Taxable Amount</th>' : ""}
                        ${columns.tax !== false ? '<th class="text-right" style="width: 82px;">VAT Amt</th>' : ""}
                        ${(columns.lineAmount !== false || columns.total !== false) ? '<th class="text-right" style="width: 100px;">Line Amount</th>' : ""}
                    </tr>
                </thead>
                <tbody>
                    ${items.length > 0
                        ? buildPurchaseTableRows(items, columns, displayOptions.showItemImage)
                        : `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:20px 8px;">No items found</td></tr>`
                    }
                </tbody>
            </table>
        `
        : "";

    const paymentCard = (isVoucher && paymentDetails.length > 0 && displayOptions.showPaymentDetails !== false)
        ? `
            <div class="purchase-details-card">
                <div class="purchase-section-title">Payment Details</div>
                <div class="purchase-detail-list">
                    ${paymentDetails.map((item) => `
                    <div class="purchase-reference-item">
                        <div class="purchase-reference-label">${escapeHtml(item.label)}</div>
                        <div class="purchase-reference-value">${escapeHtml(item.value)}</div>
                    </div>`).join("")}
                </div>
            </div>
        `
        : "";

    const totalsCard = displayOptions.showTotalsPanel === false
        ? ""
        : `
            <div class="purchase-reference-card">
                <div class="purchase-section-title">${isVoucher ? "Voucher Totals" : "Totals"}</div>
                <table class="purchase-totals-panel">
                    <tbody>
                        <tr>
                            <td>Sub Total</td>
                            <td>${formatCurrency(totals.currency || "", totals.subTotal)}</td>
                        </tr>
                        <tr>
                            <td>VAT Amount</td>
                            <td>${formatCurrency(totals.currency || "", totals.tax)}</td>
                        </tr>
                        ${displayOptions.showBalancePanel && asNumber(totals.amountPaid) > 0 ? `
                        <tr>
                            <td>Amount Paid</td>
                            <td>${formatCurrency(totals.currency || "", totals.amountPaid)}</td>
                        </tr>` : ""}
                        ${(displayOptions.showBalancePanel && asNumber(totals.balanceDue) > 0) ? `
                        <tr class="purchase-balance-row">
                            <td>Balance Due</td>
                            <td>${formatCurrency(totals.currency || "", totals.balanceDue)}</td>
                        </tr>` : ""}
                        <tr class="purchase-totals-grand">
                            <td>Grand Total</td>
                            <td>${formatCurrency(totals.currency || "", totals.grandTotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

    const notesCard = (notes || (displayOptions.showTerms && termsContent))
        ? `
            <div class="purchase-notes-card">
                <div class="purchase-section-title">Notes & Terms</div>
                ${notes ? `<div class="purchase-notes-body">${escapeHtml(notes)}</div>` : ""}
                ${(displayOptions.showTerms && termsContent)
                    ? `<div class="purchase-notes-body" style="margin-top:${notes ? "10px" : "0"};">${escapeHtml(termsContent)}</div>`
                    : ""}
            </div>
        `
        : "";

    const signatureCard = displayOptions.showSignatureBlock
        ? `
            <div class="purchase-signature-card">
                <div class="purchase-section-title">Authorisation</div>
                <div class="purchase-signature-grid">
                    <div class="purchase-signature-line">Prepared By</div>
                    <div class="purchase-signature-line">Approved By</div>
                </div>
            </div>
        `
        : "";

    const footerHtml = footerContent && footerContent.trim() !== ""
        ? resolveCompanyVars(footerContent, companyProfile, logoUrl)
        : `
            <div class="purchase-page-footer">
                <div>${escapeHtml(companyProfile.companyName || "")}</div>
                <div>Page <span class="page-counter-number"></span> of <span class="page-counter-total"></span></div>
                ${billBullLogo ? `<div class="purchase-footer-branding"><img src="${billBullLogo}" alt="Powered by BillBull" /><span>Powered by BillBull ERP</span></div>` : ""}
            </div>
        `;

    const footerGrid = (!isVoucher && (notesCard || totalsCard)) || (isVoucher && (paymentCard || totalsCard || notesCard))
        ? `
            <div class="purchase-footer-grid">
                <div>
                    ${isVoucher ? paymentCard : notesCard}
                </div>
                <div>
                    ${isVoucher ? `${totalsCard}${notesCard ? `<div style="margin-top:18px;">${notesCard}</div>` : ""}` : totalsCard}
                </div>
            </div>
        `
        : "";

    const bodyContent = isVoucher
        ? `
            <div class="purchase-body">
                ${infoSection}
                ${footerGrid}
                ${signatureCard ? `<div style="margin-top:18px;">${signatureCard}</div>` : ""}
            </div>
        `
        : `
            <div class="purchase-body">
                ${infoSection}
                ${itemsTable}
                ${footerGrid}
                ${signatureCard ? `<div style="margin-top:18px;">${signatureCard}</div>` : ""}
            </div>
        `;

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8" />
            <title>${escapeHtml(`${title} - ${docNo}`)}</title>
            <style>${pageStyles}</style>
        </head>
        <body>
            <div class="purchase-page">
                ${headerHtml}
                ${bodyContent}
                ${footerHtml}
                ${status && ["DRAFT", "CANCELLED", "REJECTED"].includes(status.toUpperCase())
                    ? `<div class="purchase-watermark"><span>${escapeHtml(status.replace(/_/g, " "))}</span></div>`
                    : ""}
            </div>
        </body>
        </html>
    `;
};

/**
 * Generates the HTML string for a print document.
 *
 * @param {Object} template       - PrintTemplate object from DB.
 * @param {Object} data           - Document data.
 * @param {Object} options
 * @param {Object} options.companyProfile - Company profile from CompanyContext.
 * @param {string} [options.billBullLogo] - URL for the "Powered by BillBull" logo.
 * @returns {string} Full HTML string ready for printHtml().
 */
export const generatePrintHtml = (template, data, options = {}) => {
    const displayOptions = parseObject(template?.displayOptions);
    if (displayOptions.layoutVariant === "purchase-modern-v1") {
        return generatePurchasePrintHtml(template, data, options);
    }
    const normalizedData = PURCHASE_TEMPLATE_CATEGORIES.has(template?.category) && looksLikePurchasePayload(data)
        ? mapPurchaseDataToGenericData(template, data)
        : data;
    return generateGenericDocumentHtml(template, normalizedData, options);
};

// ---------------------------------------------------------------------------
// Report print generator (Low Stock, Out of Stock, Stock on Hand, etc.)
// ---------------------------------------------------------------------------

/**
 * Generates HTML for a generic report table.
 *
 * @param {Object}   _template        - PrintTemplate (unused, backward-compatible).
 * @param {string}   reportTitle      - Title shown on the report header.
 * @param {Array}    columns          - [{ header, key }]
 * @param {Array}    data             - Array of row objects.
 * @param {Object}   [companyProfile] - Company profile from CompanyContext.
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
        .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; font-size: 10px; color: #94a3b8; }
    `;

    const headers = columns.map((col) => `<th>${escapeHtml(col.header)}</th>`).join("");
    const rows = data.map((item) => `
        <tr>
            ${columns.map((col) => {
                const val = item[col.key];
                const isNum = typeof val === "number";
                return `<td class="${isNum ? "text-right" : ""}">${val !== null && val !== undefined ? escapeHtml(val) : "-"}</td>`;
            }).join("")}
        </tr>
    `).join("");

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${escapeHtml(reportTitle)}</title>
            <style>${pageStyles}</style>
        </head>
        <body>
            <div class="header">
                <div class="company-info">
                    <h2>${escapeHtml(companyProfile.companyName || "")}</h2>
                    <p>${escapeHtml(companyProfile.address || "")}</p>
                    <p>Email: ${escapeHtml(companyProfile.email || "")} | Phone: ${escapeHtml(companyProfile.phone || "")}</p>
                    <p>TRN: ${escapeHtml(companyProfile.trn || "")}</p>
                </div>
                <div class="report-title">
                    <h1>${escapeHtml(reportTitle)}</h1>
                    <p>Generated on: ${escapeHtml(date)}</p>
                    <p>Total Records: ${data.length}</p>
                </div>
            </div>

            <table>
                <thead><tr>${headers}</tr></thead>
                <tbody>${rows}</tbody>
            </table>

            <div class="footer">
                <p>Generated by BillBull ERP</p>
                <p>&copy; ${new Date().getFullYear()} ${escapeHtml(companyProfile.companyName || "BillBull")}. All rights reserved.</p>
            </div>
        </body>
        </html>
    `;
};

// ---------------------------------------------------------------------------
// Print helper - opens a new window and triggers the browser print dialog.
// ---------------------------------------------------------------------------

/**
 * Opens a print window with the generated HTML.
 * @param {string} htmlContent - Full HTML string to print.
 */
export const printHtml = (htmlContent) => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 500);
    } else {
        alert("Pop-up blocked! Please allow pop-ups for this site.");
    }
};
