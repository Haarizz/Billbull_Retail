import { buildEscPosDocumentBase64, escPosUsableCols, buildFixedWidthLine, wrapToWidth } from './escPosReceipt';
import { resolvePrinterForContext, sendEscPosReceiptToConfiguredPrinter } from './localPrintAgent';
import { RECEIPT_LABELS as L } from './receiptLabels';

/**
 * Production printing for Sales Return receipts and Credit Vouchers.
 *
 * Both go through the existing POS print pipeline rather than `window.print()`:
 *
 *   build ESC/POS  →  resolvePrinterForContext  →  sendEscPosReceiptToConfiguredPrinter
 *                                                   ├─ createPrintJob  (pos_print_jobs)
 *                                                   ├─ dispatchPrintJob
 *                                                   ├─ physical print (agent or network)
 *                                                   └─ reportPrintJobResult
 *
 * That gives returns and vouchers the same auditable job trail, printer resolution,
 * hardware-profile rules and network/agent routing that POS sale receipts already have —
 * no second print queue, no direct-to-printer shortcut.
 *
 * <p><b>Printing never changes business state.</b> Every function here reads persisted data
 * and emits paper. A reprint issues no voucher, creates no return, and moves no balance —
 * which is why reprint takes the persisted record rather than in-memory screen state.
 */

const money = (v) => (Number(v) || 0).toFixed(2);

/**
 * Output languages, matching the existing POS receipt templates: Template 1 is native
 * ESC/POS text (English only — these printers have no Arabic code page), Template 2 is the
 * rasterised bilingual canvas.
 */
export const PRINT_LANGUAGE = Object.freeze({
  EN: 'EN',
  AR: 'AR',
  BILINGUAL: 'BILINGUAL',
});

/**
 * Renders one label in the requested language from the shared RECEIPT_LABELS dictionary.
 *
 * There is deliberately no second translation table here: wording is approved once, in
 * receiptLabels.js, and the bilingual invoice renderer reads the same entries.
 *
 * Arabic can only be printed as raster. When an Arabic or bilingual document is emitted
 * through the native-text path, this degrades to English rather than sending characters the
 * printer would render as mojibake — the caller chooses the raster path to actually get Arabic.
 */
export function label(key, language = PRINT_LANGUAGE.EN, { rasterCapable = false } = {}) {
  const entry = L[key];
  if (!entry) return String(key);
  if (!rasterCapable || language === PRINT_LANGUAGE.EN) return entry.en;
  if (language === PRINT_LANGUAGE.AR) return entry.ar || entry.en;
  return entry.ar ? `${entry.en} / ${entry.ar}` : entry.en;
}

/** Maps a refund-method enum onto its label key. Internal enum names never reach paper. */
const REFUND_METHOD_KEYS = {
  CASH_REFUND: 'REFUND_CASH',
  CARD_REFUND: 'REFUND_CARD',
  BANK_TRANSFER: 'REFUND_BANK',
  CREDIT_VOUCHER: 'REFUND_VOUCHER',
  CUSTOMER_CREDIT: 'REFUND_CREDIT',
};

export const refundMethodLabel = (method, language = PRINT_LANGUAGE.EN, opts = {}) => {
  const key = REFUND_METHOD_KEYS[method];
  if (key) return label(key, language, opts);
  return method ? String(method).replace(/_/g, ' ') : '—';
};

export const voucherStatusLabel = (status, language = PRINT_LANGUAGE.EN, opts = {}) => {
  const key = status ? `STATUS_${status}` : null;
  if (key && L[key]) return label(key, language, opts);
  return status ? String(status).replace(/_/g, ' ') : '—';
};

/** Voucher terms from the shared dictionary, in the requested language. */
export const voucherTerms = (language = PRINT_LANGUAGE.EN, opts = {}) => [
  label('VOUCHER_TERM_INSTORE', language, opts),
  label('VOUCHER_TERM_NO_CASH', language, opts),
  label('VOUCHER_TERM_PRESENT', language, opts),
];

/**
 * Body text for a Sales Return receipt.
 *
 * Every money figure is taken from the persisted return — the print layer never re-derives
 * a total or applies a VAT rate of its own. If the receipt and the ledger ever disagree,
 * the ledger is what the customer was actually refunded.
 */
