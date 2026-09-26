// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// These build the flat row/section arrays that exportToExcel() writes for the X and Z
// reports. They were already pure transformations of report data held in component
// state; the only change is that the values they used to read from the enclosing
// closure are now explicit parameters. No formatting, rounding or row ordering was
// touched.
import { DENOM_KEYS, DENOM_LABELS } from '../../../../../utils/cashDenominations';
import { calculateDenominationTotal } from '../../../../../utils/posReportViewModel';

export const buildZReportExcelSections = (zReportData) => {
  const zSummary = zReportData?.summary || {};
  const zSessions = zReportData?.sessions || [];
  const zInvoices = zReportData?.invoices || [];
  const fmt = (n) => Number(Number(n).toFixed(2));
  const totalSalesV = fmt(zSummary.totalSales ?? 0);
  const cashSalesV = fmt(zSummary.cashSales ?? 0);
  const cardSalesV = fmt(zSummary.cardSales ?? 0);
  const creditSalesV = fmt(zSummary.creditSales ?? 0);
  const totalTaxV = fmt(zSummary.totalTax ?? 0);
  const salesExTaxV = fmt(zSummary.salesAmountExTax ?? 0);
  const discountV = fmt(zSummary.totalDiscount ?? 0);
  const itemsSold = zSummary.totalItemsSold ?? 0;
  const invoiceCount = zSummary.invoiceCount ?? 0;
  const openingCash = fmt(zSessions.reduce((s, ss) => s + Number(ss.openingCash ?? 0), 0));
  // Backend-authoritative: the sum of the per-session figures frozen at each close.
  const expectedCash = fmt(zSummary.expectedCash ?? 0);
  // Consolidated Cash Position — additive, informational-only (see buildZReportViewModel).
  const cashPosition = zSummary.cashPosition || {};
  const cpOpeningCash = fmt(cashPosition.openingCash ?? openingCash);
  const cpCashSales = fmt(cashPosition.cashSales ?? cashSalesV);
  const cpReceiptsTotal = fmt(cashPosition.customerReceiptsTotal ?? 0);
  const cpAdvancesTotal = fmt(cashPosition.customerAdvancesTotal ?? 0);
  const cpDropIn = fmt(cashPosition.cashDropIn ?? 0);
  const cpDropOut = fmt(cashPosition.cashDropOut ?? 0);
  const cpRefundsSupported = cashPosition.cashRefundsSupported === true;
  // netCashPosition removed: it summed back-office cash onto a drawer figure, producing
  // a number that reconciled against nothing. The underlying rows survive, scoped as
  // non-drawer cash and totalled separately.
  const cpReceiptRows = Array.isArray(cashPosition.customerReceiptRows) ? cashPosition.customerReceiptRows : [];
  const cpAdvanceRows = Array.isArray(cashPosition.customerAdvanceRows) ? cashPosition.customerAdvanceRows : [];
  const cpDropRows = Array.isArray(cashPosition.cashDropRows) ? cashPosition.cashDropRows : [];
  const creditInvoices = zInvoices.filter(inv => inv.paymentMode?.toLowerCase().includes('credit') && !inv.paymentMode?.toLowerCase().includes('card'));
  const creditTotal = fmt(creditInvoices.reduce((s, inv) => s + Number(inv.invoiceTotal || 0), 0));
  const invNums = zInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();

  return [
    // Sales summary rows tagged with section header
    { Section: 'Sales Summary', Description: 'Gross Sales', Count: '', Amount: totalSalesV },
    { Section: '', Description: 'Total Discount', Count: '', Amount: discountV },
    { Section: '', Description: 'Net Sales Before VAT', Count: '', Amount: salesExTaxV },
    { Section: '', Description: 'VAT Amount (5%)', Count: '', Amount: totalTaxV },
    { Section: '', Description: 'Net Sales Including VAT', Count: '', Amount: totalSalesV },
    { Section: 'Payment / Tender', Description: 'Cash', Count: zSummary.cashInvoiceCount ?? 0, Amount: cashSalesV },
    { Section: '', Description: 'Card', Count: zSummary.cardInvoiceCount ?? 0, Amount: cardSalesV },
    { Section: '', Description: 'Credit', Count: zSummary.creditInvoiceCount ?? 0, Amount: creditSalesV },
    { Section: '', Description: 'Total Collected', Count: invoiceCount, Amount: totalSalesV },
    { Section: 'Cash Drawer', Description: 'Opening Cash / Float', Count: '', Amount: openingCash },
    { Section: '', Description: 'Cash Sales', Count: '', Amount: cashSalesV },
    { Section: '', Description: 'Expected Cash in Drawer', Count: '', Amount: expectedCash },
    // Consolidated Cash Position — additive, informational only (see buildZReportViewModel).
    { Section: 'Consolidated Cash Position', Description: 'Opening Cash', Count: '', Amount: cpOpeningCash },
    { Section: '', Description: 'Cash Sales', Count: '', Amount: cpCashSales },
    { Section: '', Description: 'Customer Receipts (Cash)', Count: cpReceiptRows.length, Amount: cpReceiptsTotal },
    { Section: '', Description: 'Customer Advances (Cash)', Count: cpAdvanceRows.length, Amount: cpAdvancesTotal },
    { Section: '', Description: 'Cash Drop In', Count: '', Amount: cpDropIn },
    { Section: '', Description: 'Cash Refunds (Cash)', Count: '', Amount: cpRefundsSupported ? fmt(cashPosition.cashRefundsTotal ?? 0) : 'Not tracked' },
    { Section: '', Description: 'Cash Drop Out', Count: '', Amount: cpDropOut },
    ...cpReceiptRows.map((r, i) => ({ Section: i === 0 ? 'Customer Receipts Detail' : '', Description: r.customerName || '—', Count: r.receivedBy || '—', Amount: fmt(r.receivedAmount ?? 0) })),
    ...cpAdvanceRows.map((r, i) => ({ Section: i === 0 ? 'Customer Advances Detail' : '', Description: r.customerName || '—', Count: r.paidBy || '—', Amount: fmt(r.paidAmount ?? 0) })),
    ...cpDropRows.map((r, i) => ({ Section: i === 0 ? 'Cash Drop / Cash Out Detail' : '', Description: r.type || '—', Count: '', Amount: fmt(r.amount ?? 0) })),
    { Section: 'VAT / Tax', Description: 'VAT 5% — Taxable Amount', Count: '', Amount: salesExTaxV },
    { Section: '', Description: 'VAT 5% — Tax Amount', Count: '', Amount: totalTaxV },
    { Section: '', Description: 'Total Inc. VAT', Count: '', Amount: totalSalesV },
    { Section: 'Discount', Description: 'Total Discount', Count: '', Amount: discountV },
    { Section: 'Returns / Refund', Description: 'Sales Returns', Count: zSummary.salesReturnCount ?? 0, Amount: fmt(zSummary.salesReturnTotal ?? 0) },
    { Section: '', Description: 'Refunds Processed', Count: zSummary.refundCount ?? 0, Amount: fmt(zSummary.refundTotal ?? 0) },
    { Section: '', Description: 'Credit Notes Issued', Count: zSummary.creditNoteCount ?? 0, Amount: fmt(zSummary.creditNoteTotal ?? 0) },
    { Section: '', Description: 'Exchange Transactions', Count: zSummary.exchangeCount ?? 0, Amount: fmt(zSummary.exchangeTotal ?? 0) },
    { Section: '', Description: 'Total Refunds (Tender)', Count: zSummary.totalRefundCount ?? 0, Amount: fmt(zSummary.totalRefunds ?? 0) },
    { Section: 'Item Movement', Description: 'Total Items Sold', Count: String(itemsSold), Amount: totalSalesV },
    { Section: '', Description: 'Total Items Returned', Count: String(zSummary.totalItemsReturned ?? 0), Amount: fmt(zSummary.salesReturnTotal ?? 0) },
    { Section: '', Description: 'Net Quantity Sold', Count: String(zSummary.netQuantitySold ?? itemsSold), Amount: totalSalesV },
    ...(Array.isArray(zReportData?.topSellingItems) ? zReportData.topSellingItems : []).map((it, i) => ({
      Section: i === 0 ? 'Top Selling Items' : '',
      Description: `${it.itemCode || '—'} — ${it.itemName || '—'}`,
      Count: it.quantity ?? 0,
      Amount: fmt(it.amount ?? 0),
    })),
    { Section: 'Customer Credit', Description: 'Credit Sales', Count: creditInvoices.length, Amount: creditTotal },
    { Section: 'Invoice Range', Description: 'First Invoice', Count: invNums[0] || '—', Amount: '' },
    { Section: '', Description: 'Last Invoice', Count: invNums[invNums.length - 1] || '—', Amount: '' },
    ...(Array.isArray(zReportData?.cashierWiseSummary) ? zReportData.cashierWiseSummary : []).map((c, i) => ({
      Section: i === 0 ? 'Cashier Wise' : '',
      Description: c.cashier || '—',
      Count: c.invoiceCount || 0,
      Amount: fmt(c.netSales ?? 0),
    })),
  ];
};

