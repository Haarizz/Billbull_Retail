/**
 * BillBull ERP — Print & Email Template Generator (v2)
 * Generates A4-optimised HTML for purchase and sales documents.
 * Company details are passed via options.companyProfile from CompanyContext.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const parseObject = (value) => {
    if (!value) return {};
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch { return {}; }
};

const asNumber = (value) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
};

const asText = (value) => (value === null || value === undefined ? "" : String(value));

const escapeHtml = (value) =>
    asText(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const fmt = (value, decimals = 2) => asNumber(value).toFixed(decimals);

const formatCurrency = (currency, value) => `${currency} ${fmt(value)}`;

// ---------------------------------------------------------------------------
// Placeholder resolver for custom header/footer HTML stored in DB
// ---------------------------------------------------------------------------
const resolveCompanyVars = (html, company, logoUrl) => {
    if (!html) return "";
    return html
        .replace(/{company_name}/g, escapeHtml(company.companyName || ""))
        .replace(/{company_address}/g, escapeHtml(company.address || ""))
        .replace(/{company_phone}/g, escapeHtml(company.phone || ""))
        .replace(/{company_email}/g, escapeHtml(company.email || ""))
        .replace(/{company_trn}/g, escapeHtml(company.trn || ""))
        .replace(/{page_number}/g, '<span class="page-num"></span>')
        .replace(/{total_pages}/g, '<span class="page-total"></span>')
        .replace(
            /{company_logo}/g,
            logoUrl ? `<img src="${logoUrl}" style="height:56px;width:auto;" alt="Logo" />` : ""
        )
        .replace(
            /{logo}/g,
            logoUrl ? `<img src="${logoUrl}" style="height:56px;width:auto;" alt="Logo" />` : ""
        );
};

// ---------------------------------------------------------------------------
// Purchase payload detection
// ---------------------------------------------------------------------------

const PURCHASE_TEMPLATE_CATEGORIES = new Set([
    "Local Purchase Order",
    "Goods Receipt Note",
    "Purchase Invoice",
    "Payment Voucher",
]);

const looksLikePurchasePayload = (data) =>
    data &&
    typeof data === "object" &&
    (data.party || Array.isArray(data.headerMeta) || Array.isArray(data.references) || Array.isArray(data.paymentDetails));

// ---------------------------------------------------------------------------
// Description cell builder — supports bullet-point descriptions + image
// ---------------------------------------------------------------------------

const buildDescriptionCell = (item, showImage) => {
    const title = item.description?.title || item.name || "-";
    const details = Array.isArray(item.description?.details) && item.description.details.length
        ? item.description.details
        : (item.desc ? [item.desc] : []);

    const bulletLines = details
        .map(line => {
            const text = asText(line).replace(/^[•\-]\s*/, "");
            return `<div class="desc-bullet">• ${escapeHtml(text)}</div>`;
        })
        .join("");

    const imageHtml = (showImage && item.image)
        ? `<img src="${item.image}" class="item-thumb" alt="" />`
        : "";

    return `
        <td class="desc-cell">
            <div class="desc-wrap">
                ${imageHtml}
                <div class="desc-copy">
                    <div class="desc-title">${escapeHtml(title)}</div>
                    ${bulletLines}
                </div>
            </div>
        </td>`;
};

// ---------------------------------------------------------------------------
// Shared CSS — used by both purchase and generic generators
// ---------------------------------------------------------------------------