export function buildSalesReturnReceiptBody(ret, {
  paperSize = '80mm', isReprint = false, voucher = null,
  language = PRINT_LANGUAGE.EN, rasterCapable = false,
} = {}) {
  const cols = escPosUsableCols(paperSize);
  const hr = '-'.repeat(cols);
  const out = [];
  const t = (key) => label(key, language, { rasterCapable });

  out.push(t('SALES_RETURN'));
  if (isReprint) out.push(`*** ${t('REPRINT')} ***`);
  out.push(hr);

  const meta = [
    [t('RETURN_NO'), ret.returnNumber],
    [t('DATE'), ret.returnDate],
    [t('ORIGINAL_INVOICE'), ret.linkedInvoice],
    [t('RECEIPT_NO'), ret.linkedReceiptNumber],
    [t('CUSTOMER'), ret.customerName || 'Walk-in'],
    [t('MOBILE'), ret.customerMobile],
    [t('TERMINAL'), ret.posTerminalId],
    [t('CASHIER'), ret.createdBy],
  ].filter(([, v]) => v);
  meta.forEach(([k, v]) => out.push(buildFixedWidthLine(k, String(v), cols)));

  out.push(hr);

  (ret.items || []).forEach((it) => {
    const qty = Number(it.returnQty) || 0;
    const price = Number(it.price) || 0;
    // Name on its own line, figures beneath — a thermal column layout cannot hold a long
    // product name and four numbers on one 32/48-column line without truncating something.
    wrapToWidth(String(it.itemName || it.itemCode || ''), cols).forEach((l) => out.push(l));
    out.push(buildFixedWidthLine(`  ${qty} x ${money(price)}`, money(qty * price), cols));
    if (Number(it.discountAmount) > 0) {
      out.push(buildFixedWidthLine(`  ${t('DISCOUNT_LINE')}`, `-${money(it.discountAmount)}`, cols));
    }
    if (Number(it.taxAmount) > 0) {
      out.push(buildFixedWidthLine(`  ${t('VAT')}`, money(it.taxAmount), cols));
    }
    const condition = it.condition || it.effectiveCondition;
    if (condition) out.push(`  ${t('CONDITION')}: ${String(condition).replace(/_/g, ' ')}`);
  });

  out.push(hr);
  out.push(buildFixedWidthLine(t('RETURNED_ITEMS'), money(ret.subTotal), cols));
  out.push(buildFixedWidthLine(
    Boolean(ret.taxInclusive) ? t('VAT_REVERSAL_INCL') : t('VAT_REVERSAL'),
    money(ret.taxAmount), cols,
  ));
  out.push(buildFixedWidthLine(t('TOTAL_REFUND'), money(ret.totalAmount), cols));
  out.push(hr);
  out.push(buildFixedWidthLine(
    t('REFUND_METHOD'),
    refundMethodLabel(ret.refundMethod, language, { rasterCapable }), cols,
  ));

  // A voucher-settled return is only meaningful to the customer if the receipt names the
  // voucher they walked out with.
  const v = voucher || ret.issuedVoucher;
  if (v?.voucherNumber) {
    out.push(buildFixedWidthLine(t('VOUCHER_NO'), v.voucherNumber, cols));
    out.push(buildFixedWidthLine(t('VOUCHER_CODE'), v.voucherCode, cols));
    if (v.expiryDate) out.push(buildFixedWidthLine(t('EXPIRY_DATE'), String(v.expiryDate), cols));
  }

  if (ret.authorizedByUsername) {
    out.push(buildFixedWidthLine(t('APPROVED_BY'), ret.authorizedByUsername, cols));
  }

  return out.join('\n');
}

/**
 * Body text for a Credit Voucher.
 *
 * Original value and current balance are printed separately and always from persisted data,
 * so a reprint after a partial redemption shows what is genuinely left rather than the face
 * value the voucher was issued at.
 */
