import { PAYMENT_TYPES } from './paymentModel';
import { changeAmount as selectChangeAmount, paymentSummary, totalOfType } from './paymentSelectors';

/**
 * The single source of how a payment is *shown* — on every receipt (ESC/POS, HTML, canvas,
 * A4/PDF, bilingual), every preview and the settlement success screen.
 *
 * Every renderer used to carry its own three-branch payment section (payment-lines →
 * cash/card split → cash-only fallback), which is four copies of one rule and four chances
 * for the printed receipt to disagree with the screen. They now all render one
 * `paymentBlock` produced here, so a change to how a tender is worded happens once.
 *
 * Pure — no React, no I/O, directly testable.
 */

/** Labels are what the customer reads, so they never expose an internal type name. */
export const AR_LABEL = 'Transferred to Accounts Receivable';
export const AR_LABEL_SHORT = 'Transferred to A/R';

/**
 * The customer-facing name of one tender.
 *
 * - CASH    → "Cash"
 * - CARD    → the network the customer used: "Visa", "Mastercard"
 * - ONLINE  → the receiving bank: "FAB Online", or plain "Online" if unnamed
 * - CREDIT  → "Transferred to Accounts Receivable" — spelled out, because a customer
 *             reading "Credit" beside an amount can reasonably think it was paid
 */
export function allocationLabel(line, { short = false } = {}) {
  switch (line.paymentType) {
    case PAYMENT_TYPES.CASH:
      return 'Cash';
    case PAYMENT_TYPES.CARD:
      return line.paymentSubtype || 'Card';
    case PAYMENT_TYPES.ONLINE:
      return line.paymentSubtype ? `${line.paymentSubtype} Online` : 'Online';
    case PAYMENT_TYPES.CREDIT:
      return short ? AR_LABEL_SHORT : AR_LABEL;
    case PAYMENT_TYPES.BNPL:
      // The provider is what the customer will be billed by, so it must be named: a receipt
      // that only says "BNPL" leaves them with no idea who takes the installments.
      return line.paymentSubtype ? `BNPL · ${line.paymentSubtype}` : 'Buy Now Pay Later';
    case PAYMENT_TYPES.VOUCHER:
      // Naming the voucher on the receipt matters: the customer needs to see which of their
      // vouchers was spent, and the remaining balance sits on that specific one.
      return line.reference ? `Voucher ${line.reference}` : 'Credit Voucher';
    default:
      return 'Payment';
  }
}

/** Arabic counterpart, for the bilingual templates. */
export function allocationLabelAr(line) {
  switch (line.paymentType) {
    case PAYMENT_TYPES.CASH:
      return 'نقداً';
    case PAYMENT_TYPES.CARD:
      return 'بطاقة';
    case PAYMENT_TYPES.ONLINE:
      return 'تحويل بنكي';
    case PAYMENT_TYPES.CREDIT:
      return 'محول إلى الذمم المدينة';
    case PAYMENT_TYPES.BNPL:
      return line.paymentSubtype ? `اشترِ الآن وادفع لاحقاً · ${line.paymentSubtype}` : 'اشترِ الآن وادفع لاحقاً';
    case PAYMENT_TYPES.VOUCHER:
      return 'قسيمة رصيد';
    default:
      return '';
  }
}

/**
 * Builds the payment block every renderer prints.
 *
 * @param {Array}  lines        the allocations, in the order the cashier entered them
 * @param {number} invoiceTotal the bill being settled
 * @param {boolean} short       use the abbreviated A/R label (narrow 58mm receipts)
 *
 * @returns {{summaryLabel: string, details: Array, totalReceived: number,
 *            transferredToAr: number, invoiceTotal: number, changeAmount: number,
 *            hasReceivable: boolean}}
 *          or null when there are no allocations (a reprint of a historical invoice)
 */
export function buildPaymentBlock(lines, { invoiceTotal = 0, short = false } = {}) {
  const active = (lines || []).filter((l) => l && l.amount > 0);
  if (active.length === 0) return null;

  const transferredToAr = totalOfType(active, PAYMENT_TYPES.CREDIT);
  const change = selectChangeAmount(active, invoiceTotal);
  // What the customer actually handed over: every tender except the receivable, less any
  // cash given back. This is the figure that must reconcile with the drawer.
  const totalReceived = round2(
    active.reduce((sum, l) => (l.paymentType === PAYMENT_TYPES.CREDIT ? sum : sum + l.amount), 0) - change,
  );

  return {
    /** "Cash", "Cash + Visa", "Cash + Visa + Online + Credit". Never "Mixed". */
    summaryLabel: paymentSummary(active) || 'Cash',
    /** One row per allocation, in entry order. */
    details: active.map((l) => ({
      label: allocationLabel(l, { short }),
      labelAr: allocationLabelAr(l),
      amount: round2(l.amount),
      type: l.paymentType,
      /** False for the receivable — it is owed, not collected. */
      received: l.paymentType !== PAYMENT_TYPES.CREDIT,
      reference: l.reference || null,
    })),
    totalReceived,
    transferredToAr: round2(transferredToAr),
    hasReceivable: transferredToAr > 0,
    invoiceTotal: round2(invoiceTotal),
    changeAmount: round2(change),
  };
}