const buildPageStyles = (paperSize, orientation) => `
    @page {
        size: ${paperSize} ${orientation};
        margin: 15mm 18mm 20mm;
        @bottom-left   { content: element(page-footer); }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 10pt;
        color: #111827;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    /* ── Header ── */
    .doc-header {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 20px;
        padding-bottom: 14px;
        border-bottom: 1px solid #d1d5db;
        margin-bottom: 14px;
    }
    .header-left { font-size: 9.5pt; color: #374151; line-height: 1.7; }
    .header-left .company-phone { font-size: 9pt; color: #6b7280; margin-bottom: 4px; }
    .header-left .meta-row { display: flex; gap: 6px; }
    .header-left .meta-label { color: #6b7280; }
    .header-left .meta-value { color: #111827; font-weight: 600; }
    .header-right { text-align: right; min-width: 240px; }
    .header-logo { margin-bottom: 6px; }
    .header-logo img { max-height: 52px; max-width: 180px; object-fit: contain; }
    .company-name { font-size: 13.5pt; font-weight: 700; color: #0f172a; line-height: 1.2; margin-bottom: 4px; }
    .company-detail { font-size: 8.5pt; color: #374151; line-height: 1.55; }
    .balance-box { margin-top: 10px; padding-top: 8px; border-top: 1px solid #e5e7eb; }
    .balance-label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
    .balance-amount { font-size: 22pt; font-weight: 800; color: #0f172a; line-height: 1.1; margin-top: 3px; }

    /* ── Party & Reference cards ── */
    .info-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-bottom: 14px;
    }
    .info-card {
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 10px 12px;
    }
    .card-title {
        font-size: 7.5pt;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #9ca3af;
        margin-bottom: 6px;
        font-weight: 700;
    }
    .party-name { font-size: 11pt; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
    .party-detail { font-size: 8.5pt; color: #374151; line-height: 1.55; }
    .ref-grid { display: grid; gap: 6px; }
    .ref-row { display: grid; grid-template-columns: 110px 1fr; gap: 6px; align-items: start; }
    .ref-label { font-size: 8pt; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; }
    .ref-value { font-size: 9pt; color: #111827; font-weight: 600; word-break: break-word; }

    /* ── Items table ── */
    .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 0;
    }
    .items-table thead { display: table-header-group; }
    .items-table thead th {
        font-size: 7.5pt;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 700;
        color: #6b7280;
        border-top: 1px solid #d1d5db;
        border-bottom: 1px solid #d1d5db;
        padding: 7px 6px;
        white-space: nowrap;
        background: #f9fafb;
    }
    .items-table tbody td {
        font-size: 9.5pt;
        padding: 9px 6px;
        border-bottom: 1px solid #f3f4f6;
        vertical-align: top;
        color: #111827;
    }
    .items-table tr { page-break-inside: avoid; }
    .items-table tfoot { display: table-footer-group; }
    .items-table tfoot td { border: none; padding: 0; }

    /* ── Description cell ── */
    .desc-cell { min-width: 160px; }
    .desc-wrap { display: flex; align-items: flex-start; gap: 8px; }
    .item-thumb {
        width: 36px;
        height: 36px;
        object-fit: cover;
        border-radius: 3px;
        border: 1px solid #e5e7eb;
        flex-shrink: 0;
        margin-top: 1px;
    }
    .desc-copy { flex: 1; }
    .desc-title { font-size: 9.5pt; font-weight: 700; color: #0f172a; line-height: 1.35; }
    .desc-bullet { font-size: 8.5pt; color: #4b5563; line-height: 1.5; padding-left: 2px; margin-top: 1px; }

    /* ── VAT cell ── */
    .vat-cell .vat-amount { font-size: 9.5pt; color: #111827; }
    .vat-cell .vat-pct { font-size: 7.5pt; color: #9ca3af; margin-top: 1px; }

    /* ── Index + alignment ── */
    .idx-cell { color: #9ca3af; font-size: 9pt; width: 24px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }

    /* ── Totals ── */
    .totals-section {
        display: flex;
        justify-content: flex-end;
        margin-top: 14px;
        margin-bottom: 14px;
    }
    .totals-table { width: 280px; border-collapse: collapse; }
    .totals-table td { font-size: 9.5pt; padding: 5px 0; border: none; }
    .totals-table td:last-child { text-align: right; font-weight: 600; }
    .totals-table .grand-row td {
        font-size: 13pt;
        font-weight: 800;
        color: #0f172a;
        border-top: 2px solid #d1d5db;
        padding-top: 8px;
    }

    /* ── Notes / Terms ── */
    .notes-block {
        background: #f9fafb;
        border: 1px solid #f3f4f6;
        border-radius: 4px;
        padding: 10px 12px;
        margin-bottom: 12px;
        font-size: 8.5pt;
        color: #4b5563;
        line-height: 1.55;
        white-space: pre-wrap;
    }
    .notes-title {
        font-size: 7.5pt;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #9ca3af;
        font-weight: 700;
        margin-bottom: 5px;
    }

    /* ── Footer (per-page) ── */
    .page-footer {
        position: running(page-footer);
        width: 100%;
        border-top: 1px solid #e5e7eb;
        padding-top: 6px;
        margin-top: 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 8pt;
        color: #6b7280;
    }
    .footer-center { flex: 1; text-align: center; }
    .footer-right { text-align: right; }
    @media print {
        .page-footer {
            position: fixed;
            bottom: 0;
            left: 18mm;
            right: 18mm;
        }
    }
    .page-num::before { content: counter(page); }
    .page-total::before { content: counter(pages); }

    /* ── Watermark ── */
    .watermark {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: -1;
    }
    .watermark span {
        transform: rotate(-28deg);
        font-size: 90px;
        letter-spacing: 10px;
        color: rgba(15,23,42,0.05);
        font-weight: 700;
    }

    /* ── Payment voucher ── */
    .payment-grid { display: grid; gap: 8px; }
    .payment-row { display: grid; grid-template-columns: 140px 1fr; gap: 8px; }
    .payment-label { font-size: 8pt; color: #9ca3af; text-transform: uppercase; }
    .payment-value { font-size: 9.5pt; color: #111827; font-weight: 600; }

    /* ── Signature ── */
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
    .sig-line { border-top: 1px solid #9ca3af; padding-top: 5px; font-size: 8.5pt; color: #4b5563; text-align: center; }
`;