export const buildXReportExcelRows = ({
  xReportData,
  currentSession,
  closingDenominations,
  xReportCardBatchNo,
  xReportCardVerified,
} = {}) => {
  const xSummary = xReportData?.summary || {};
  const xInvoices = xReportData?.invoices || [];
  const sess = xReportData?.session || currentSession;
  const fmt = (n) => Number(Number(n).toFixed(2));
  const openingCashVal = fmt(xSummary.openingCash ?? currentSession?.openingCash ?? 0);
  const cashSalesV = fmt(xSummary.cashSales ?? 0);
  const cardSalesV = fmt(xSummary.cardSales ?? 0);
  const creditSalesV = fmt(xSummary.creditSales ?? 0);
  const totalSalesV = fmt(xSummary.totalSales ?? 0);
  const totalTaxV = fmt(xSummary.totalTax ?? 0);
  const salesExTaxV = fmt(xSummary.salesAmountExTax ?? 0);
  const discountV = fmt(xSummary.totalDiscount ?? 0);
  const cashDropIn = fmt(xSummary.cashDropIn ?? 0);
  const cashDropOut = fmt(xSummary.cashDropOut ?? 0);
  const invoiceCount = xSummary.invoiceCount ?? currentSession?.invoiceCount ?? 0;
  const expectedCash = fmt(xSummary.expectedCash ?? 0);
  const reportDenominations = closingDenominations;
  const actualCash = fmt(calculateDenominationTotal(reportDenominations));
  const variance = fmt(actualCash - expectedCash);
  const refundTotal = fmt(xSummary.totalRefunds ?? 0);
  const totalRefundCount = xSummary.totalRefundCount ?? 0;
  const cardRefundTotal = fmt(xSummary.cardRefundSales ?? 0);
  const cardRefundCount = xSummary.cardRefundCount ?? 0;
  const otherSalesV = fmt(xSummary.otherSales ?? 0);
  const totalPaidV = fmt(xSummary.totalPaid ?? totalSalesV);
  const totalTenderCountV = xSummary.totalTenderCount ?? invoiceCount;
  const denomKeys = DENOM_KEYS;
  const denomLabels = DENOM_LABELS;
  // Consolidated Cash Position — additive, informational-only (see buildXReportViewModel).
  const cashPosition = xSummary.cashPosition || {};
  const cpDropRows = Array.isArray(cashPosition.cashDropRows) ? cashPosition.cashDropRows : [];
  const cpRefundsSupported = cashPosition.cashRefundsSupported === true;
  // netCashPosition removed — see the Z-Report note.

  return [
    ...denomKeys.map((k, i) => ({
      Section: i === 0 ? 'Denomination Count' : '',
      Description: denomLabels[k],
      Count: reportDenominations[k] || 0,
      Amount: fmt((reportDenominations[k] || 0) * parseFloat(k)),
    })),
    { Section: 'Cash Drawer', Description: 'Opening Cash / Float', Count: '', Amount: openingCashVal },
    { Section: '', Description: 'Cash Sales', Count: '', Amount: cashSalesV },
    { Section: '', Description: 'Cash Drop In', Count: '', Amount: cashDropIn },
    { Section: '', Description: 'Cash Drop Out', Count: '', Amount: cashDropOut },
    { Section: '', Description: 'Expected Cash in Drawer', Count: '', Amount: expectedCash },
    { Section: '', Description: 'Actual Cash Counted', Count: '', Amount: actualCash },
    { Section: '', Description: 'Cash Variance', Count: '', Amount: variance },
    { Section: 'Consolidated Cash Position', Description: 'Opening Cash', Count: '', Amount: openingCashVal },
    { Section: '', Description: 'Cash Sales', Count: '', Amount: cashSalesV },
    { Section: '', Description: 'Customer Receipts (Cash)', Count: '', Amount: 'Not available in X-Report' },
    { Section: '', Description: 'Customer Advances (Cash)', Count: '', Amount: 'Not available in X-Report' },
    { Section: '', Description: 'Cash Drop In', Count: '', Amount: cashDropIn },
    { Section: '', Description: 'Cash Refunds (Cash)', Count: '', Amount: cpRefundsSupported ? fmt(cashPosition.cashRefundsTotal ?? 0) : 'Not tracked' },
    { Section: '', Description: 'Cash Drop Out', Count: '', Amount: cashDropOut },
    ...cpDropRows.map((r, i) => ({ Section: i === 0 ? 'Cash Drop / Cash Out Detail' : '', Description: r.type || '—', Count: '', Amount: fmt(r.amount ?? 0) })),
    { Section: 'Payment Tender', Description: 'Cash', Count: xSummary.cashInvoiceCount ?? 0, Amount: cashSalesV },
    { Section: '', Description: 'Card', Count: xSummary.cardInvoiceCount ?? 0, Amount: cardSalesV },
    { Section: '', Description: 'Credit', Count: xSummary.creditInvoiceCount ?? 0, Amount: creditSalesV },
    ...(otherSalesV > 0 ? [{ Section: '', Description: 'Online', Count: xSummary.otherInvoiceCount ?? 0, Amount: otherSalesV }] : []),
    { Section: '', Description: 'Total', Count: totalTenderCountV, Amount: totalPaidV },
    { Section: 'VAT / Tax', Description: 'VAT 5% — Taxable Amount', Count: '', Amount: salesExTaxV },
    { Section: '', Description: 'VAT 5% — Tax Amount', Count: '', Amount: totalTaxV },
    { Section: '', Description: 'Total Inc. VAT', Count: '', Amount: totalSalesV },
    { Section: 'Discount', Description: 'Bill Level Discount', Count: xSummary.billDiscountCount ?? 0, Amount: fmt(xSummary.billDiscount ?? 0) },
    { Section: '', Description: 'Line Item Discount', Count: xSummary.lineDiscountCount ?? 0, Amount: fmt(xSummary.lineDiscount ?? 0) },
    { Section: '', Description: 'Total Discount', Count: '', Amount: discountV },
    { Section: 'Return / Refund', Description: 'Sales Returns', Count: xSummary.salesReturnCount ?? 0, Amount: fmt(xSummary.salesReturnTotal ?? 0) },
    { Section: '', Description: 'Refunds Processed', Count: xSummary.refundCount ?? 0, Amount: fmt(xSummary.refundTotal ?? 0) },
    { Section: '', Description: 'Credit Notes Issued', Count: xSummary.creditNoteCount ?? 0, Amount: fmt(xSummary.creditNoteTotal ?? 0) },
    { Section: '', Description: 'Exchange Transactions', Count: xSummary.exchangeCount ?? 0, Amount: fmt(xSummary.exchangeTotal ?? 0) },
    { Section: '', Description: 'Total Refunds (In-session)', Count: totalRefundCount, Amount: refundTotal },
    { Section: 'Card Settlement', Description: 'Card Refunds', Count: cardRefundCount, Amount: cardRefundTotal },
    { Section: '', Description: 'Net Card Settlement', Count: Math.max(0, (xSummary.cardInvoiceCount ?? 0) - cardRefundCount), Amount: fmt(Math.max(0, cardSalesV - cardRefundTotal)) },
    { Section: '', Description: 'Card Machine Batch No.', Count: '', Amount: sess?.cardBatchNo || xReportCardBatchNo || '—' },
    { Section: '', Description: 'Card Settlement Verified', Count: '', Amount: (sess?.cardSettlementVerified ?? xReportCardVerified) ? 'Yes' : 'No' },
    { Section: 'Invoice Count', Description: 'Total Invoices', Count: invoiceCount, Amount: totalSalesV },
    ...xInvoices.slice(0, 200).map((inv, i) => ({
      Section: i === 0 ? 'Invoice List' : '',
      Description: inv.invoiceNumber || `Invoice #${i + 1}`,
      Count: inv.paymentMode || '—',
      Amount: fmt(inv.invoiceTotal || 0),
    })),
  ];
};
