// Shared, pure view-model builders for POS X-Report / Z-Report rendering.
//
// Extracted from POSSales.jsx (buildXReportViewModel / buildZReportViewModel) so the
// live cashier report screen and the back-office "POS Reports" historical viewer render
// the exact same output from the exact same input shape — no duplicated rendering logic,
// no recomputation. Both callers pass the raw report payload (the same map shape the
// backend returns from PosSessionService.getXReport/getZReport, and the same shape
// persisted verbatim into PosXReportSnapshot.reportJson / PosDayClose.zReportJson) plus
// a small `opts` object carrying purely presentational/live-editable context (currency,
// in-progress denomination counts before a session/day is closed) that has no persisted
// home in the report JSON itself.
//
// IMPORTANT: this module must stay a pure function of its inputs. Do not import any
// React state/context here — the whole point is that historical snapshot rendering and
// live rendering can never diverge.

export const parseUTCDate = (ts) => {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  let s = String(ts);
  const tIdx = s.indexOf('T');
  if (tIdx !== -1 && !s.endsWith('Z')) {
    const timePart = s.slice(tIdx);
    if (!timePart.includes('+') && !timePart.includes('-')) {
      s += 'Z';
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export const calculateDenominationTotal = (denom) => {
  if (!denom || typeof denom !== 'object') return 0;
  return Object.entries(denom).reduce((total, [note, count]) => {
    return total + (parseFloat(note) * (Number(count) || 0));
  }, 0);
};

const DENOM_KEYS = ['1000', '500', '200', '100', '50', '20', '10', '5', '1', '0.50', '0.25'];
const DENOM_LABELS = {
  '1000': 'AED 1000', '500': 'AED 500', '200': 'AED 200', '100': 'AED 100', '50': 'AED 50',
  '20': 'AED 20', '10': 'AED 10', '5': 'AED 5', '1': 'AED 1 Coin', '0.50': 'AED 0.50 Coin', '0.25': 'AED 0.25 Coin',
};

const fmtTs = (t) => {
  const d = parseUTCDate(t);
  if (!d) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return '0m';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/** Resolves the closing-denominations object for an X-Report: the session's own
 *  persisted count if present (always true for a closed/historical session), falling
 *  back to `opts.liveDenominations` (in-progress counts entered by the cashier before
 *  the session has actually been closed — only relevant to the live POS screen). */
const resolveDenominations = (xReportData, opts) => {
  const raw = xReportData?.sessionInfo?.closingDenominationsJson
    || xReportData?.session?.closingDenominationsJson;
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (err) {
      console.warn('Unable to parse closing denominations', err);
    }
  }
  return opts?.liveDenominations || {};
};

/** Builds the A4/thermal print view-model for an X-Report. `xReportData` is the raw
 *  payload from `GET /api/pos/sessions/{id}/x-report` (live) or a
 *  `PosXReportSnapshot.reportJson` (historical, parsed) — identical shape either way.
 *  `opts`: { currency, liveDenominations, liveCardBatchNo, liveCardVerified } — all
 *  optional; only relevant while a session is still open (live preview) since a closed
 *  session's own persisted fields (session.cardBatchNo etc.) always take precedence. */
export function buildXReportViewModel(xReportData, opts = {}) {
  const currency = opts.currency || 'AED';
  const fmt = (n) => `${currency} ${Number(n || 0).toFixed(2)}`;

  const xSummary = xReportData?.summary || {};
  const sess = xReportData?.session || null;
  const openingCashVal = Number(xSummary.openingCash ?? sess?.openingCash ?? 0);
  const cashSalesV = Number(xSummary.cashSales ?? 0);
  const cardSalesV = Number(xSummary.cardSales ?? 0);
  const creditSalesV = Number(xSummary.creditSales ?? 0);
  const bankTransferSalesV = Number(xSummary.bankTransferSales ?? 0);
  const totalSalesV = Number(xSummary.totalSales ?? 0);
  const totalTaxV = Number(xSummary.totalTax ?? 0);
  const salesExTaxV = Number(xSummary.salesAmountExTax ?? 0);
  const discountV = Number(xSummary.totalDiscount ?? 0);
  const cashDropIn = Number(xSummary.cashDropIn ?? 0);
  const cashDropOut = Number(xSummary.cashDropOut ?? 0);
  const invoiceCount = xSummary.invoiceCount ?? sess?.invoiceCount ?? 0;
  const cashPosition = xSummary.cashPosition || {};
  const cpDropRows = Array.isArray(cashPosition.cashDropRows) ? cashPosition.cashDropRows : [];
  const cpRefundsSupported = cashPosition.cashRefundsSupported === true;
  const cpNet = Number(cashPosition.netCashPosition ?? (openingCashVal + cashSalesV + cashDropIn - cashDropOut));
  const expectedCashVal = Number(xSummary.expectedCash ?? (openingCashVal + cashSalesV + cashDropIn - cashDropOut));
  const reportDenominations = resolveDenominations(xReportData, opts);
  const actualCash = calculateDenominationTotal(reportDenominations);
  const cashVariance = actualCash - expectedCashVal;
  const varStatus = actualCash === 0 ? 'Pending Count' : Math.abs(cashVariance) < 0.01 ? 'Balanced' : cashVariance < 0 ? 'Short' : 'Excess';
  const sessId = sess?.id;
  const reportNo = xReportData?.reportNumber || (sessId ? `XR-${String(sessId).padStart(9, '0')}` : '—');

  const cardPayCount = Number(xSummary.cardInvoiceCount ?? 0);
  const refundTotal = Number(xSummary.totalRefunds ?? 0);
  const totalRefundCount = Number(xSummary.totalRefundCount ?? 0);
  const cardRefundTotal = Number(xSummary.cardRefundSales ?? 0);
  const cardRefundCount = Number(xSummary.cardRefundCount ?? 0);
  const netCardSettle = cardSalesV - cardRefundTotal;
  const netCardCount = Math.max(0, cardPayCount - cardRefundCount);
  const cardTypeBreakdown = Array.isArray(xSummary.cardTypeBreakdown) ? xSummary.cardTypeBreakdown : [];
  const itemsSoldCount = Number(xSummary.totalItemsSold ?? 0);
  const postedVoids = Array.isArray(xReportData?.voids) ? xReportData.voids : [];
  const cartRemovals = Array.isArray(xReportData?.cartRemovals) ? xReportData.cartRemovals : [];
  const cashierRows = Array.isArray(xReportData?.cashiers) ? xReportData.cashiers : [];
  const totalPaidV = Number(xSummary.totalPaid ?? totalSalesV);
  const voidAmountV = Number(xSummary.voidAmount ?? 0);
  const sessInfo = xReportData?.sessionInfo || {};
  const cardBatchNo = sessInfo.cardBatchNo || sess?.cardBatchNo || opts.liveCardBatchNo || '—';
  const cardVerified = sessInfo.cardSettlementVerified ?? sess?.cardSettlementVerified ?? opts.liveCardVerified;
  const durationSeconds = sessInfo.durationSeconds ?? sess?.durationSeconds
    ?? ((sess?.openedAt && sess?.closedAt)
      ? Math.max(0, Math.floor((parseUTCDate(sess.closedAt).getTime() - parseUTCDate(sess.openedAt).getTime()) / 1000))
      : null);

  return {
    reportTitle: 'X-Report / Session Close Report',
    note: `Report No: ${reportNo}  |  Cashier: ${sess?.openedBy || '—'}  |  Session: SESS-${String(sessId || 0).padStart(6, '0')}  |  Date: ${sess?.sessionDate || new Date().toISOString().slice(0, 10)}`,
    reportMeta: [
      { label: 'Report No', value: reportNo },
      { label: 'Session No', value: sessInfo.sessionNo || `SESS-${String(sessId || 0).padStart(6, '0')}` },
      { label: 'Cashier', value: sessInfo.cashier || sess?.openedBy || '-' },
      { label: 'Date & Time', value: new Date().toLocaleString() },
      { label: 'Business Date', value: sess?.sessionDate || new Date().toISOString().slice(0, 10) },
      { label: 'Terminal', value: sessInfo.terminalId || sess?.terminalId || '-' },
    ],
    kpis: [
      { label: 'Opening Cash', value: fmt(openingCashVal), hint: 'Float', icon: 'OC' },
      { label: 'Total Sales', value: fmt(totalSalesV), hint: 'Inc. VAT', icon: 'TS' },
      { label: 'Cash Sales', value: fmt(cashSalesV), hint: 'Cash payments', icon: 'CS' },
      { label: 'Card Sales', value: fmt(cardSalesV), hint: 'Card payments', icon: 'CA' },
      { label: 'Credit Sales', value: fmt(creditSalesV), hint: 'Credit invoices', icon: 'CR' },
      { label: 'Online / Bank Transfer', value: fmt(bankTransferSalesV), hint: 'Online payments', icon: 'OB' },
      { label: 'Returns', value: fmt(refundTotal), hint: 'Refunds / returns', icon: 'RT' },
      { label: 'Discounts', value: fmt(discountV), hint: 'Bill and line discounts', icon: 'DS' },
      { label: 'Expected Cash', value: fmt(expectedCashVal), hint: 'Opening + cash sales', icon: 'EC' },
      { label: 'Actual Cash', value: fmt(actualCash), hint: 'Denomination count', icon: 'AC' },
      { label: 'Cash Variance', value: fmt(Math.abs(cashVariance)), hint: varStatus, icon: 'CV' },
    ],
    sections: [
      {
        title: '0. Session Information', type: 'table',
        cols: ['Field', 'Value'],
        rows: [
          ['Session No.', sessInfo.sessionNo || `SESS-${String(sessId || 0).padStart(6, '0')}`],
          ['Branch', sessInfo.branch || sess?.branchName || '—'],
          ['Terminal', sessInfo.terminalId || sess?.terminalId || '—'],
          ['Counter', sessInfo.counter || sess?.counterName || '—'],
          ['Device', sessInfo.device || '—'],
          ...(sessInfo.deviceInfo ? [['Device Info', sessInfo.deviceInfo.substring(0, 48)]] : []),
          ['Shift', sessInfo.shift || '—'],
          ['Cashier', sessInfo.cashier || sess?.openedBy || '—'],
          ['Opened At', fmtTs(sessInfo.openedAt || sess?.openedAt)],
          ['Closed At', fmtTs(sessInfo.closedAt || sess?.closedAt)],
          ['Duration', fmtDuration(durationSeconds)],
        ],
      },
      {
        title: '1. Denomination Count', type: 'table',
        cols: ['Denomination', 'Quantity', 'Total Amount'],
        rows: DENOM_KEYS.map(k => [DENOM_LABELS[k], String(reportDenominations[k] || 0), fmt((reportDenominations[k] || 0) * parseFloat(k))]),
        footer: ['Total Cash Counted', '', fmt(actualCash)],
      },
      {
        title: '2. Cash Drawer Summary', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [
          ['Opening Cash / Float', fmt(openingCashVal)],
          ['Cash Sales', fmt(cashSalesV)],
          ['Cash Drop In', fmt(cashDropIn)],
          ['Cash Drop Out', fmt(cashDropOut)],
          ['Expected Cash in Drawer', fmt(expectedCashVal)],
          ['Actual Cash Counted', fmt(actualCash)],
        ],
        footer: ['Cash Variance (' + varStatus + ')', fmt(Math.abs(cashVariance))],
      },
      {
        title: '2a. Consolidated Cash Position (Informational)', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [
          ['Opening Cash', fmt(openingCashVal)],
          ['Cash Sales', fmt(cashSalesV)],
          ['Customer Receipts (Cash)', 'Not available in X-Report (no session linkage yet)'],
          ['Customer Advances (Cash)', 'Not available in X-Report (no session linkage yet)'],
          ['Cash Drop In', fmt(cashDropIn)],
          ['Cash Refunds (Cash)', cpRefundsSupported ? fmt(cashPosition.cashRefundsTotal ?? 0) : 'Not available — refund payment mode not tracked'],
          ['Cash Drop Out', cashDropOut > 0 ? `(${fmt(cashDropOut)})` : fmt(0)],
        ],
        footer: ['Net Cash Position', fmt(cpNet)],
      },
      {
        title: '2b. Cash Drop / Cash Out', type: 'table',
        cols: ['Sl No', 'Type', 'Amount'],
        rows: cpDropRows.length
          ? cpDropRows.map(r => [String(r.slNo ?? ''), r.type || '—', fmt(Number(r.amount ?? 0))])
          : [['—', 'No cash drops recorded', fmt(0)]],
        footer: ['', 'Total', fmt(cashDropIn - cashDropOut)],
      },
      {
        title: '3. Payment / Tender Summary', type: 'table',
        cols: ['Payment Mode', 'Count', 'Amount'],
        rows: [
          ['Cash', String(xSummary.cashInvoiceCount ?? '—'), fmt(cashSalesV)],
          ['Card', String(xSummary.cardInvoiceCount ?? '—'), fmt(cardSalesV)],
          ['Credit', String(xSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
          ...((xSummary.otherSales ?? 0) > 0
            ? [['Online', String(xSummary.otherInvoiceCount ?? '—'), fmt(xSummary.otherSales)]]
            : []),
        ],
        footer: ['Total Collected', String(xSummary.totalTenderCount ?? invoiceCount), fmt(totalPaidV)],
      },
      {
        title: '4. Card / Bank Settlement Summary', type: 'table',
        cols: ['Description', 'Count', 'Amount'],
        rows: [
          ...cardTypeBreakdown.map(row => [row.cardType, String(row.count ?? 0), fmt(row.amount ?? 0)]),
          ['Card Sales', String(cardPayCount), fmt(cardSalesV)],
          ['Card Refunds', String(cardRefundCount), cardRefundTotal > 0 ? `(${fmt(cardRefundTotal)})` : fmt(0)],
          ['Net Card Settlement', String(netCardCount), fmt(netCardSettle)],
          ['Card Machine Batch No.', cardBatchNo, ''],
          ['Card Settlement Verified', cardVerified ? 'Yes' : 'No', ''],
        ],
      },
      {
        title: '5. Invoice / Transaction Summary', type: 'table',
        cols: ['Description', 'Count', 'Amount'],
        rows: [
          ['Total Invoices', String(invoiceCount), fmt(totalSalesV)],
          ['Cash Invoices', String(xSummary.cashInvoiceCount ?? '—'), fmt(cashSalesV)],
          ['Card Invoices', String(xSummary.cardInvoiceCount ?? '—'), fmt(cardSalesV)],
          ['Credit Invoices', String(xSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
        ],
      },
      {
        title: '6. VAT / Tax Summary', type: 'table',
        cols: ['Tax Type', 'Taxable Amount', 'Tax Amount', 'Total Amount'],
        rows: [['VAT 5%', fmt(salesExTaxV), fmt(totalTaxV), fmt(totalSalesV)]],
        footer: ['Total', fmt(salesExTaxV), fmt(totalTaxV), fmt(totalSalesV)],
      },
      {
        title: '7. Discount Summary', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [
          ['Bill Level Discount', fmt(xSummary.billDiscount ?? 0)],
          ['Line Item Discount', fmt(xSummary.lineDiscount ?? 0)],
        ],
        footer: ['Total Discount', discountV > 0 ? `(${fmt(discountV)})` : fmt(0)],
      },
      {
        title: '8. Return / Refund Summary', type: 'table',
        cols: ['Description', 'Count', 'Amount'],
        rows: [
          ['Total Refunds', String(totalRefundCount), fmt(refundTotal)],
          ['Card Refunds', String(cardRefundCount), fmt(cardRefundTotal)],
        ],
      },
      {
        title: '9. Item Movement Summary', type: 'table',
        cols: ['Description', 'Quantity', 'Amount'],
        rows: [['Total Items Sold', String(itemsSoldCount || xSummary.totalItemsSold || 0), fmt(totalSalesV)]],
      },
      {
        title: '10. Voided Items (Posted then Voided)', type: 'table',
        cols: ['Invoice', 'Item', 'Qty', 'Unit Price', 'Line Total', 'Reason', 'Voided By', 'Time'],
        rows: postedVoids.length
          ? postedVoids.map(v => [
            v.invoiceNumber || '—',
            `${v.itemName || v.itemCode || '—'}${v.serialNumber ? ` [SN:${v.serialNumber}]` : ''}`,
            String(v.quantity ?? 0),
            fmt(Number(v.unitPrice ?? 0)),
            fmt(Number(v.lineTotal ?? 0)),
            v.voidReason || '—',
            v.voidedBy || '—',
            v.voidedAt ? String(v.voidedAt).replace('T', ' ').slice(0, 16) : '—',
          ])
          : [['—', 'No voided items', '', '', '', '', '', '']],
        footer: ['Total', '', '', '', fmt(voidAmountV), `${postedVoids.length} item(s)`, '', ''],
      },
      {
        title: '11. Removed From Cart (Never Posted)', type: 'table',
        cols: ['Item', 'Detail', 'Removed By', 'Terminal', 'Time'],
        rows: cartRemovals.length
          ? cartRemovals.map(r => [
            r.itemCode || '—',
            r.description || '—',
            r.voidedBy || '—',
            r.terminalId || '—',
            r.voidedAt ? String(r.voidedAt).replace('T', ' ').slice(0, 16) : '—',
          ])
          : [['—', 'No cart removals', '', '', '']],
      },
      {
        title: '12. Cashier Attribution', type: 'table',
        cols: ['Cashier', 'Collected'],
        rows: cashierRows.length
          ? cashierRows.map(c => [c.cashier || '—', fmt(Number(c.collected ?? 0))])
          : [[sess?.openedBy || '—', fmt(totalPaidV)]],
        footer: ['Total Collected', fmt(totalPaidV)],
      },
    ],
  };
}

/** Builds the A4/thermal print view-model for a Z-Report. `zReportData` is the raw
 *  payload from `GET /api/pos/sessions/z-report` (live/replayed) or a
 *  `PosDayClose.zReportJson` (historical, parsed) — identical shape either way.
 *  `opts`: { currency, businessDate, terminalLabel } — all optional/presentational. */
export function buildZReportViewModel(zReportData, opts = {}) {
  const currency = opts.currency || 'AED';
  const fmt = (n) => `${currency} ${Number(n || 0).toFixed(2)}`;
  const businessDate = opts.businessDate || zReportData?.date;

  const zSummary = zReportData?.summary || {};
  const zSessions = zReportData?.sessions || [];
  const zInvoices = zReportData?.invoices || [];
  const totalSalesV = Number(zSummary.totalSales ?? 0);
  const cashSalesV = Number(zSummary.cashSales ?? 0);
  const cardSalesV = Number(zSummary.cardSales ?? 0);
  const creditSalesV = Number(zSummary.creditSales ?? 0);
  const bankTransferSalesV = Number(zSummary.bankTransferSales ?? 0);
  const totalTaxV = Number(zSummary.totalTax ?? 0);
  const salesExTaxV = Number(zSummary.salesAmountExTax ?? 0);
  const discountV = Number(zSummary.totalDiscount ?? 0);
  const itemsSoldV = zSummary.totalItemsSold ?? 0;
  const invoiceCount = zSummary.invoiceCount ?? 0;
  const sessionCount = zSummary.sessionCount ?? zSessions.length;
  const openingCash = zSessions.reduce((s, ss) => s + Number(ss.openingCash ?? 0), 0);
  const expectedCash = openingCash + cashSalesV;
  const cashPosition = zSummary.cashPosition || {};
  const cpOpeningCash = Number(cashPosition.openingCash ?? openingCash);
  const cpCashSales = Number(cashPosition.cashSales ?? cashSalesV);
  const cpReceiptsTotal = Number(cashPosition.customerReceiptsTotal ?? 0);
  const cpAdvancesTotal = Number(cashPosition.customerAdvancesTotal ?? 0);
  const cpDropIn = Number(cashPosition.cashDropIn ?? 0);
  const cpDropOut = Number(cashPosition.cashDropOut ?? 0);
  const cpRefundsSupported = cashPosition.cashRefundsSupported === true;
  const cpNet = Number(cashPosition.netCashPosition ?? (cpOpeningCash + cpCashSales + cpReceiptsTotal + cpAdvancesTotal + cpDropIn - cpDropOut));
  const cpReceiptRows = Array.isArray(cashPosition.customerReceiptRows) ? cashPosition.customerReceiptRows : [];
  const cpAdvanceRows = Array.isArray(cashPosition.customerAdvanceRows) ? cashPosition.customerAdvanceRows : [];
  const cpDropRows = Array.isArray(cashPosition.cashDropRows) ? cashPosition.cashDropRows : [];
  const zId = zSessions[0]?.id;
  const reportNo = zReportData?.reportNumber
    || (zId ? `ZR-${String(zId).padStart(9, '0')}` : `ZR-${String(businessDate || '').replace(/-/g, '')}-001`);

  const creditInvoices = zInvoices.filter(inv => inv.paymentMode?.toLowerCase().includes('credit') && !inv.paymentMode?.toLowerCase().includes('card'));
  const creditTotal = creditInvoices.reduce((s, inv) => s + (Number(inv.invoiceTotal) || 0), 0);
  const invNums = zInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();
  const postedVoids = Array.isArray(zReportData?.voids) ? zReportData.voids : [];
  const cartRemovals = Array.isArray(zReportData?.cartRemovals) ? zReportData.cartRemovals : [];
  const cashierRows = Array.isArray(zReportData?.cashiers) ? zReportData.cashiers : [];
  const totalPaidV = Number(zSummary.totalPaid ?? totalSalesV);
  const voidAmountV = Number(zSummary.voidAmount ?? 0);
  const refundTotal = Number(zSummary.totalRefunds ?? 0);
  const actualCash = zSessions.reduce((s, ss) => s + Number(ss.closingCash ?? 0), 0);
  const cashVariance = actualCash - expectedCash;
  const zCashierLabel = cashierRows.length ? cashierRows.map(c => c.cashier).filter(Boolean).join(', ') : 'All cashiers';
  const zSessionInfoRows = Array.isArray(zReportData?.sessionInfo) ? zReportData.sessionInfo : [];
  const cardTypeBreakdown = Array.isArray(zSummary.cardTypeBreakdown) ? zSummary.cardTypeBreakdown : [];
  const zDenominationTotals = DENOM_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
  zSessionInfoRows.forEach((row) => {
    const raw = row?.closingDenominationsJson;
    if (!raw) return;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      DENOM_KEYS.forEach((key) => { zDenominationTotals[key] += Number(parsed?.[key] || 0); });
    } catch (err) {
      console.warn('Unable to parse Z-report closing denominations', err);
    }
  });

  return {
    reportTitle: 'Z-Report / End-of-Day Closing Report',
    note: `Report No: ${reportNo}  |  Business Date: ${businessDate || new Date().toISOString().slice(0, 10)}  |  Sessions: ${sessionCount}`,
    reportMeta: [
      { label: 'Report No', value: reportNo },
      { label: 'Session No', value: `${sessionCount} session${sessionCount === 1 ? '' : 's'}` },
      { label: 'Cashier', value: zCashierLabel },
      { label: 'Date & Time', value: new Date().toLocaleString() },
      { label: 'Business Date', value: businessDate || new Date().toISOString().slice(0, 10) },
      { label: 'Terminal', value: opts.terminalLabel || 'All Terminals' },
    ],
    kpis: [
      { label: 'Opening Cash', value: fmt(openingCash), hint: `${sessionCount} session(s)`, icon: 'OC' },
      { label: 'Total Sales', value: fmt(totalSalesV), hint: 'Inc. VAT', icon: 'TS' },
      { label: 'Cash Sales', value: fmt(cashSalesV), hint: 'Cash payments', icon: 'CS' },
      { label: 'Card Sales', value: fmt(cardSalesV), hint: 'Card payments', icon: 'CA' },
      { label: 'Credit Sales', value: fmt(creditSalesV), hint: 'Credit invoices', icon: 'CR' },
      { label: 'Online / Bank Transfer', value: fmt(bankTransferSalesV), hint: 'Online payments', icon: 'OB' },
      { label: 'Returns', value: fmt(refundTotal), hint: 'Refunds / returns', icon: 'RT' },
      { label: 'Discounts', value: fmt(discountV), hint: 'Bill and line discounts', icon: 'DS' },
      { label: 'Expected Cash', value: fmt(expectedCash), hint: 'Opening + cash sales', icon: 'EC' },
      { label: 'Actual Cash', value: fmt(actualCash), hint: 'Closed session counts', icon: 'AC' },
      { label: 'Cash Variance', value: fmt(Math.abs(cashVariance)), hint: actualCash === 0 ? 'Pending close count' : Math.abs(cashVariance) < 0.01 ? 'Balanced' : cashVariance < 0 ? 'Short' : 'Excess', icon: 'CV' },
    ],
    sections: [
      {
        title: '0. Session Information', type: 'table',
        cols: ['Session', 'Cashier', 'Opened At', 'Closed At', 'Expected Cash', 'Actual Cash'],
        rows: zSessionInfoRows.length
          ? zSessionInfoRows.map((row) => [
            row.sessionNo || '—',
            row.cashier || '—',
            fmtTs(row.openedAt),
            fmtTs(row.closedAt),
            fmt(Number(row.expectedCash ?? 0)),
            fmt(Number(row.closingCash ?? 0)),
          ])
          : zSessions.map((row) => [
            row.id ? `SESS-${String(row.id).padStart(6, '0')}` : '—',
            row.openedBy || '—',
            fmtTs(row.openedAt),
            fmtTs(row.closedAt),
            fmt(Number(row.expectedCash ?? 0)),
            fmt(Number(row.closingCash ?? 0)),
          ]),
      },
      {
        title: '1. Denomination Count', type: 'table',
        cols: ['Denomination', 'Quantity', 'Total Amount'],
        rows: DENOM_KEYS.map(k => [DENOM_LABELS[k], String(zDenominationTotals[k] || 0), fmt((zDenominationTotals[k] || 0) * parseFloat(k))]),
        footer: ['Total Cash Counted', '', fmt(calculateDenominationTotal(zDenominationTotals))],
      },
      {
        title: '2. Sales Summary', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [
          ['Gross Sales', fmt(totalSalesV)],
          ['Total Discount', discountV > 0 ? `(${fmt(discountV)})` : fmt(0)],
          ['Net Sales Before VAT', fmt(salesExTaxV)],
          ['VAT Amount (5%)', fmt(totalTaxV)],
          ['Net Sales Including VAT', fmt(totalSalesV)],
        ],
      },
      {
        title: '2. Invoice / Transaction Summary', type: 'table',
        cols: ['Description', 'Count', 'Amount'],
        rows: [['Total Sales Invoices', String(invoiceCount), fmt(totalSalesV)]],
      },
      {
        title: '3. Payment / Tender Summary', type: 'table',
        cols: ['Payment Mode', 'Count', 'Amount'],
        rows: [
          ['Cash', String(zSummary.cashInvoiceCount ?? '—'), fmt(cashSalesV)],
          ['Card', String(zSummary.cardInvoiceCount ?? '—'), fmt(cardSalesV)],
          ['Credit', String(zSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
        ],
        footer: ['Total Collected', String(invoiceCount), fmt(totalSalesV)],
      },
      {
        title: '4. Cash Drawer Summary', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [
          ['Opening Cash / Float', fmt(openingCash)],
          ['Cash Sales', fmt(cashSalesV)],
          ['Expected Cash in Drawer', fmt(expectedCash)],
        ],
      },
      {
        title: '4a. Consolidated Cash Position (Informational)', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [
          ['Opening Cash', fmt(cpOpeningCash)],
          ['Cash Sales', fmt(cpCashSales)],
          ['Customer Receipts (Cash)', fmt(cpReceiptsTotal)],
          ['Customer Advances (Cash)', fmt(cpAdvancesTotal)],
          ['Cash Drop In', fmt(cpDropIn)],
          ['Cash Refunds (Cash)', cpRefundsSupported ? fmt(cashPosition.cashRefundsTotal ?? 0) : 'Not available — refund payment mode not tracked'],
          ['Cash Drop Out', cpDropOut > 0 ? `(${fmt(cpDropOut)})` : fmt(0)],
        ],
        footer: ['Net Cash Position', fmt(cpNet)],
      },
      {
        title: '4b. Customer Receipts', type: 'table',
        cols: ['Sl No', 'Customer Name', 'Received By', 'Received Amount'],
        rows: cpReceiptRows.length
          ? cpReceiptRows.map(r => [String(r.slNo ?? ''), r.customerName || '—', r.receivedBy || '—', fmt(Number(r.receivedAmount ?? 0))])
          : [['—', 'No cash customer receipts', '—', fmt(0)]],
        footer: ['', '', 'Total', fmt(cpReceiptsTotal)],
      },
      {
        title: '4c. Customer Advances', type: 'table',
        cols: ['Sl No', 'Customer Name', 'Paid By', 'Paid Amount'],
        rows: cpAdvanceRows.length
          ? cpAdvanceRows.map(r => [String(r.slNo ?? ''), r.customerName || '—', r.paidBy || '—', fmt(Number(r.paidAmount ?? 0))])
          : [['—', 'No cash customer advances', '—', fmt(0)]],
        footer: ['', '', 'Total', fmt(cpAdvancesTotal)],
      },
      {
        title: '4d. Cash Drop / Cash Out', type: 'table',
        cols: ['Sl No', 'Type', 'Amount'],
        rows: cpDropRows.length
          ? cpDropRows.map(r => [String(r.slNo ?? ''), r.type || '—', fmt(Number(r.amount ?? 0))])
          : [['—', 'No cash drops recorded', fmt(0)]],
        footer: ['', 'Total', fmt(cpDropIn - cpDropOut)],
      },
      {
        title: '5. Card / Bank Settlement Summary', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [
          ...cardTypeBreakdown.map(row => [row.cardType, fmt(row.amount ?? 0)]),
          ['Total Card Sales', fmt(cardSalesV)],
          ['Net Card Settlement Expected', fmt(cardSalesV)],
        ],
      },
      {
        title: '6. VAT / Tax Summary', type: 'table',
        cols: ['Tax Type', 'Taxable Amount', 'Tax Amount', 'Total Amount'],
        rows: [['VAT 5%', fmt(salesExTaxV), fmt(totalTaxV), fmt(totalSalesV)]],
        footer: ['Total', fmt(salesExTaxV), fmt(totalTaxV), fmt(totalSalesV)],
      },
      {
        title: '7. Discount Summary', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [['Total Discount', discountV > 0 ? `(${fmt(discountV)})` : fmt(0)]],
      },
      {
        title: '8. Returns / Refund Summary', type: 'table',
        cols: ['Description', 'Count', 'Amount'],
        rows: [
          ['Sales Returns', String(zSummary.salesReturnCount ?? 0), zSummary.salesReturnTotal > 0 ? `(${fmt(zSummary.salesReturnTotal)})` : fmt(0)],
          ['Refunds Processed', String(zSummary.refundCount ?? 0), zSummary.refundTotal > 0 ? `(${fmt(zSummary.refundTotal)})` : fmt(0)],
          ['Credit Notes Issued', String(zSummary.creditNoteCount ?? 0), zSummary.creditNoteTotal > 0 ? `(${fmt(zSummary.creditNoteTotal)})` : fmt(0)],
          ['Exchange Transactions', String(zSummary.exchangeCount ?? 0), fmt(zSummary.exchangeTotal ?? 0)],
          ['Total Refunds (Tender)', String(zSummary.totalRefundCount ?? 0), fmt(zSummary.totalRefunds ?? 0)],
        ],
      },
      {
        title: '9. Product / Item Movement Summary', type: 'table',
        cols: ['Description', 'Quantity', 'Amount'],
        rows: [
          ['Total Items Sold', String(itemsSoldV), fmt(totalSalesV)],
          ['Total Items Returned', String(zSummary.totalItemsReturned ?? 0), (zSummary.totalItemsReturned ?? 0) > 0 ? `(${fmt(zSummary.salesReturnTotal ?? 0)})` : fmt(0)],
          ['Net Quantity Sold', String(zSummary.netQuantitySold ?? itemsSoldV), fmt(totalSalesV)],
          ...((Array.isArray(zReportData?.topSellingItems) ? zReportData.topSellingItems : []).map(it =>
            [`  Top Seller: ${it.itemCode || '—'} — ${it.itemName || '—'}`, String(it.quantity ?? 0), fmt(it.amount ?? 0)])),
        ],
      },
      {
        title: '10. Cashier Wise Summary', type: 'table',
        cols: ['Cashier', 'Invoice Count', 'Net Sales', 'Cash', 'Card', 'Credit'],
        rows: (Array.isArray(zReportData?.cashierWiseSummary) ? zReportData.cashierWiseSummary : []).length > 0
          ? zReportData.cashierWiseSummary.map(c => [c.cashier || '—', String(c.invoiceCount || 0), fmt(c.netSales ?? 0), fmt(c.cash ?? 0), fmt(c.card ?? 0), fmt(c.credit ?? 0)])
          : [['—', '0', fmt(0), fmt(0), fmt(0), fmt(0)]],
        footer: ['Total', String(invoiceCount), fmt(totalSalesV), fmt(cashSalesV), fmt(cardSalesV), fmt(creditSalesV)],
      },
      {
        title: '10a. Cashier Collection Attribution', type: 'table',
        cols: ['Cashier', 'Collected'],
        rows: cashierRows.length
          ? cashierRows.map(c => [c.cashier || '—', fmt(Number(c.collected ?? 0))])
          : [['—', fmt(0)]],
        footer: ['Total Collected', fmt(totalPaidV)],
      },
      {
        title: '10b. Voided Items (Posted then Voided)', type: 'table',
        cols: ['Invoice', 'Item', 'Qty', 'Unit Price', 'Line Total', 'Reason', 'Voided By', 'Time'],
        rows: postedVoids.length
          ? postedVoids.map(v => [
            v.invoiceNumber || '—',
            `${v.itemName || v.itemCode || '—'}${v.serialNumber ? ` [SN:${v.serialNumber}]` : ''}`,
            String(v.quantity ?? 0),
            fmt(Number(v.unitPrice ?? 0)),
            fmt(Number(v.lineTotal ?? 0)),
            v.voidReason || '—',
            v.voidedBy || '—',
            v.voidedAt ? String(v.voidedAt).replace('T', ' ').slice(0, 16) : '—',
          ])
          : [['—', 'No voided items', '', '', '', '', '', '']],
        footer: ['Total', '', '', '', fmt(voidAmountV), `${postedVoids.length} item(s)`, '', ''],
      },
      {
        title: '10c. Removed From Cart (Never Posted)', type: 'table',
        cols: ['Item', 'Detail', 'Removed By', 'Terminal', 'Time'],
        rows: cartRemovals.length
          ? cartRemovals.map(r => [
            r.itemCode || '—',
            r.description || '—',
            r.voidedBy || '—',
            r.terminalId || '—',
            r.voidedAt ? String(r.voidedAt).replace('T', ' ').slice(0, 16) : '—',
          ])
          : [['—', 'No cart removals', '', '', '']],
      },
      {
        title: '11. Customer Credit Summary', type: 'table',
        cols: ['Description', 'Count', 'Amount'],
        rows: [
          ['Credit Sales', String(creditInvoices.length), fmt(creditTotal)],
          ['Outstanding Created Today', String(creditInvoices.length), fmt(creditTotal)],
        ],
      },
      {
        title: '12. Opening & Closing Invoice Numbers', type: 'table',
        cols: ['Document Type', 'Starting No.', 'Ending No.'],
        rows: [['Sales Invoice', invNums[0] || '—', invNums[invNums.length - 1] || '—']],
      },
      {
        title: '13. Final Day Close Summary', type: 'table',
        cols: ['Description', 'Amount'],
        rows: [
          ['Total Net Sales Inc. VAT', fmt(totalSalesV)],
          ['Total Discount', fmt(discountV)],
          ['Total Collection', fmt(totalPaidV)],
          ['Opening Cash / Float', fmt(openingCash)],
          ['Expected Cash in Drawer', fmt(expectedCash)],
          ['Cash Sales', fmt(cashSalesV)],
        ],
      },
    ],
  };
}