// ---------------------------------------------------------------------------
// Build items table HTML (shared between purchase and generic)
// ---------------------------------------------------------------------------

const buildItemsTable = (items, columns, showImage, totals, currency) => {
    const rows = items.map((item, i) => {
        const taxableAmt = asNumber(item.taxableAmount ?? (asNumber(item.price) * asNumber(item.qty)));
        const vatAmt = asNumber(item.taxAmt ?? 0);
        const taxPct = asNumber(item.taxPercent ?? item.taxRate ?? item.tax ?? 0);
        const lineAmt = asNumber(item.total ?? (taxableAmt + vatAmt));

        return `
        <tr>
            <td class="idx-cell">${i + 1}</td>
            ${buildDescriptionCell(item, showImage)}
            ${columns.qty !== false ? `<td class="text-center">${escapeHtml(`${asNumber(item.qty)} ${asText(item.unit || "")}`.trim())}</td>` : ""}
            ${columns.unitPrice !== false ? `<td class="text-right">${fmt(item.price)}</td>` : ""}
            ${columns.taxableAmount !== false ? `<td class="text-right">${fmt(taxableAmt)}</td>` : ""}
            ${columns.tax !== false ? `
            <td class="text-right vat-cell">
                <div class="vat-amount">${fmt(vatAmt)}</div>
                ${taxPct > 0 ? `<div class="vat-pct">${taxPct}%</div>` : ""}
            </td>` : ""}
            ${columns.discount ? `<td class="text-center">${asNumber(item.disc) > 0 ? `${item.disc}%` : "-"}</td>` : ""}
            ${columns.total !== false ? `<td class="text-right font-bold">${fmt(lineAmt)}</td>` : ""}
        </tr>`;
    }).join("");

    const colspan = 1 +
        (columns.qty !== false ? 1 : 0) +
        (columns.unitPrice !== false ? 1 : 0) +
        (columns.taxableAmount !== false ? 1 : 0) +
        (columns.tax !== false ? 1 : 0) +
        (columns.discount ? 1 : 0) +
        (columns.total !== false ? 1 : 0) + 1;

    return `
    <table class="items-table">
        <thead>
            <tr>
                <th style="width:24px;">#</th>
                <th style="text-align:left;">Description</th>
                ${columns.qty !== false ? '<th class="text-center" style="width:80px;">Qty</th>' : ""}
                ${columns.unitPrice !== false ? '<th class="text-right" style="width:80px;">Price</th>' : ""}
                ${columns.taxableAmount !== false ? '<th class="text-right" style="width:100px;">Taxable Amount</th>' : ""}
                ${columns.tax !== false ? '<th class="text-right" style="width:80px;">VAT Amount</th>' : ""}
                ${columns.discount ? '<th class="text-center" style="width:50px;">Disc%</th>' : ""}
                ${columns.total !== false ? '<th class="text-right" style="width:90px;">Line Amount</th>' : ""}
            </tr>
        </thead>
        <tbody>
            ${items.length > 0 ? rows : `<tr><td colspan="${colspan}" style="text-align:center;color:#9ca3af;padding:20px;">No items found.</td></tr>`}
        </tbody>
    </table>`;
};

// ---------------------------------------------------------------------------
// Totals section
// ---------------------------------------------------------------------------

