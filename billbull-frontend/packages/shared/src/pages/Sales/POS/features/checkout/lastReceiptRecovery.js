// Last Receipt after a reload. `lastPaidInvoice` lives only in memory (useCheckout), so reopening
// the till — or the desktop app — used to show "No transactions yet in this session" even with
// sales on it. These helpers find the session's newest invoice on the server and rebuild the
// snapshot the Last Receipt dialog, Reprint and the share channels read.
//
// What a recovered snapshot cannot know (the cash tendered and change given, the per-tender
// payment block, the customer's balance before the sale) is left empty rather than guessed, and
// `recovered: true` lets the dialog say where the figures came from.

const SKIPPED_STATUSES = new Set(['DRAFT', 'CANCELLED', 'VOID', 'VOIDED']);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The calendar day ('YYYY-MM-DD') the session opened on, falling back to today. */
export const sessionStartDate = (session, today = new Date()) => {
  const raw = session?.sessionDate || session?.openedAt || session?.openTime || session?.startTime;
  const m = typeof raw === 'string' ? raw.match(/^(\d{4}-\d{2}-\d{2})/) : null;
  if (m) return m[1];
  return today.toLocaleDateString('en-CA');
};

/**
 * The newest completed invoice of `sessionId` from the POS invoice list (GET /pos/checkout/invoices,
 * which is latest-first; sorted again here so the answer never depends on that).
 */
export const findLatestSessionInvoice = (invoices, sessionId) => {
  if (!Array.isArray(invoices) || sessionId == null) return null;
  const sid = String(sessionId);
  const stamp = (inv) => Date.parse(inv.createdAt || '') || 0;
  return invoices
    .filter((inv) => inv && String(inv.posSessionId) === sid && !SKIPPED_STATUSES.has(String(inv.status || '').toUpperCase()))
    .sort((a, b) => (stamp(b) - stamp(a)) || (num(b.id) - num(a.id)))[0] || null;
};

/** The customer on the invoice, matched to the till's customer list so phone/email are there to share to. */
const customerFor = (inv, customerOptions, walkIn) => {
  const code = inv.customerCode || '';
  const match = code ? (customerOptions || []).find((c) => c && c.code === code) : null;
  if (!match && !code) {
    return { ...walkIn, phone: inv.customerPhone || '', email: inv.customerEmail || '' };
  }
  return {
    ...(match || {}),
    id: match?.id ?? `code:${code}`,
    code,
    name: match?.name || inv.customerName || code,
    phone: inv.customerPhone || match?.phone || match?.mobile || '',
    email: inv.customerEmail || match?.email || '',
    trn: inv.customerTrn || match?.trn || '',
    address: inv.customerAddress || match?.address || '',
  };
};

/**
 * @param {object} full     the stored invoice (GET /api/sales/invoices/{id}, with items)
 * @param {object} listRow  the same invoice's row from the POS list — its paymentMode is the
 *                          server-corrected tender label ("Cash + Visa"), so it wins
 */
export const receiptFromStoredInvoice = (full, { listRow = null, customerOptions = [], walkIn } = {}) => {
  const total = num(full.invoiceTotal);
  const paid = full.amountPaid != null ? num(full.amountPaid) : total;
  const balance = full.balance != null ? num(full.balance) : Math.max(0, total - paid);
  return {
    id: full.invoiceNumber,
    offline: null,
    total,
    items: (full.items || []).filter((i) => !i.voided).length,
    invoice: full,
    changeAmount: 0,
    customer: customerFor(full, customerOptions, walkIn),
    paymentMode: listRow?.paymentMode || full.paymentMode || 'Cash',
    depositAmount: 0,
    paidAmount: paid,
    creditBalance: balance > 0.004 ? balance : 0,
    paymentBlock: null,
    creditPreviousBalance: null,
    creditInvoiceCredit: null,
    creditAmountPaid: null,
    creditUpdatedBalance: null,
    recovered: true,
  };
};