export function buildCreditVoucherBody(voucher, {
  paperSize = '80mm', isReprint = false, terms = null,
  language = PRINT_LANGUAGE.EN, rasterCapable = false,
} = {}) {
  const cols = escPosUsableCols(paperSize);
  const hr = '-'.repeat(cols);
  const out = [];
  const t = (key) => label(key, language, { rasterCapable });

  out.push(t('CREDIT_VOUCHER'));
  if (isReprint) out.push(`*** ${t('REPRINT')} ***`);
  out.push(hr);

  out.push(buildFixedWidthLine(t('VOUCHER_NO'), voucher.voucherNumber || '—', cols));
  out.push(buildFixedWidthLine(t('VOUCHER_CODE'), voucher.voucherCode || '—', cols));
  out.push(hr);

  out.push(buildFixedWidthLine(t('ORIGINAL_VALUE'), money(voucher.originalAmount), cols));
  if (Number(voucher.usedAmount) > 0) {
    out.push(buildFixedWidthLine(t('REDEEMED'), money(voucher.usedAmount), cols));
  }
  out.push(buildFixedWidthLine(t('CURRENT_BALANCE'), money(voucher.remainingAmount), cols));
  out.push(buildFixedWidthLine(
    t('STATUS'), voucherStatusLabel(voucher.status, language, { rasterCapable }), cols,
  ));
  out.push(hr);

  const meta = [
    [t('ISSUE_DATE'), voucher.issueDate],
    [t('EXPIRY_DATE'), voucher.expiryDate || t('NO_EXPIRY')],
    [t('CUSTOMER'), voucher.customerName],
    [t('ORIGINAL_INVOICE'), voucher.sourceInvoiceNumber],
    [t('RETURN_NO'), voucher.sourceReturnNumber],
  ].filter(([, v]) => v);
  meta.forEach(([k, v]) => out.push(buildFixedWidthLine(k, String(v), cols)));

  out.push(hr);
  (terms || voucherTerms(language, { rasterCapable })).forEach((term) => {
    // wrapToWidth already returns an array of width-fitted lines.
    wrapToWidth(term, cols).forEach((l) => out.push(l));
  });

  return out.join('\n');
}

/**
 * Resolves the printer for the current context and sends an ESC/POS document through the
 * production pipeline, creating the print job trail.
 *
 * Failure is surfaced, never swallowed: the caller must be able to tell the operator that
 * the paper did not come out, while leaving the underlying transaction untouched.
 */
async function dispatch(base64, { printers, branchId, terminalId, title, sourceType, sourceRefId }) {
  const printer = resolvePrinterForContext(printers || [], { branchId, terminalId });
  if (!printer) {
    throw new Error('No receipt printer is configured for this terminal. '
      + 'Configure one under POS → Devices, then reprint.');
  }
  await sendEscPosReceiptToConfiguredPrinter(printer, {
    dataBase64: base64,
    title,
    sourceType,
    sourceRefId,
  });
  return printer;
}

/**
 * Prints (or reprints) a Sales Return receipt.
 *
 * @param ret persisted Sales Return — never in-memory screen state, so a reprint works after
 *            a refresh, a re-login, or from the returns list.
 */
export async function printSalesReturnReceipt(ret, {
  printers = [], branchId = null, terminalId = null,
  paperSize = '80mm', header = {}, isReprint = false, voucher = null,
} = {}) {
  if (!ret?.returnNumber) {
    throw new Error('Cannot print: the sales return has not been saved yet.');
  }

  const body = buildSalesReturnReceiptBody(ret, { paperSize, isReprint, voucher });
  const base64 = await buildEscPosDocumentBase64(body, { ...header, paperSize });

  return dispatch(base64, {
    printers, branchId, terminalId,
    title: `Sales Return ${ret.returnNumber}`,
    sourceType: 'SALES_RETURN',
    sourceRefId: ret.id != null ? String(ret.id) : ret.returnNumber,
  });
}

/**
 * Prints (or reprints) a Credit Voucher, including a native scannable Code 39 barcode.
 *
 * The barcode carries the persisted `barcodeValue`, falling back to the voucher code with
 * separators stripped — the same normalisation the backend lookup applies, so a scan of
 * either resolves to this voucher.
 */
export async function printCreditVoucher(voucher, {
  printers = [], branchId = null, terminalId = null,
  paperSize = '80mm', header = {}, isReprint = false, terms = null,
} = {}) {
  if (!voucher?.voucherCode) {
    throw new Error('Cannot print: this voucher has no persisted code.');
  }

  const body = buildCreditVoucherBody(voucher, { paperSize, isReprint, terms });
  const barcodeValue = voucher.barcodeValue || String(voucher.voucherCode).replace(/-/g, '');

  const base64 = await buildEscPosDocumentBase64(body, {
    ...header,
    paperSize,
    barcode: { value: barcodeValue },
  });

  return dispatch(base64, {
    printers, branchId, terminalId,
    title: `Credit Voucher ${voucher.voucherNumber || voucher.voucherCode}`,
    sourceType: 'CREDIT_VOUCHER',
    sourceRefId: voucher.id != null ? String(voucher.id) : voucher.voucherCode,
  });
}