const buildTotalsSection = (totals, currency) => {
    const cur = currency || totals.currency || "";
    const sub = asNumber(totals.subTotal);
    const tax = asNumber(totals.tax);
    const disc = asNumber(totals.billDiscountAmount ?? totals.discountAmount ?? 0);
    const discPct = asNumber(totals.billDiscount ?? 0);
    const grand = asNumber(totals.grandTotal);
    const paid = asNumber(totals.amountPaid ?? 0);
    const balance = asNumber(totals.balanceDue ?? (grand - paid));

    return `
    <div class="totals-section">
        <table class="totals-table">
            <tbody>
                <tr>
                    <td style="color:#6b7280;">Subtotal</td>
                    <td>${formatCurrency(cur, sub)}</td>
                </tr>
                ${disc > 0 ? `<tr>
                    <td style="color:#ef4444;">Discount${discPct > 0 ? ` (${discPct}%)` : ""}</td>
                    <td style="color:#ef4444;">- ${formatCurrency(cur, disc)}</td>
                </tr>` : ""}
                <tr>
                    <td style="color:#6b7280;">Tax (VAT)</td>
                    <td>${formatCurrency(cur, tax)}</td>
                </tr>
                <tr class="grand-row">
                    <td>Grand Total</td>
                    <td>${formatCurrency(cur, grand)}</td>
                </tr>
                ${paid > 0 ? `<tr>
                    <td style="color:#6b7280;">Amount Paid</td>
                    <td>- ${formatCurrency(cur, paid)}</td>
                </tr>
                <tr>
                    <td style="font-weight:700;">Balance Due</td>
                    <td style="font-weight:700;">${formatCurrency(cur, Math.max(balance, 0))}</td>
                </tr>` : ""}
            </tbody>
        </table>
    </div>`;
};

// ---------------------------------------------------------------------------
// Page footer HTML (rendered as fixed/running element)
// ---------------------------------------------------------------------------

const buildPageFooter = (companyName, docNo, billBullLogo) => `
    <div class="page-footer">
        <div>${escapeHtml(companyName || "")}</div>
        <div class="footer-center"></div>
        <div class="footer-right">
            Page <span class="page-num"></span> of <span class="page-total"></span>
            ${docNo ? ` &nbsp;|&nbsp; ${escapeHtml(docNo)}` : ""}
        </div>
    </div>`;

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------

const buildWatermark = (status) => {
    const show = ["DRAFT", "CANCELLED", "REJECTED"].includes((status || "").toUpperCase().replace(/\s/g, "_"));
    return show ? `<div class="watermark"><span>${escapeHtml(status.replace(/_/g, " ").toUpperCase())}</span></div>` : "";
};

