// Print HTML renderer for the Financial voucher designer.
//
// Takes a voucher payload plus the saved PrintTemplate (whose `displayOptions`
// field holds the designer's settings JSON) and emits a print-ready HTML
// document that matches the on-screen preview in FinancialVoucherDesigner.
//
// Used by the print buttons on Journal/Payment/Receipt/Expense/Contra voucher
// pages so the template configured under Financials → Print & Email Templates
// drives the actual printout.

import { defaultVoucherSettings } from '../pages/Financials/FinancialVoucherDesigner';
import { resolveCurrencyDisplayConfig, UAE_DIRHAM_SYMBOL_IMAGE } from './countryCurrencyOptions';

const escapeHtml = (str = '') =>
    String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const fmt = (n) =>
    Number(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const renderCurrencyHtml = (currencyCode) => {
    const config = resolveCurrencyDisplayConfig({ currency: currencyCode });
    if (config.hasImage) {
        return `<img src="${UAE_DIRHAM_SYMBOL_IMAGE}" alt="${escapeHtml(config.ariaLabel)}" style="height:0.85em;width:auto;display:inline-block;vertical-align:-0.07em;" />`;
    }
    return escapeHtml(config.label);
};

const PAPER_DIMENSIONS = {
    A4: '210mm 297mm',
    A5: '148mm 210mm',
    Letter: '8.5in 11in',
};

// Resolve designer settings from a PrintTemplate row. The dashboard stuffs the
// settings JSON into `displayOptions`; legacy templates won't have it, in which
// case we synthesize defaults so a printout still renders.
export function resolveVoucherSettings(voucherType, template) {
    const defaults = defaultVoucherSettings(voucherType);
    if (!template) return defaults;
    let parsed = {};
    try {
        if (typeof template.displayOptions === 'string' && template.displayOptions.trim()) {
            parsed = JSON.parse(template.displayOptions);
        } else if (template.displayOptions && typeof template.displayOptions === 'object') {
            parsed = template.displayOptions;
        }
    } catch {
        parsed = {};
    }
    // Fall back to entity-level fields where the JSON didn't supply them.
    return {
        ...defaults,
        ...parsed,
        templateName: template.name || parsed.templateName || defaults.templateName,
        paperSize: parsed.paperSize || template.paperSize || defaults.paperSize,
        termsText: parsed.termsText || template.termsContent || defaults.termsText,
    };
}

// ─── Shared style block ───────────────────────────────────────────────────────

function pageStyles(s) {
    const gold = s.accentColor || '#F5C742';
    const paper = PAPER_DIMENSIONS[s.paperSize] || PAPER_DIMENSIONS.A4;
    return `
        @page { size: ${paper}; margin: 14mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: ${s.fontFamily || 'Inter, sans-serif'}; font-size: ${s.fontSize || 9}pt; color: #1e293b; background: #fff; }
        .doc { padding: 0; }
        .v-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 16px; }
        .v-header h1 { font-size: ${(s.fontSize || 9) + 17}pt; font-weight: 700; color: #1a1a2e; margin-bottom: 12px; letter-spacing: -0.5px; }
        .co-name { font-weight: 700; font-size: ${(s.fontSize || 9) + 1}pt; color: #1a1a2e; margin-bottom: 2px; }
        .co-line { font-size: ${(s.fontSize || 9) - 1}pt; color: #666; white-space: pre-line; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; min-width: 220px; align-self: flex-end; }
        .meta .lbl { font-size: ${(s.fontSize || 9) - 1}pt; color: #999; }
        .meta .val { font-size: ${(s.fontSize || 9) - 1}pt; font-weight: 500; color: #1a1a2e; }
        .logo { width: 72px; height: 72px; border-radius: 50%; border: 2px solid ${gold}; background: ${gold}15; display: flex; align-items: center; justify-content: center; font-size: 28pt; font-weight: 700; color: ${gold}; }
        .logo img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
        .divider { height: 2px; background: linear-gradient(90deg, ${gold}, ${gold}44); margin-bottom: 16px; border-radius: 1px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        th { background: ${gold}28; color: #1a1a2e; padding: 6px 9px; font-weight: 700; font-size: ${(s.fontSize || 9) - 0.5}pt; text-align: left; }
        th.num { text-align: right; }
        td { padding: 6px 9px; font-size: ${s.fontSize || 9}pt; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: monospace; }
        tr.totals { background: ${gold}1a; font-weight: 700; }
        tr.totals td { color: #1a1a2e; }
        .narration, .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: ${s.fontSize || 9}pt; }
        .narration b, .info-card b { font-weight: 500; color: #1a1a2e; margin-right: 6px; }
        .net-box { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .net-box .inner { border: 2px solid ${gold}; border-radius: 8px; padding: 10px 20px; text-align: right; min-width: 200px; }
        .net-box .lbl { font-size: ${(s.fontSize || 9) - 1}pt; color: #666; margin-bottom: 2px; }
        .net-box .amt { font-size: ${(s.fontSize || 9) + 6}pt; font-weight: 700; color: #1a1a2e; }
        .sigs { display: grid; gap: 16px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        .sig { text-align: center; }
        .sig .line { border-bottom: 1px solid #94a3b8; height: 32px; margin-bottom: 6px; }
        .sig .who { font-size: ${(s.fontSize || 9) - 1.5}pt; color: #888; }
        .stamp .ring { width: 56px; height: 56px; border-radius: 50%; border: 1.5px dashed #94a3b8; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; font-size: ${(s.fontSize || 9) - 2}pt; color: #94a3b8; }
        .terms { margin-top: 12px; padding-top: 10px; border-top: 1px solid #f1f5f9; font-size: ${(s.fontSize || 9) - 1.5}pt; color: #94a3b8; text-align: center; white-space: pre-wrap; }
        .words { margin-bottom: 14px; font-size: ${(s.fontSize || 9) - 0.5}pt; color: #666; }
        .words b { font-weight: 500; }
        .badge { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: ${(s.fontSize || 9) - 1}pt; font-weight: 500; }
    `;
}

// ─── Header block (shared) ────────────────────────────────────────────────────

function renderHeader(s, co, title, metaRows, claimantLabel = 'Prepared By', claimantValue = '') {
    const logoInner = co.logoUrl
        ? `<img src="${escapeHtml(co.logoUrl)}" alt=""/>`
        : (co.companyName || co.name || 'G').toString().trim().charAt(0).toUpperCase() || 'G';

    return `
        <div class="v-header">
            <div style="flex:1">
                <h1>${escapeHtml(title)}</h1>
                ${s.showCompanyName ? `<div class="co-name">${escapeHtml(co.companyName || co.name || '')}</div>` : ''}
                ${s.showCompanyAddress && co.address ? `<div class="co-line">${escapeHtml(co.address)}</div>` : ''}
                ${s.showCompanyPhone && co.phone ? `<div class="co-line">${escapeHtml(co.phone)}</div>` : ''}
                ${s.showCompanyEmail && co.email ? `<div class="co-line">${escapeHtml(co.email)}</div>` : ''}
                ${s.showTRN && co.trn ? `<div class="co-line">TRN · ${escapeHtml(co.trn)}</div>` : ''}
            </div>
            <div class="meta">
                ${metaRows.filter(([flag]) => s[flag]).map(([, label, value]) =>
                    `<span class="lbl">${escapeHtml(label)}</span><span class="val">${escapeHtml(value || '—')}</span>`
                ).join('')}
                ${s.showPreparedBy && claimantValue ? `<span class="lbl">${escapeHtml(claimantLabel)}</span><span class="val">${escapeHtml(claimantValue)}</span>` : ''}
            </div>
            ${s.showLogo ? `<div class="logo">${logoInner}</div>` : ''}
        </div>
        <div class="divider"></div>
    `;
}

function renderSignatures(s, slots) {
    const visible = slots.filter(Boolean);
    if (!visible.length) return '';
    const cols = visible.length;
    const cells = visible.map(slot => {
        if (slot === 'STAMP') return `<div class="sig stamp"><div class="ring">STAMP</div></div>`;
        return `<div class="sig"><div class="line"></div><div class="who">${escapeHtml(slot)}</div></div>`;
    }).join('');
    return `<div class="sigs" style="grid-template-columns: repeat(${cols}, 1fr);">${cells}</div>`;
}

function renderTerms(s) {
    if (!s.showTerms && !s.showPageNumbers) return '';
    return `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;font-size:${(s.fontSize||9)-1.5}pt;color:#94a3b8">
            <div style="flex:1;text-align:${s.showPageNumbers ? 'left' : 'center'};white-space:pre-wrap">${s.showTerms ? escapeHtml(s.termsText) : ''}</div>
            ${s.showPageNumbers ? `<div style="text-align:right;white-space:nowrap;margin-left:16px">Page <span class="page-num">1</span> of <span class="page-total">1</span></div>` : ''}
        </div>
    `;
}

function wrap(title, s, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title><style>${pageStyles(s)}</style></head>
<body><div class="doc">${body}</div></body>
</html>`;
}

// ─── Per-type renderers ───────────────────────────────────────────────────────

function renderJournal(s, co, jv) {
    const lines = Array.isArray(jv.lines) ? jv.lines : [];
    const totalDr = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    const totalCr = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    const voucherNo = jv.jvNumber || jv.entryNumber || jv.voucherNo || jv.reference || '';
    const totalColSpan = (s.showAccountCode ? 1 : 0) + 2 + (s.showCostCenter ? 1 : 0);
    const emptyColspan = totalColSpan + 2;

    const header = renderHeader(s, co, 'JOURNAL VOUCHER', [
        ['showVoucherNumber', 'Voucher No.', voucherNo],
        ['showVoucherDate', 'Date', jv.date],
        ['showReference', 'Reference', jv.reference],
        ['showBranch', 'Branch', jv.branch || 'Main'],
        ['showCurrency', 'Currency', jv.currency || 'AED'],
    ], 'Prepared By', jv.preparedBy);

    const rows = lines.length
        ? lines.map((l, i) => `
            <tr>
                ${s.showAccountCode ? `<td style="color:#999">${i + 1}</td>` : ''}
                <td style="font-weight:600;color:#1a1a2e">${escapeHtml(l.accountCode ? `${l.accountCode} - ${l.account || ''}` : (l.account || ''))}</td>
                <td style="color:#555">${escapeHtml(l.description || '')}</td>
                ${s.showCostCenter ? `<td style="color:#4f46e5;font-weight:500">${escapeHtml(l.costCenter || '')}</td>` : ''}
                <td class="num" style="color:${parseFloat(l.debit) > 0 ? '#166534' : '#aaa'}">${parseFloat(l.debit) > 0 ? fmt(l.debit) : '—'}</td>
                <td class="num" style="color:${parseFloat(l.credit) > 0 ? '#991b1b' : '#aaa'}">${parseFloat(l.credit) > 0 ? fmt(l.credit) : '—'}</td>
            </tr>`).join('')
        : `<tr><td colspan="${emptyColspan}" style="text-align:center;color:#94a3b8;padding:20px;">No journal lines</td></tr>`;

    const body = `
        ${header}
        <table>
            <thead><tr>
                ${s.showAccountCode ? '<th>#</th>' : ''}
                <th style="width:35%">Account</th>
                <th>Description / Narration</th>
                ${s.showCostCenter ? '<th>Cost Center</th>' : ''}
                <th class="num">Debit (${renderCurrencyHtml(jv.currency)})</th>
                <th class="num">Credit (${renderCurrencyHtml(jv.currency)})</th>
            </tr></thead>
            <tbody>
                ${rows}
                <tr class="totals">
                    <td colspan="${totalColSpan}">TOTAL</td>
                    <td class="num" style="color:#166534">${s.showTotalDebit ? fmt(totalDr) : ''}</td>
                    <td class="num" style="color:#991b1b">${s.showTotalCredit ? fmt(totalCr) : ''}</td>
                </tr>
            </tbody>
        </table>
        ${s.showNarration && jv.narration ? `<div class="narration"><b>Narration:</b>${escapeHtml(jv.narration)}</div>` : ''}
        ${s.showAmountInWords && jv.amountInWords ? `<div class="words"><b>Amount in Words: </b>${escapeHtml(jv.amountInWords)}</div>` : ''}
        ${s.showNetAmount ? `<div style="display:flex;justify-content:flex-end;margin-bottom:16px"><div style="text-align:right"><div style="font-size:${(s.fontSize||9)-1}pt;color:#666;margin-bottom:2px">Total Amount</div><div style="font-size:${(s.fontSize||9)+6}pt;font-weight:700;color:#1a1a2e">${renderCurrencyHtml(jv.currency)} ${fmt(totalDr)}</div></div></div>` : ''}
        ${renderSignatures(s, [
            s.showPreparedBySign && 'Prepared By',
            s.showCheckedBySign && 'Checked By',
            s.showApprovedBySign && 'Approved By',
            s.showCompanyStamp && 'STAMP',
        ])}
        ${renderTerms(s)}
    `;
    return wrap(`Journal Voucher ${voucherNo}`, s, body);
}

function renderExpense(s, co, ev) {
    const items = Array.isArray(ev.items) ? ev.items : [];
    const total = items.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const voucherNo = ev.voucherNumber || ev.id || '';
    const colSpanTotal = 3 + (s.showCostCenter ? 1 : 0) + (s.showAccountCode ? 1 : 0);

    const header = renderHeader(s, co, 'EXPENSE VOUCHER', [
        ['showVoucherNumber', 'Voucher No.', voucherNo],
        ['showVoucherDate', 'Date', ev.date],
        ['showReference', 'Reference', ev.reference],
        ['showBranch', 'Branch', ev.branch || 'Main'],
        ['showCurrency', 'Currency', ev.currency || 'AED'],
    ], 'Claimant', ev.claimant || ev.preparedBy);

    const rows = items.length
        ? items.map((it, i) => `
            <tr style="background:${i % 2 ? '#fafafa' : '#fff'}">
                <td style="color:#999">${i + 1}</td>
                ${s.showAccountCode ? `<td style="color:#666;font-size:${(s.fontSize || 9) - 0.5}pt">${escapeHtml(it.accountCode || '—')}</td>` : ''}
                <td style="font-weight:500;color:#1a1a2e">${escapeHtml(it.description || '')}</td>
                <td><span class="badge" style="background:${s.accentColor}22;color:#92400e">${escapeHtml(it.category || '—')}</span></td>
                ${s.showCostCenter ? `<td style="color:#4f46e5;font-weight:500">${escapeHtml(it.costCenter || '')}</td>` : ''}
                <td class="num" style="font-weight:600;color:#1a1a2e">${fmt(it.amount)}</td>
            </tr>`).join('')
        : `<tr><td colspan="${colSpanTotal + 1}" style="text-align:center;color:#94a3b8;padding:20px;">No expense lines</td></tr>`;

    const body = `
        ${header}
        ${ev.paymentMode || ev.paymentAccount ? `
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:14px">
                <div style="padding:8px 12px;background:#f8fafc;border-right:1px solid #e2e8f0"><div style="font-size:${(s.fontSize||9)-1.5}pt;color:#999;text-transform:uppercase;margin-bottom:2px">Payment Mode</div><div style="font-weight:700;color:#1a1a2e">${escapeHtml(ev.paymentMode || '—')}</div></div>
                <div style="padding:8px 12px;background:#f8fafc;border-right:1px solid #e2e8f0"><div style="font-size:${(s.fontSize||9)-1.5}pt;color:#999;text-transform:uppercase;margin-bottom:2px">Payment Account</div><div style="font-weight:600;color:#1a1a2e">${escapeHtml(ev.paymentAccount || '—')}</div></div>
                <div style="padding:8px 12px;background:#f8fafc"><div style="font-size:${(s.fontSize||9)-1.5}pt;color:#999;text-transform:uppercase;margin-bottom:2px">Voucher Date</div><div style="font-weight:600;color:#1a1a2e">${escapeHtml(ev.date || '—')}</div></div>
            </div>` : ''}
        <table>
            <thead><tr>
                <th style="width:24px">#</th>
                ${s.showAccountCode ? '<th>Account Code</th>' : ''}
                <th>Expense Description</th>
                <th>Category</th>
                ${s.showCostCenter ? '<th>Cost Center</th>' : ''}
                <th class="num">Amount (${renderCurrencyHtml(ev.currency)})</th>
            </tr></thead>
            <tbody>
                ${rows}
                <tr class="totals"><td colspan="${colSpanTotal}" style="text-transform:uppercase;letter-spacing:0.3px">Total Expense</td><td class="num">${fmt(total)}</td></tr>
            </tbody>
        </table>
        ${s.showNarration && ev.narration ? `<div class="narration"><b>Narration:</b>${escapeHtml(ev.narration)}</div>` : ''}
        ${s.showAmountInWords && ev.amountInWords ? `<div class="words"><b>Amount in Words: </b>${escapeHtml(ev.amountInWords)}</div>` : ''}
        ${s.showNetAmount ? `<div style="display:flex;justify-content:flex-end;margin-bottom:16px"><div style="text-align:right"><div style="font-size:${(s.fontSize||9)-1}pt;color:#666;margin-bottom:2px">Net Amount Claimed</div><div style="font-size:${(s.fontSize||9)+6}pt;font-weight:700;color:#1a1a2e">${renderCurrencyHtml(ev.currency)} ${fmt(total)}</div></div></div>` : ''}
        ${renderSignatures(s, [
            s.showPreparedBySign && 'Claimant',
            s.showCheckedBySign && 'Verified By',
            s.showApprovedBySign && 'Approved By',
            s.showReceivedBySign && 'Received By',
            s.showCompanyStamp && 'STAMP',
        ])}
        ${renderTerms(s)}
    `;
    return wrap(`Expense Voucher ${voucherNo}`, s, body);
}

function renderReceiptPayment(s, co, rv, mode) {
    const isReceipt = mode === 'receipt';
    const title = isReceipt ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER';
    const voucherNo = rv.voucherNumber || rv.id || rv.paymentNumber || '';
    const invoices = Array.isArray(rv.invoices) ? rv.invoices : (rv.linkedInvoice ? [{
        ref: rv.linkedInvoice,
        date: rv.invoiceDate || rv.date,
        total: rv.amount,
        paid: rv.amount,
    }] : []);

    const header = renderHeader(s, co, title, [
        ['showVoucherNumber', 'Voucher No.', voucherNo],
        ['showVoucherDate', 'Date', rv.date],
        ['showReference', 'Reference', rv.reference || rv.chequeRef || ''],
        ['showBranch', 'Branch', rv.branch || 'Main'],
        ['showCurrency', 'Currency', rv.currency || 'AED'],
    ], 'Prepared By', rv.preparedBy);

    const invRows = invoices.length
        ? invoices.map(inv => `
            <tr>
                <td style="font-family:monospace;font-weight:600;color:#1e40af">${escapeHtml(inv.ref || '')}</td>
                <td style="color:#555">${escapeHtml(inv.date || '')}</td>
                <td class="num">${fmt(inv.total)}</td>
                <td class="num" style="font-weight:600;color:#166534">${fmt(inv.paid)}</td>
            </tr>`).join('')
        : '';

    const body = `
        ${header}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:14px">
            <div>
                <div style="font-size:${(s.fontSize||9)-1.5}pt;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">${isReceipt ? 'Received From' : 'Paid To'}</div>
                <div style="font-weight:700;font-size:${(s.fontSize||9)+1}pt;color:#1a1a2e">${escapeHtml(rv.party || '—')}</div>
                ${rv.partyCode ? `<div style="font-size:${(s.fontSize||9)-1}pt;color:#666">Code: ${escapeHtml(rv.partyCode)}</div>` : ''}
            </div>
            <div>
                <div style="font-size:${(s.fontSize||9)-1.5}pt;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Payment Mode</div>
                <div style="font-weight:600;color:#1a1a2e">${escapeHtml(rv.mode || '—')}</div>
                ${s.showBankDetails && (rv.bank || s.bankName || co.bankName) ? `
                    <div style="font-size:${(s.fontSize||9)-1}pt;color:#666;margin-top:2px;display:flex;flex-direction:column;gap:1px">
                        <div>Bank: ${escapeHtml(rv.bank || s.bankName || co.bankName)}</div>
                        ${(s.bankAccountNumber || co.bankAccountNumber) ? `<div>A/C: ${escapeHtml(s.bankAccountNumber || co.bankAccountNumber)}</div>` : ''}
                        ${(s.bankIban || co.bankIban) ? `<div>IBAN: ${escapeHtml(s.bankIban || co.bankIban)}</div>` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
        ${invRows ? `
            <table>
                <thead><tr><th>Invoice Ref.</th><th>Date</th><th class="num">Invoice Total</th><th class="num">${isReceipt ? 'Received' : 'Paid'}</th></tr></thead>
                <tbody>${invRows}</tbody>
            </table>` : ''}
        ${s.showNarration && rv.narration ? `<div class="narration"><b>Narration:</b>${escapeHtml(rv.narration)}</div>` : ''}
        ${s.showAmountInWords && rv.amountInWords ? `<div class="words"><b>Amount in Words: </b>${escapeHtml(rv.amountInWords)}</div>` : ''}
        ${s.showNetAmount ? `<div class="net-box"><div class="inner"><div class="lbl">Total ${isReceipt ? 'Received' : 'Paid'}</div><div class="amt">${renderCurrencyHtml(rv.currency)} ${fmt(rv.amount)}</div></div></div>` : ''}
        ${renderSignatures(s, [
            s.showPreparedBySign && 'Prepared By',
            s.showCheckedBySign && 'Checked By',
            s.showApprovedBySign && 'Approved By',
            s.showReceivedBySign && (isReceipt ? 'Received By' : 'Acknowledged By'),
        ])}
        ${renderTerms(s)}
    `;
    return wrap(`${title} ${voucherNo}`, s, body);
}

function renderContra(s, co, cv) {
    const entries = Array.isArray(cv.entries) ? cv.entries : [];
    const total = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) / 2 || cv.amount || 0;
    const voucherNo = cv.voucherNumber || cv.id || '';

    const header = renderHeader(s, co, 'CONTRA VOUCHER', [
        ['showVoucherNumber', 'Voucher No.', voucherNo],
        ['showVoucherDate', 'Date', cv.date],
        ['showBranch', 'Branch', cv.branch || 'Main'],
    ], 'Prepared By', cv.preparedBy);

    const cards = entries.map((entry, i) => {
        const isDr = (entry.type || '').toString().toUpperCase() === 'DR';
        return `
            <div style="border:2px solid ${isDr ? '#16653422' : '#991b1b22'};border-radius:8px;padding:12px;background:${isDr ? '#f0fdf4' : '#fff1f2'}">
                <div style="font-size:${(s.fontSize||9)-1.5}pt;font-weight:700;color:${isDr ? '#166534' : '#991b1b'};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${isDr ? 'Debit (To)' : 'Credit (From)'}</div>
                <div style="font-weight:700;color:#1a1a2e;margin-bottom:2px">${escapeHtml(entry.account || '')}</div>
                <div style="font-family:monospace;font-weight:700;font-size:${(s.fontSize||9)+3}pt;color:${isDr ? '#166534' : '#991b1b'}">${renderCurrencyHtml(cv.currency)} ${fmt(entry.amount)}</div>
            </div>`;
    }).join('');

    const body = `
        ${header}
        <div style="background:${s.accentColor}12;border:1px solid ${s.accentColor}44;border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
            <div style="font-weight:700;color:#92400e;font-size:${(s.fontSize||9)-0.5}pt;text-transform:uppercase;letter-spacing:0.5px">Transfer Type:</div>
            <div style="font-weight:600;color:#1a1a2e">${escapeHtml(cv.transferType || 'Cash to Cash')}</div>
            <div style="margin-left:auto;font-weight:700;font-size:${(s.fontSize||9)+3}pt;color:#1a1a2e">${renderCurrencyHtml(cv.currency)} ${fmt(total)}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">${cards}</div>
        ${s.showNarration && cv.narration ? `<div class="narration"><b>Narration:</b>${escapeHtml(cv.narration)}</div>` : ''}
        ${s.showAmountInWords && cv.amountInWords ? `<div class="words"><b>Amount in Words: </b>${escapeHtml(cv.amountInWords)}</div>` : ''}
        ${renderSignatures(s, [
            s.showPreparedBySign && 'Prepared By',
            s.showCheckedBySign && 'Checked By',
            s.showApprovedBySign && 'Approved By',
            s.showCompanyStamp && 'STAMP',
        ])}
        ${renderTerms(s)}
    `;
    return wrap(`Contra Voucher ${voucherNo}`, s, body);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build print HTML for a financial voucher using the designer template's
 * settings. Falls back to default settings if no template is provided.
 *
 * @param {string} voucherType  one of journal-voucher / expense-voucher / receipt-voucher / payment-voucher / contra-voucher
 * @param {Object} data         voucher payload (shape depends on type — see per-type renderers)
 * @param {Object} options
 * @param {Object} [options.company]   { companyName, address, email, phone, trn, logoUrl }
 * @param {Object} [options.template]  PrintTemplate row from the backend
 * @returns {string} full HTML document
 */
export function buildFinancialVoucherPrintHtml(voucherType, data = {}, { company = {}, template = null } = {}) {
    const s = resolveVoucherSettings(voucherType, template);
    switch (voucherType) {
        case 'journal-voucher': return renderJournal(s, company, data);
        case 'expense-voucher': return renderExpense(s, company, data);
        case 'receipt-voucher': return renderReceiptPayment(s, company, data, 'receipt');
        case 'payment-voucher': return renderReceiptPayment(s, company, data, 'payment');
        case 'contra-voucher':  return renderContra(s, company, data);
        default: return wrap('Voucher', s, '<p style="padding:20px;color:#94a3b8">Unsupported voucher type</p>');
    }
}
