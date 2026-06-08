// Shared print template builder for Journal Vouchers.
//
// The generic item-based template renderer (documentTemplateRenderer.js)
// doesn't fit accounting documents — JVs use debit/credit columns instead
// of qty/price/total. This module produces the print HTML for a JV and is
// used both by JournalVoucher.jsx (real print) and by the Print & Email
// Templates designer (live preview), so editing header/terms/footer in
// Settings updates both surfaces identically.

import { formatUserDisplayName } from './displayName';

const fmt = (n) =>
    Number(n || 0).toLocaleString('en-AE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const escapeHtml = (str = '') =>
    String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

// Header/terms/footer content can be plain text (with line breaks) or
// pre-formatted HTML. If it doesn't look like HTML, escape and convert
// newlines to <br>. Otherwise pass through.
const renderRichField = (content) => {
    if (!content) return '';
    const trimmed = String(content).trim();
    if (!trimmed) return '';
    if (/^<.+>/.test(trimmed)) return trimmed; // already HTML
    return escapeHtml(trimmed).replace(/\n/g, '<br/>');
};

export const STANDARD_JV_TERMS = `1. This Journal Voucher is system-generated and forms part of the official accounting record.
2. Once posted, this entry cannot be edited — a reversal voucher must be created instead.
3. Total debits must equal total credits; any imbalance blocks posting.
4. Supporting documents referenced under "Reference" should be retained per the company's record-retention policy.`;

/**
 * Build the print HTML for a Journal Voucher.
 *
 * @param {Object} jv       Journal voucher payload: { jvNumber, date, reference, narration,
 *                          status, preparedBy, postedBy, postedAt, lines: [{ accountCode, account,
 *                          costCenter, description, debit, credit }] }
 * @param {Object} options
 * @param {Object} [options.company]   { companyName, address, email, phone, trn, logoUrl }
 * @param {Object} [options.template]  PrintTemplate row — used for header/terms/footer/paperSize/orientation
 * @returns {string} full HTML document
 */
export const buildJournalVoucherPrintHtml = (jv = {}, { company = {}, template = null } = {}) => {
    const co = company || {};
    const lines = Array.isArray(jv.lines) ? jv.lines : [];
    const voucherNumber = jv.jvNumber || jv.entryNumber || jv.voucherId || jv.voucherNo || jv.reference || '';
    const preparedBy = formatUserDisplayName(jv.preparedBy || '');
    const postedBy = formatUserDisplayName(jv.postedBy || '');

    const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

    const paperSize = template?.paperSize || 'A4';
    const orientation = (template?.orientation || 'Portrait').toLowerCase();
    const pageSize = `${paperSize} ${orientation === 'landscape' ? 'landscape' : 'portrait'}`;

    const header = renderRichField(template?.headerContent);
    const terms = renderRichField(template?.termsContent || STANDARD_JV_TERMS);
    const footer = renderRichField(template?.footerContent);

    const rows = lines.length
        ? lines.map((l, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(l.accountCode || '')}</td>
                <td>${escapeHtml(l.account || '')}</td>
                <td>${escapeHtml(l.costCenter || '')}</td>
                <td>${escapeHtml(l.description || '')}</td>
                <td class="num">${parseFloat(l.debit) > 0 ? fmt(l.debit) : ''}</td>
                <td class="num">${parseFloat(l.credit) > 0 ? fmt(l.credit) : ''}</td>
            </tr>`).join('')
        : `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px;">No journal lines</td></tr>`;

    const statusLabel = jv.status || 'Draft';
    const statusClass = `status-${statusLabel.replace(/\s+/g, '')}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Journal Voucher ${escapeHtml(voucherNumber)}</title>
<style>
  @page { size: ${pageSize}; margin: 16mm 16mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1e293b; }
  .template-header { margin-bottom: 14px; font-size: 9pt; color: #475569; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; border-bottom: 2px solid #f5c742; padding-bottom: 12px; }
  .company { display: flex; gap: 12px; align-items: flex-start; }
  .company img.logo { width: 56px; height: 56px; object-fit: contain; }
  .company h2 { font-size: 14pt; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
  .company p { font-size: 8.5pt; color: #64748b; line-height: 1.5; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 18pt; font-weight: 800; color: #f5c742; letter-spacing: 1px; }
  .doc-title .jv-no { font-size: 10pt; font-weight: 700; color: #1e293b; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 16px; font-size: 9pt; }
  .meta span.label { color: #64748b; font-weight: 500; }
  .narration { background: #fef9ec; border: 1px solid #fde68a; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 9.5pt; }
  .narration b { color: #92400e; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead tr { background: #1e293b; color: #fff; }
  thead th { padding: 7px 9px; text-align: left; font-weight: 500; white-space: nowrap; }
  thead th.num { text-align: right; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 6px 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot tr { background: #f1f5f9; font-weight: 700; }
  tfoot td { padding: 7px 9px; border-top: 2px solid #cbd5e1; }
  .balance-row { background: ${balanced ? '#ecfdf5' : '#fef2f2'}; color: ${balanced ? '#047857' : '#b91c1c'}; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: 700; letter-spacing: 0.5px; }
  .status-Posted { background: #ede9fe; color: #6d28d9; }
  .status-Draft { background: #f1f5f9; color: #475569; }
  .status-Submitted, .status-PendingApproval, .status-Pending { background: #fef3c7; color: #92400e; }
  .status-Approved { background: #dcfce7; color: #166534; }
  .status-Rejected, .status-Voided { background: #fee2e2; color: #b91c1c; }
  .terms { margin-top: 18px; padding: 10px 12px; background: #f8fafc; border-left: 3px solid #f5c742; font-size: 8.5pt; color: #475569; white-space: pre-wrap; line-height: 1.5; }
  .terms h4 { font-size: 9pt; color: #1e293b; margin-bottom: 4px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; margin-top: 36px; }
  .sig-box { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 8.5pt; color: #475569; }
  .sig-box .who { font-weight: 700; color: #1e293b; }
  .footer { margin-top: 20px; text-align: center; font-size: 7.5pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .template-footer { margin-top: 8px; font-size: 8.5pt; color: #475569; text-align: center; }
</style>
</head>
<body>
  ${header ? `<div class="template-header">${header}</div>` : ''}
  <div class="header">
    <div class="company">
      ${co.logoUrl ? `<img class="logo" src="${escapeHtml(co.logoUrl)}" alt="Logo"/>` : ''}
      <div>
        <h2>${escapeHtml(co.companyName || co.name || 'Company Name')}</h2>
        <p>${escapeHtml(co.address || '')}</p>
        <p>${co.email ? 'Email: ' + escapeHtml(co.email) : ''}${co.phone ? ' | Tel: ' + escapeHtml(co.phone) : ''}</p>
        ${co.trn ? `<p>TRN: ${escapeHtml(co.trn)}</p>` : ''}
      </div>
    </div>
    <div class="doc-title">
      <h1>JOURNAL VOUCHER</h1>
      <div class="jv-no">${escapeHtml(voucherNumber)}</div>
      <div style="margin-top:6px"><span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span></div>
    </div>
  </div>

  <div class="meta">
    <div><span class="label">Date:</span> ${escapeHtml(jv.date || '')}</div>
    <div><span class="label">Reference:</span> ${escapeHtml(jv.reference || '—')}</div>
    <div><span class="label">Prepared By:</span> ${escapeHtml(preparedBy || '—')}</div>
    <div><span class="label">Posted By:</span> ${escapeHtml(postedBy || '—')}</div>
    ${jv.postedAt ? `<div><span class="label">Posted At:</span> ${escapeHtml(new Date(jv.postedAt).toLocaleString())}</div>` : ''}
  </div>

  ${jv.narration ? `<div class="narration"><b>Narration:</b> ${escapeHtml(jv.narration)}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Account Code</th>
        <th>Account</th>
        <th>Cost Centre</th>
        <th>Description</th>
        <th class="num">Debit</th>
        <th class="num">Credit</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="num" style="font-weight:700">Total</td>
        <td class="num">${fmt(totalDebit)}</td>
        <td class="num">${fmt(totalCredit)}</td>
      </tr>
      <tr class="balance-row">
        <td colspan="5" class="num" style="font-weight:700">${balanced ? 'BALANCED' : 'OUT OF BALANCE'}</td>
        <td colspan="2" class="num">${balanced ? '' : 'Difference: ' + fmt(Math.abs(totalDebit - totalCredit))}</td>
      </tr>
    </tfoot>
  </table>

  ${terms ? `<div class="terms"><h4>Terms & Notes</h4>${terms}</div>` : ''}

  <div class="signatures">
    <div class="sig-box">
      <div class="who">${escapeHtml(preparedBy || '—')}</div>
      Prepared By
    </div>
    <div class="sig-box">
      <div class="who">&nbsp;</div>
      Reviewed By
    </div>
    <div class="sig-box">
      <div class="who">${escapeHtml(postedBy || '—')}</div>
      Approved / Posted By
    </div>
  </div>

  ${footer ? `<div class="template-footer">${footer}</div>` : ''}
  <div class="footer">Generated by BillBull ERP &nbsp;|&nbsp; ${new Date().toLocaleString()}</div>
</body>
</html>`;
};

/** Sample JV used by the template designer's live preview. */
export const buildJournalVoucherPreviewData = () => ({
    jvNumber: 'JV-SAMPLE-0001',
    date: '2026-04-18',
    reference: 'INV-2026-0001 (Customer Receipt)',
    narration: 'Receipt of payment from Sample Customer LLC against Sales Invoice INV-2026-0001.',
    status: 'Posted',
    preparedBy: 'Demo Accountant',
    postedBy: 'Demo Finance Manager',
    postedAt: '2026-04-18T10:30:00Z',
    lines: [
        { accountCode: '1100', account: 'Cash on Hand',          costCenter: 'HQ',     description: 'Customer payment received',  debit: 5250.00, credit: 0 },
        { accountCode: '1200', account: 'Accounts Receivable',   costCenter: 'HQ',     description: 'Settle INV-2026-0001',       debit: 0,       credit: 5000.00 },
        { accountCode: '2101', account: 'VAT Output (5%)',       costCenter: 'HQ',     description: 'VAT collected',              debit: 0,       credit: 250.00 }
    ]
});