// ---------------------------------------------------------------------------
// PURCHASE document generator (A4 reference layout)
// ---------------------------------------------------------------------------

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
    const headerMeta = Array.isArray(data.headerMeta) ? data.headerMeta.filter(r => r?.value) : [];
    const references = Array.isArray(data.references) ? data.references.filter(r => r?.value) : [];
    const paymentDetails = Array.isArray(data.paymentDetails) ? data.paymentDetails.filter(r => r?.value) : [];
    const items = Array.isArray(data.items) ? data.items : [];
    const totals = data.totals || {};
    const currency = totals.currency || companyProfile.currencySymbol || "AED";
    const notes = asText(data.notes || "");
    const grandTotal = asNumber(totals.grandTotal ?? data.summaryAmount?.value ?? 0);
    const isVoucher = displayOptions.showItemTable === false;

    // ── Due date / secondary meta ──
    const dueDateRow = headerMeta.find(r => /due date|expected delivery/i.test(asText(r.label)));
    const otherMeta = headerMeta.filter(r => r !== dueDateRow && !/status/i.test(asText(r.label)));

    // ── Header (left: doc info; right: company + balance) ──
    const defaultHeader = `
        <div class="doc-header">
            <div class="header-left">
                ${companyProfile.phone ? `<div class="company-phone">${escapeHtml(companyProfile.phone)}</div>` : ""}
                <div class="meta-row">
                    <span class="meta-label">Date:</span>
                    <span class="meta-value">${escapeHtml(date || "-")}</span>
                </div>
                ${dueDateRow ? `<div class="meta-row">
                    <span class="meta-label">${escapeHtml(dueDateRow.label)}:</span>
                    <span class="meta-value">${escapeHtml(dueDateRow.value)}</span>
                </div>` : ""}
                ${otherMeta.map(r => `<div class="meta-row">
                    <span class="meta-label">${escapeHtml(r.label)}:</span>
                    <span class="meta-value">${escapeHtml(r.value)}</span>
                </div>`).join("")}
                <div class="meta-row" style="margin-top:6px;">
                    <span class="meta-label" style="font-size:8pt;color:#9ca3af;">Document No:</span>
                    <span class="meta-value" style="font-size:10pt;">${escapeHtml(docNo || "-")}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-value" style="font-size:13pt;font-weight:800;color:#0f172a;letter-spacing:0.02em;">${escapeHtml(title)}</span>
                </div>
            </div>
            <div class="header-right">
                ${displayOptions.showLogo && logoUrl ? `<div class="header-logo"><img src="${logoUrl}" alt="Logo" /></div>` : ""}
                ${displayOptions.showCompanyDetails !== false ? `
                <div class="company-name">${escapeHtml(companyProfile.companyName || "")}</div>
                <div class="company-detail">${escapeHtml(companyProfile.address || "")}</div>
                ${companyProfile.email ? `<div class="company-detail">${escapeHtml(companyProfile.email)}</div>` : ""}
                ${companyProfile.phone ? `<div class="company-detail">${escapeHtml(companyProfile.phone)}</div>` : ""}
                ${companyProfile.trn ? `<div class="company-detail">TRN: ${escapeHtml(companyProfile.trn)}</div>` : ""}
                ` : ""}
                ${displayOptions.showTotalsPanel !== false ? `
                <div class="balance-box">
                    <div class="balance-label">Balance</div>
                    <div class="balance-amount">${currency} ${grandTotal.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>` : ""}
            </div>
        </div>`;

    const headerHtml = (headerContent && headerContent.trim())
        ? resolveCompanyVars(headerContent, companyProfile, logoUrl)
        : defaultHeader;

    // ── Party & Reference cards ──
    const partyCard = displayOptions.showCustomerDetails === false ? "" : `
        <div class="info-card">
            <div class="card-title">${template.category === "Payment Voucher" ? "Paid To" : "Vendor Details"}</div>
            <div class="party-name">${escapeHtml(party.name || "-")}</div>
            <div class="party-detail">
                ${party.code ? `Code: ${escapeHtml(party.code)}<br>` : ""}
                ${party.address ? `${escapeHtml(party.address)}<br>` : ""}
                ${party.phone ? `Phone: ${escapeHtml(party.phone)}<br>` : ""}
                ${party.email ? `Email: ${escapeHtml(party.email)}<br>` : ""}
                ${party.taxId ? `TRN: ${escapeHtml(party.taxId)}` : ""}
            </div>
        </div>`;

    const refItems = references.filter(r => {
        if (/warehouse|location/i.test(r.label)) return displayOptions.showWarehouseFields !== false;
        return displayOptions.showReferenceFields !== false;
    });

    const refCard = refItems.length === 0 ? "<div></div>" : `
        <div class="info-card">
            <div class="card-title">Reference</div>
            <div class="ref-grid">
                ${refItems.map(r => `
                <div class="ref-row">
                    <div class="ref-label">${escapeHtml(r.label)}</div>
                    <div class="ref-value">${escapeHtml(r.value)}</div>
                </div>`).join("")}
            </div>
        </div>`;

    const infoRow = (partyCard || refCard) ? `
        <div class="info-row">
            ${partyCard || "<div></div>"}
            ${refCard}
        </div>` : "";

    // ── Items table ──
    const itemsTableHtml = (!isVoucher && displayOptions.showItemTable !== false)
        ? buildItemsTable(items, columns, displayOptions.showItemImage, totals, currency)
        : "";

    // ── Payment voucher details ──
    const paymentCard = (isVoucher && paymentDetails.length) ? `
        <div class="info-card" style="margin-bottom:14px;">
            <div class="card-title">Payment Details</div>
            <div class="payment-grid">
                ${paymentDetails.map(r => `
                <div class="payment-row">
                    <div class="payment-label">${escapeHtml(r.label)}</div>
                    <div class="payment-value">${escapeHtml(r.value)}</div>
                </div>`).join("")}
            </div>
        </div>` : "";

    // ── Totals ──
    const totalsHtml = displayOptions.showTotalsPanel === false ? "" : buildTotalsSection(totals, currency);

    // ── Notes / Terms ──
    const notesHtml = (notes || (displayOptions.showTerms && termsContent)) ? `
        <div class="notes-block">
            ${notes ? `<div class="notes-title">Notes</div><div>${escapeHtml(notes)}</div>` : ""}
            ${displayOptions.showTerms && termsContent ? `
            <div class="notes-title" style="margin-top:${notes ? "10px" : "0"};">Terms &amp; Conditions</div>
            <div>${escapeHtml(termsContent)}</div>` : ""}
        </div>` : "";

    // ── Signature ──
    const sigHtml = displayOptions.showSignatureBlock ? `
        <div class="info-card" style="margin-top:14px;">
            <div class="card-title">Authorisation</div>
            <div class="sig-grid">
                <div class="sig-line">Prepared By</div>
                <div class="sig-line">Approved By</div>
            </div>
        </div>` : "";

    // ── Footer ──
    const footerHtml = (footerContent && footerContent.trim())
        ? resolveCompanyVars(footerContent, companyProfile, logoUrl)
        : buildPageFooter(companyProfile.companyName, docNo, billBullLogo);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(`${title} — ${docNo}`)}</title>
    <style>${buildPageStyles(paperSize, orientation)}</style>