/**
 * Word-wraps a payment label into lines that never exceed `maxChars` columns.
 *
 * A tender label is not always short: "Transferred to Accounts Receivable" is 34 characters,
 * which is wider than the 32-column printable area of a 58mm receipt on its own — before the
 * amount. Truncating it hides what happened to the money; letting it run makes the printer
 * wrap wherever it likes and pushes the amount out of its column. So the wrap happens here,
 * once, and every renderer draws the same lines.
 *
 * Wrapping is at word boundaries only. A single word longer than the budget (no space to
 * break at) is hard-split as the last resort, because overflowing the paper is worse.
 *
 * @returns {string[]} at least one line, always
 */
export function wrapPaymentLabel(label, maxChars) {
  const text = String(label ?? '').trim();
  const width = Math.max(1, Math.floor(maxChars) || 0);
  if (!text) return [''];
  if (!Number.isFinite(width) || text.length <= width) return [text];

  const lines = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
    // A word that cannot fit a line of its own: emit full-width chunks and carry the tail.
    while (current.length > width) {
      lines.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/** Never squeeze a wrapped label below this many columns, however wide the amount is. */
export const MIN_PAYMENT_LABEL_COLUMNS = 8;

/**
 * The label/amount rows a receipt prints under "Payment Details", already including the
 * totals footer. Renderers differ only in how they draw a row, never in which rows exist.
 *
 * Fixed-width renderers (ESC/POS, the thermal HTML preview) pass their column count as
 * `width` plus a `formatAmount` that produces the exact string they will print on the right.
 * Each row then comes back with `labelLines` — the label already wrapped to the space left
 * over beside that amount. Renderers draw every line but the last on its own, and pair the
 * last line with the right-aligned amount, so the amount column never moves.
 *
 * Callers that lay out with CSS (back-office panels, the settlement success modal) omit
 * `width`; they get a single-element `labelLines` and let the browser wrap.
 *
 * @param {object} block
 * @param {number} [options.width]          total printable columns of the row
 * @param {function} [options.formatAmount] row → the amount string that will be printed
 * @param {string} [options.labelSuffix]    appended to the label before wrapping (e.g. ':')
 * @returns {Array<{label: string, labelLines: string[], labelAr: string, amount: number,
 *                  emphasis: boolean}>}
 */
export function paymentBlockRows(block, { width, formatAmount, labelSuffix = '' } = {}) {
  if (!block) return [];
  const rows = block.details.map((d) => ({
    label: d.label, labelAr: d.labelAr, amount: d.amount, emphasis: false,
  }));
  if (block.changeAmount > 0) {
    rows.push({ label: 'Change Returned', labelAr: 'المبلغ المرتجع', amount: block.changeAmount, emphasis: true });
  }
  // Only worth a totals footer when the payment was split; a single tender already
  // states its own total on the row above.
  if (block.details.length > 1) {
    rows.push({ label: 'Total Received', labelAr: 'إجمالي المستلم', amount: block.totalReceived, emphasis: true });
  }

  // Wrap once, here, so no renderer has to know how to break a label.
  return rows.map((row) => {
    const text = `${row.label}${labelSuffix}`;
    if (!width) return { ...row, labelLines: [text] };
    const amount = String(formatAmount ? formatAmount(row) : row.amount.toFixed(2));
    // One column of separation between the label and the amount is the minimum that keeps
    // them readable as two columns.
    const budget = Math.max(MIN_PAYMENT_LABEL_COLUMNS, width - amount.length - 1);
    return { ...row, labelLines: wrapPaymentLabel(text, budget) };
  });
}

/**
 * Builds a payment block from *recorded* tender rows — the persisted form of a sale's
 * allocations, as returned by `GET /api/payments/invoice-summary`.
 *
 * Back-office screens (sales list, invoice details, customer history, exports) show sales
 * that were settled minutes or years ago, so they cannot read the live allocation state.
 * This maps what was recorded onto the identical block the receipt printed, which is what
 * lets those screens reuse `paymentBlockRows` rather than growing their own formatting.
 *
 * Historical sales are handled by the same path: their tender rows exist too, so a sale whose
 * invoice says "Mixed" still yields real per-tender rows. Only a sale with no recorded tender
 * at all (an unpaid credit invoice) returns null, and the caller falls back to the stored
 * payment-mode text.
 *
 * @param {Array} records  [{label, type, amount, reference, bankName}] in recorded order
 */
export function buildPaymentBlockFromRecords(records, { invoiceTotal = 0, short = false } = {}) {
  const rows = (records || []).filter((r) => r && Number(r.amount) > 0);
  if (rows.length === 0) return null;

  // Re-express each recorded row as an allocation, so labelling goes through exactly the
  // same function the till and the printer use.
  const lines = rows.map((r) => ({
    paymentType: PAYMENT_TYPES[r.type] || PAYMENT_TYPES.CASH,
    // A card row records its network as the mode ("Visa"); a BNPL row records its provider
    // as "BNPL Tabby"; an online row records the bank separately. Either way the subtype is
    // what makes the label customer-readable.
    paymentSubtype: r.type === 'CARD' ? r.label
      : r.type === 'BNPL' ? bnplProviderFromMode(r.label)
        : bankDisplayName(r.bankName),
    amount: Number(r.amount) || 0,
    reference: r.reference || null,
  }));

  return buildPaymentBlock(lines, { invoiceTotal, short });
}

/**
 * "BNPL Tabby" is how a financed leg is recorded (the prefix is what every report buckets
 * on); "Tabby" is the provider name a customer reads. Returns null for a leg recorded with
 * no provider, so the label falls back to the generic wording.
 */
export function bnplProviderFromMode(mode) {
  if (!mode) return null;
  const stripped = String(mode).replace(/^\s*BNPL\b[\s·-]*/i, '').trim();
  return stripped || null;
}

/**
 * "1010 - FAB Current" is how a bank account is stored (code-prefixed so the backend can
 * resolve the Chart-of-Accounts row); "FAB Current" is what a customer should read.
 */
export function bankDisplayName(bankAccountName) {
  if (!bankAccountName) return null;
  const stripped = String(bankAccountName).replace(/^\s*[\w.-]+\s+-\s+/, '').trim();
  return stripped || null;
}

/**
 * Whether a sale matches a payment filter such as "Cash" or "Card".
 *
 * A filter on tender type cannot be an equality test against the invoice's payment-mode text
 * any more: a sale settled Cash + Visa should appear under both "Cash" and "Card", and it is
 * stored as neither. So the match is made against the allocations when they are known, and
 * against the stored text only as a fallback.
 *
 * "Mixed" stays selectable because historical invoices are literally stored that way; it now
 * means "settled with more than one tender", which also catches new split sales.
 *
 * "Advance" is likewise historical-only: Customer Advance was retired as a checkout tender, so
 * no new sale can carry one. It stays selectable purely so the invoices that were settled that
 * way before the change remain findable, and it matches on the stored label alone.
 *
 * @param {string} filter        'All' | 'Cash' | 'Card' | 'Online' | 'Credit' | 'Advance' | 'Mixed'
 * @param {object} block         the sale's payment block, or null when unknown
 * @param {string} storedMode    the invoice's paymentMode text
 */
export function matchesPaymentFilter(filter, block, storedMode) {
  if (!filter || filter === 'All') return true;
  const mode = (storedMode || '').toLowerCase();

  if (filter === 'Mixed') {
    // More than one distinct tender, however the sale was recorded.
    if (block) return new Set(block.details.map((d) => d.type)).size > 1;
    return mode.includes('mixed') || mode.includes('+');
  }

  // Retired tender: nothing in `block` can be an advance any more, so this can only ever be a
  // stored-label match against pre-retirement invoices.
  if (filter === 'Advance') return mode.includes('advance');

  const wanted = FILTER_TO_TYPE[filter];
  if (!wanted) return true;
  if (block) return block.details.some((d) => d.type === wanted);
  // No allocations recorded — fall back to the stored label, which for a split sale reads
  // "Cash + Visa" and so still matches a substring test.
  return mode.includes(filter.toLowerCase());
}

const FILTER_TO_TYPE = {
  Cash: PAYMENT_TYPES.CASH,
  Card: PAYMENT_TYPES.CARD,
  Online: PAYMENT_TYPES.ONLINE,
  Credit: PAYMENT_TYPES.CREDIT,
  BNPL: PAYMENT_TYPES.BNPL,
};

/** The tender filters offered by back-office screens, in a stable order. 'Advance' and 'Mixed'
 *  are historical-only — no new sale produces either. */
export const PAYMENT_FILTERS = ['All', 'Cash', 'Card', 'Online', 'Credit', 'BNPL', 'Advance', 'Mixed'];

/**
 * A single-cell payment summary for spreadsheet/CSV export: "Cash 80.00 | Visa 10.00".
 * Exports get the same breakdown the receipt showed rather than just a mode label.
 */
export function paymentDetailsForExport(block, storedMode) {
  if (!block) return storedMode || '';
  return block.details.map((d) => `${d.label} ${d.amount.toFixed(2)}`).join(' | ');
}

/**
 * Checks that a payment block adds up, and says how it doesn't when it fails.
 *
 * The identity every settled sale must satisfy is:
 *
 *     invoiceTotal == totalReceived + transferredToAr
 *
 * with cash overpayment excluded from `totalReceived` (it left again as change). Nothing
 * previously asserted this on the client, so a rounding slip or a mis-summed tender could
 * reach the printer. This runs before the block is rendered or posted, which is the last
 * point where it is still cheap to catch.
 *
 * Descriptive rather than throwing: a caller decides whether to block settlement or merely
 * warn, and the findings carry the actual figures so a support engineer never has to
 * reconstruct them.
 *
 * @returns {{consistent: boolean, findings: Array<{code, severity, message}>}}
 */
export function reconcilePaymentBlock(block) {
  if (!block) return { consistent: true, findings: [] };

  const findings = [];
  const add = (code, severity, message) => findings.push({ code, severity, message });

  // (1) The core identity.
  const reconstructed = round2(block.totalReceived + block.transferredToAr);
  if (Math.abs(reconstructed - block.invoiceTotal) > RECONCILIATION_TOLERANCE) {
    add('TOTALS_DO_NOT_RECONCILE', 'error',
      `Received ${block.totalReceived.toFixed(2)} + receivable ${block.transferredToAr.toFixed(2)}`
      + ` = ${reconstructed.toFixed(2)}, but the invoice total is ${block.invoiceTotal.toFixed(2)}.`);
  }

  // (2) Only cash can leave again as change; anything else would have to be refunded.
  if (block.changeAmount > RECONCILIATION_TOLERANCE) {
    const cash = block.details
      .filter((d) => d.type === PAYMENT_TYPES.CASH)
      .reduce((sum, d) => sum + d.amount, 0);
    if (cash <= RECONCILIATION_TOLERANCE) {
      add('CHANGE_WITHOUT_CASH', 'error',
        `Change of ${block.changeAmount.toFixed(2)} with no cash tendered.`);
    }
  }

  // (3) A tender row that contributes nothing corrupts the breakdown even though the
  // totals still balance.
  block.details.forEach((d) => {
    if (d.amount <= 0) {
      add('NON_POSITIVE_ALLOCATION', 'error', `Tender '${d.label}' has a non-positive amount.`);
    }
  });

  // (4) The summary must name every tender that was used, or the receipt understates the
  // payment relative to its own detail rows.
  const labelledTypes = new Set(block.details.map((d) => d.type));
  if (labelledTypes.size > 0 && !block.summaryLabel) {
    add('MISSING_SUMMARY', 'error', 'Payment has tenders but no summary label.');
  }

  // (5) The word this whole architecture exists to remove.
  if (/mixed/i.test(block.summaryLabel || '')) {
    add('LEGACY_MIXED_LABEL', 'warning',
      `Summary label '${block.summaryLabel}' still says "Mixed".`);
  }

  return { consistent: findings.every((f) => f.severity !== 'error'), findings };
}

/** Half a fils — the same tolerance the allocation selectors use. */
export const RECONCILIATION_TOLERANCE = 0.005;

/**
 * Audit facts about a payment, for diagnostics and administrative inspection: how many
 * tenders, in what order, of what types, and the derived figures. Deliberately flat and
 * JSON-friendly so it can go straight into a log line or a support bundle.
 */
export function paymentAuditSnapshot(block) {
  if (!block) return null;
  return {
    allocationCount: block.details.length,
    allocationOrder: block.details.map((d) => d.label),
    allocationTypes: block.details.map((d) => d.type),
    summaryLabel: block.summaryLabel,
    totalReceived: block.totalReceived,
    transferredToAr: block.transferredToAr,
    changeAmount: block.changeAmount,
    invoiceTotal: block.invoiceTotal,
    ...reconcilePaymentBlock(block),
  };
}

/**
 * The combined payment-mode label for a set of tenders, de-duplicated and in the order they
 * were taken: "Cash", "Cash + Visa", "Cash + Visa + Online".
 *
 * The one implementation of that rule for callers outside the POS allocation model — the
 * back-office settlement modal and the split-payment list, which work with plain
 * `{mode, amount}` records rather than allocations. Those screens each had their own
 * `.join(' + ')`, which is how one of them ends up de-duplicating and another doesn't.
 *
 * @param {Array<{mode: string}>} records
 */
export function summaryLabelForModes(records) {
  const seen = [];
  (records || []).forEach((r) => {
    const mode = (r?.mode || '').trim();
    if (mode && !seen.includes(mode)) seen.push(mode);
  });
  return seen.length > 0 ? seen.join(' + ') : null;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