</head>
<body>
    ${headerHtml}
    ${infoRow}
    ${isVoucher ? paymentCard : itemsTableHtml}
    ${totalsHtml}
    ${notesHtml}
    ${sigHtml}
    ${footerHtml}
    ${buildWatermark(status)}
</body>
</html>`;
};

// ---------------------------------------------------------------------------
// GENERIC (Sales) document generator — same A4 reference layout
// ---------------------------------------------------------------------------

const mapPurchaseDataToGenericData = (template, data) => {
    if (!looksLikePurchasePayload(data)) return data;

    const headerMeta = Array.isArray(data.headerMeta) ? data.headerMeta.filter(r => r?.value) : [];
    const references = Array.isArray(data.references) ? data.references.filter(r => r?.value) : [];
    const paymentDetails = Array.isArray(data.paymentDetails) ? data.paymentDetails.filter(r => r?.value) : [];
    const totals = data.totals || {};
    const party = data.party || {};

    const dueDateRow = headerMeta.find(r => /due date|expected delivery|valid/i.test(asText(r.label)));
    const paymentTermRow = headerMeta.find(r => /payment term/i.test(asText(r.label)));
    const otherMeta = headerMeta.filter(r =>
        r !== dueDateRow && r !== paymentTermRow && !/status|voucher no/i.test(asText(r.label))
    );

    const buildSection = (title, rows) => {
        const content = rows.filter(r => r?.label && r?.value).map(r => `${r.label}: ${r.value}`).join("\n");
        return content ? `${title}\n${content}` : "";
    };

    const notes = [
        buildSection("Document Details", otherMeta),
        buildSection("References", references),
        buildSection("Payment Details", paymentDetails),
        asText(data.notes),
    ].filter(Boolean).join("\n\n");

    const mappedItems = Array.isArray(data.items) && data.items.length > 0
        ? data.items.map(item => ({
            name: item.name || item.description?.title || "Document Line",
            description: item.description || { title: item.name || "", details: item.desc ? [item.desc] : [] },
            image: item.image,
            unit: item.unit,
            qty: item.qty,
            price: item.price,
            taxableAmount: item.taxableAmount ?? (asNumber(item.price) * asNumber(item.qty)),
            taxAmt: item.taxAmt ?? item.tax ?? 0,
            taxPercent: item.taxPercent ?? item.taxRate ?? 0,
            total: item.total ?? item.lineAmount ?? 0,
            disc: item.disc ?? item.discount ?? 0,
        }))
        : [{
            name: data.title || "Payment",
            description: { title: data.title || "Payment", details: [] },
            unit: "",
            qty: 1,
            price: data.summaryAmount?.value ?? totals.grandTotal ?? 0,
            taxableAmount: data.summaryAmount?.value ?? totals.grandTotal ?? 0,
            taxAmt: 0,
            taxPercent: 0,
            total: data.summaryAmount?.value ?? totals.grandTotal ?? 0,
            disc: 0,
        }];

    return {
        title: data.title || "PURCHASE DOCUMENT",
        docNo: data.docNo || "",
        date: data.date || "",
        customer: {
            name: party.name || "Unknown Vendor",
            address: [party.address, party.email].filter(Boolean).join(", "),
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
            validTill: dueDateRow?.value || "",
            validTillLabel: dueDateRow?.label || "Due Date",
            partyLabel: template?.category === "Payment Voucher" ? "Paid To" : "Vendor Details",
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
    const { billBullLogo, companyProfile = {} } = options;
    const logoUrl = companyProfile.logoUrl || null;

    const {
        title = "DOCUMENT",
        docNo = "",
        date = "",
        customer = {},
        items = [],
        totals = {},
        meta = {},
    } = data;

    const currency = totals.currency || companyProfile.currencySymbol || "AED";
    const grandTotal = asNumber(totals.grandTotal);

    // ── Header ──
    const defaultHeader = `
        <div class="doc-header">
            <div class="header-left">
                ${companyProfile.phone ? `<div class="company-phone">${escapeHtml(companyProfile.phone)}</div>` : ""}
                <div class="meta-row">
                    <span class="meta-label">Date:</span>
                    <span class="meta-value">${escapeHtml(date || "-")}</span>
                </div>
                ${meta.validTill ? `<div class="meta-row">
                    <span class="meta-label">${escapeHtml(meta.validTillLabel || "Due Date")}:</span>
                    <span class="meta-value">${escapeHtml(meta.validTill)}</span>
                </div>` : ""}
                <div class="meta-row" style="margin-top:6px;">
                    <span class="meta-label" style="font-size:8pt;color:#9ca3af;">Ref No:</span>
                    <span class="meta-value" style="font-size:10pt;">${escapeHtml(docNo || "-")}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-value" style="font-size:13pt;font-weight:800;color:#0f172a;">${escapeHtml(title)}</span>
                </div>
            </div>
            <div class="header-right">
                ${displayOptions.showLogo && logoUrl ? `<div class="header-logo"><img src="${logoUrl}" alt="Logo" /></div>` : ""}
                ${displayOptions.showCompanyDetails !== false ? `
                <div class="company-name">${escapeHtml(companyProfile.companyName || "")}</div>
                <div class="company-detail">${escapeHtml(companyProfile.address || "")}</div>
                ${companyProfile.email ? `<div class="company-detail">${escapeHtml(companyProfile.email)}</div>` : ""}
                ${companyProfile.phone ? `<div class="company-detail">${escapeHtml(companyProfile.phone)}</div>` : ""}
                ${companyProfile.trn ? `<div class="company-detail">TRN: ${escapeHtml(companyProfile.trn)}</div>` : ""}
                ` : ""}
                ${grandTotal > 0 ? `
                <div class="balance-box">
                    <div class="balance-label">Balance</div>
                    <div class="balance-amount">${currency} ${grandTotal.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>` : ""}
            </div>
        </div>`;

    const headerHtml = (headerContent && headerContent.trim())
        ? resolveCompanyVars(headerContent, companyProfile, logoUrl)
        : defaultHeader;

    // ── Customer / Bill To ──
    const customerCard = displayOptions.showCustomerDetails ? `
        <div class="info-row">
            <div class="info-card">
                <div class="card-title">${escapeHtml(meta.partyLabel || "Bill To")}</div>
                <div class="party-name">${escapeHtml(customer.name || "Unknown Customer")}</div>
                <div class="party-detail">
                    ${customer.address ? `${escapeHtml(customer.address)}<br>` : ""}
                    ${customer.trn ? `TRN: ${escapeHtml(customer.trn)}<br>` : ""}
                    ${customer.phone ? `Phone: ${escapeHtml(customer.phone)}` : ""}
                </div>
            </div>
            <div class="info-card">
                <div class="card-title">Document Info</div>
                <div class="ref-grid">
                    ${meta.paymentTerm ? `<div class="ref-row"><div class="ref-label">Payment Term</div><div class="ref-value">${escapeHtml(meta.paymentTerm)}</div></div>` : ""}
                    ${meta.status ? `<div class="ref-row"><div class="ref-label">Status</div><div class="ref-value">${escapeHtml(meta.status)}</div></div>` : ""}
                </div>
            </div>
        </div>` : "";

    // ── Normalise items for the shared builder ──
    const normItems = items.map(item => ({
        ...item,
        description: item.description || { title: item.name || "", details: item.desc ? [item.desc] : [] },
        taxableAmount: item.taxableAmount ?? (asNumber(item.price) * asNumber(item.qty)),
        taxPercent: item.taxPercent ?? item.taxRate ?? item.tax ?? 0,
    }));

    // ── Column map: generic templates use different key names ──
    const colMap = {
        qty: columns.qty,
        unitPrice: columns.unitPrice,
        taxableAmount: true,
        tax: columns.tax,
        discount: columns.discount,
        total: columns.total,
    };

    const itemsTableHtml = buildItemsTable(normItems, colMap, displayOptions.showItemImage, totals, currency);
    const totalsHtml = columns.total !== false ? buildTotalsSection(totals, currency) : "";

    const notesHtml = (meta.notes || (displayOptions.showTerms && termsContent)) ? `
        <div class="notes-block">
            ${meta.notes ? `<div class="notes-title">Notes</div><div>${escapeHtml(meta.notes)}</div>` : ""}
            ${displayOptions.showTerms && termsContent ? `
            <div class="notes-title" style="margin-top:${meta.notes ? "10px" : "0"};">Terms &amp; Conditions</div>
            <div>${escapeHtml(termsContent)}</div>` : ""}
        </div>` : "";

    const footerHtml = (footerContent && footerContent.trim())
        ? resolveCompanyVars(footerContent, companyProfile, logoUrl)
        : buildPageFooter(companyProfile.companyName, docNo, billBullLogo);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(`${title} — ${docNo}`)}</title>
    <style>${buildPageStyles(paperSize, orientation)}</style>
</head>
<body>
    ${headerHtml}
    ${customerCard}
    ${itemsTableHtml}
    ${totalsHtml}
    ${notesHtml}
    ${footerHtml}
    ${buildWatermark(meta.status)}
</body>
</html>`;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

    // Force purchase renderer for purchase categories OR explicit layout variant
    if (
        displayOptions.layoutVariant === "purchase-modern-v1" ||
        PURCHASE_TEMPLATE_CATEGORIES.has(template?.category)
    ) {
        // If data already looks like a purchase payload, use purchase renderer directly
        if (looksLikePurchasePayload(data)) {
            return generatePurchasePrintHtml(template, data, options);
        }
        // Generic sales data going through purchase template — normalise first
        const normalised = mapPurchaseDataToGenericData(template, data);
        return generateGenericDocumentHtml(template, normalised, options);
    }

    return generateGenericDocumentHtml(template, data, options);
};

// ---------------------------------------------------------------------------
// Report print generator (Low Stock, Out of Stock, Stock on Hand, etc.)
// ---------------------------------------------------------------------------

/**
 * Generates HTML for a generic report table.
 */
export const generateReportPrintHtml = (_template, reportTitle, columns, data, companyProfile = {}) => {
    const date = new Date().toLocaleString();

    const pageStyles = `
        @page { size: A4 Landscape; margin: 20mm; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; line-height: 1.5; margin: 0; padding: 0; font-size: 10pt; }
        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; }
        .company-info h2 { margin: 0; font-size: 16pt; color: #111827; }
        .company-info p  { margin: 2px 0; font-size: 9pt; color: #64748b; }
        .report-title { text-align: right; }
        .report-title h1 { margin: 0; font-size: 20pt; color: #111827; }
        .report-title p  { margin: 4px 0 0; font-size: 10pt; color: #64748b; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f8fafc; text-align: left; padding: 10px; font-size: 8pt; text-transform: uppercase; color: #475569; font-weight: 700; border: 1px solid #e2e8f0; }
        td { padding: 10px; font-size: 9pt; border: 1px solid #e2e8f0; color: #334155; }
        .text-right { text-align: right; }
        .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; font-size: 8pt; color: #94a3b8; }
    `;

    const headers = columns.map(col => `<th>${escapeHtml(col.header)}</th>`).join("");
    const rows = data.map(item => `
        <tr>
            ${columns.map(col => {
                const val = item[col.key];
                return `<td class="${typeof val === "number" ? "text-right" : ""}">${val !== null && val !== undefined ? escapeHtml(String(val)) : "-"}</td>`;
            }).join("")}
        </tr>`).join("");

    return `<!DOCTYPE html>
<html lang="en">
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
</html>`;
};

// ---------------------------------------------------------------------------
// Print helper — opens a new window and triggers the browser print dialog.
// ---------------------------------------------------------------------------

/**
 * Opens a print window with the generated HTML.
 * @param {string} htmlContent - Full HTML string to print.
 */
export const printHtml = (htmlContent) => {
    const printWindow = window.open("", "_blank", "width=960,height=760");
    if (!printWindow) {
        alert("Pop-up blocked! Please allow pop-ups for this site.");
        return;
    }
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    // Give images / fonts time to load before triggering print
    printWindow.onload = () => {
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 300);
    };
    // Fallback in case onload already fired
    setTimeout(() => {
        if (printWindow && !printWindow.closed) {
            printWindow.focus();
            printWindow.print();
        }
    }, 800);
};
