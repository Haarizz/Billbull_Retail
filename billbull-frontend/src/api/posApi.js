import api from "./axiosConfig";

const BASE = "/api/pos";

// ── Terminal registration ──────────────────────────────────────────────────

export const registerPosTerminal = async ({
  terminalId, deviceFingerprint, deviceInfo, terminalName, counterName,
  operatingSystem, browser,
}) => {
  const res = await api.post(`${BASE}/terminals/register`, {
    terminalId, deviceFingerprint, deviceInfo, terminalName, counterName,
    operatingSystem, browser,
  });
  return res.data; // { terminal, isNew, pending }
};

export const heartbeatPosTerminal = async (terminalId) => {
  const res = await api.post(`${BASE}/terminals/${terminalId}/heartbeat`);
  return res.data; // { terminalId, status, lastHeartbeatAt }
};

export const approvePosTerminal = async (id) => {
  const res = await api.post(`${BASE}/terminals/${id}/approve`);
  return res.data;
};

export const rejectPosTerminal = async (id, reason) => {
  const res = await api.post(`${BASE}/terminals/${id}/reject`, { reason });
  return res.data;
};

export const archivePosTerminal = async (id, reason) => {
  const res = await api.post(`${BASE}/terminals/${id}/archive`, { reason });
  return res.data;
};

export const restorePosTerminal = async (id) => {
  const res = await api.post(`${BASE}/terminals/${id}/restore`);
  return res.data;
};

// Permanent retirement — no restore endpoint exists for this status, by design.
export const decommissionPosTerminal = async (id, reason) => {
  const res = await api.post(`${BASE}/terminals/${id}/decommission`, { reason });
  return res.data;
};

// Terminal Auto-Archive lifecycle
export const keepTerminalActive = async (id) => {
  const res = await api.post(`${BASE}/terminals/${id}/keep-active`);
  return res.data;
};

export const archiveTerminalNow = async (id) => {
  const res = await api.post(`${BASE}/terminals/${id}/archive-now`);
  return res.data;
};

export const setTerminalAutoArchiveExempt = async (id, exempt) => {
  const res = await api.put(`${BASE}/terminals/${id}/auto-archive-exempt`, { exempt });
  return res.data;
};

export const assignTerminalCounter = async (id, counterId) => {
  const res = await api.post(`${BASE}/terminals/${id}/assign-counter`, { counterId });
  return res.data;
};

export const getPendingTerminals = async (branchId) => {
  const res = await api.get(`${BASE}/terminals/branch/${branchId}/pending`);
  return res.data;
};

// ── POS Settings ───────────────────────────────────────────────────────────

export const getPosSettings = async () => {
  const res = await api.get(`${BASE}/settings`);
  return res.data;
};

// Explicit branch variant — use this whenever a specific terminal/branch is already known
// (e.g. the live POS terminal session), instead of the ambient getPosSettings(), which
// resolves branch from the session's Branch Selector state and can silently diverge from
// the terminal's actual branch (e.g. "All Branches" selected, or a different browser tab).
export const getPosSettingsForBranch = async (branchId) => {
  const res = await api.get(`${BASE}/settings/branch/${branchId}`);
  return res.data;
};

export const savePosSettings = async (settings) => {
  const res = await api.post(`${BASE}/settings`, settings);
  return res.data;
};

// Verify a supervisor PIN server-side. The PIN is no longer shipped to the client
// (ARCHFIX S5); the backend compares it against the stored BCrypt hash.
export const verifyPosSupervisorPin = async (pin) => {
  const res = await api.post(`${BASE}/settings/verify-pin`, { pin });
  return res.data?.valid === true;
};

// Verify supervisor identity by user credentials for shift handover.
// Returns { valid, supervisorName, supervisorUsername, reason } — never ships passwords to client.
export const verifySupervisorAuth = async ({ email, password, terminalId, lockedBy }) => {
  const res = await api.post(`${BASE}/settings/supervisor-auth`, { email, password, terminalId, lockedBy });
  return res.data; // { valid: bool, supervisorName?: string, supervisorUsername?: string, reason?: string }
};

// ── Session management ─────────────────────────────────────────────────────

export const openPosSession = async ({ terminalId, counterName, openingCash = 0 }) => {
  const res = await api.post(`${BASE}/sessions/open`, { terminalId, counterName, openingCash });
  return res.data;
};

export const getActivePosSession = async (terminalId = "") => {
  const res = await api.get(`${BASE}/sessions/active`, { params: { terminalId } });
  return res.data; // null / undefined if 204
};

export const getPosSessionById = async (sessionId) => {
  const res = await api.get(`${BASE}/sessions/${sessionId}`);
  return res.data;
};

export const suspendPosSession = async (sessionId) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/suspend`);
  return res.data;
};

export const resumePosSession = async (sessionId) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/resume`);
  return res.data;
};

export const supervisorTakeoverSession = async (sessionId, supervisorPin) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/supervisor-takeover`, { supervisorPin });
  return res.data;
};

export const touchSessionActivity = async (sessionId) => {
  await api.post(`${BASE}/sessions/${sessionId}/touch-activity`);
};

// Session Roaming — explicit, operator-confirmed transfer of an existing session to a
// different terminal. confirm:true is always sent (backend safety gate requires it).
// supervisorPin is only required when the transfer policy reports SUPERVISOR_REQUIRED.
export const transferPosSession = async (sessionId, { destinationTerminalId, reason, supervisorPin } = {}) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/transfer`, {
    destinationTerminalId, reason, supervisorPin, confirm: true,
  });
  return res.data;
};

// Phase 12 - Lightweight session synchronization for polling
export const syncPosSession = async (sessionId, terminalId) => {
  const res = await api.get(`${BASE}/sessions/${sessionId}/sync`, { params: { terminalId } });
  return res.data;
};

export const closePosSession = async (sessionId, {
  closingCash, notes, closingDenominations, supervisorApproved,
  cardBatchNo, cardSettlementVerified, cardClosingCash, closingCashierName, closingSupervisorName, closingRemarks,
  // Single-use grant from verifySessionClosurePermission. Required when the logged-in
  // user isn't the session owner (Day Close closing another cashier's session).
  closureAuthToken,
} = {}) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/close`, {
    closingCash, notes, closingDenominations, supervisorApproved,
    cardBatchNo, cardSettlementVerified, cardClosingCash, closingCashierName, closingSupervisorName, closingRemarks,
    closureAuthToken,
  });
  return res.data;
};

export const addPosCashMovement = async (sessionId, { movementType, amount, description, reference, categoryId }) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/cash-movement`, {
    movementType, amount, description, reference, categoryId,
  });
  return res.data;
};

// ── POS Invoice list (for Reprint screen) ─────────────────────────────────

/**
 * Look up a single invoice for the Sales Return flow.
 * Pass invoiceNumber for exact/prefix lookup, or customerMobile for mobile-based lookup.
 * Returns the SalesInvoice with items, or throws 404.
 */
export const lookupPosInvoice = async ({ invoiceNumber, customerMobile, dateFrom, branchId } = {}) => {
  const res = await api.get(`${BASE}/checkout/invoices/lookup`, {
    params: { invoiceNumber, customerMobile, dateFrom, branchId },
  });
  return res.data;
};

export const getPosInvoices = async ({ dateFrom, dateTo, branchId } = {}) => {
  const res = await api.get(`${BASE}/checkout/invoices`, {
    params: { dateFrom, dateTo, branchId },
  });
  return res.data;
};

/** Returns { invoice, zatcaQr, sellerName, trn } for receipt rendering. */
export const getPosReceiptData = async (invoiceId) => {
  const res = await api.get(`${BASE}/checkout/invoices/${invoiceId}/receipt`);
  return res.data;
};

/**
 * Same payload as getPosReceiptData, but also logs a RECEIPT_REPRINTED audit
 * entry and bumps the invoice's reprintCount/lastReprintedBy/lastReprintedAt.
 * Call this (not getPosReceiptData) whenever the user reprints an already-issued receipt.
 */
export const reprintPosReceipt = async (invoiceId, { sessionId, terminalId, branchId } = {}) => {
  const res = await api.get(`${BASE}/checkout/invoices/${invoiceId}/reprint`, {
    params: { sessionId, terminalId, branchId },
  });
  return res.data;
};

// ── X-Report / Z-Report ────────────────────────────────────────────────────

export const getPosXReport = async (sessionId) => {
  const res = await api.get(`${BASE}/sessions/${sessionId}/x-report`);
  return res.data;
};

/**
 * Explicitly generate (and mark complete) the X-Report for an open session.
 * Stamps the session so the end-of-day Z-Report gate sees this terminal as done.
 * Use this when the cashier deliberately runs their X-Report; the read-only
 * getPosXReport above is for the dashboard preview and does NOT mark completion.
 */
export const generatePosXReport = async (sessionId) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/x-report/generate`);
  return res.data;
};

export const getAllPosTerminals = async (branchId) => {
  const res = await api.get(`${BASE}/terminals/branch/${branchId}/all`);
  return res.data;
};

export const renamePosTerminal = async (terminalId, { terminalName, counterName }) => {
  const res = await api.put(`${BASE}/terminals/${terminalId}/rename`, { terminalName, counterName });
  return res.data;
};

export const setTerminalStatus = async (terminalId, status) => {
  const res = await api.put(`${BASE}/terminals/${terminalId}/status`, { status });
  return res.data;
};

export const setMainPosTerminal = async (terminalId) => {
  const res = await api.put(`${BASE}/terminals/${terminalId}/set-main`);
  return res.data;
};

export const getPosZReport = async (branchId, date, startSessionId, endSessionId) => {
  const res = await api.get(`${BASE}/sessions/z-report`, {
    params: {
      branchId,
      date: date || new Date().toISOString().slice(0, 10),
      startSessionId: startSessionId || undefined,
      endSessionId: endSessionId || undefined,
    },
  });
  return res.data;
};

/**
 * Day Close review-screen summary: auto-resolved (or supervisor-adjusted) first/last
 * session, total sessions, cashiers/counters/terminals, trading time span, session
 * statuses, and any sessions excluded by a narrowed range. Read-only.
 */
export const getPosDayCloseSummary = async (branchId, date, startSessionId, endSessionId) => {
  const res = await api.get(`${BASE}/sessions/day-close/summary`, {
    params: {
      branchId,
      date: date || new Date().toISOString().slice(0, 10),
      startSessionId: startSessionId || undefined,
      endSessionId: endSessionId || undefined,
    },
  });
  return res.data;
};

export const closePosDay = async (branchId, date, startSessionId, endSessionId, acknowledgeExclusions) => {
  const res = await api.post(`${BASE}/sessions/close-day`, null, {
    params: {
      branchId,
      date: date || new Date().toISOString().slice(0, 10),
      startSessionId: startSessionId || undefined,
      endSessionId: endSessionId || undefined,
      acknowledgeExclusions: acknowledgeExclusions || undefined,
    },
  });
  return res.data;
};

/**
 * ERP rule: X-Report print/PDF/Excel export is only allowed once the session is
 * closed (on-screen preview via getPosXReport stays available while open). Throws
 * (409) if the session isn't closed yet — callers should catch and surface the message.
 */
export const checkPosXReportPrintable = async (sessionId) => {
  await api.post(`${BASE}/sessions/${sessionId}/x-report/print-check`);
};

/**
 * ERP rule: Z-Report print/PDF/Excel export is only allowed once the business day
 * has been closed. Throws (409) if the day isn't closed yet.
 */
export const checkPosZReportPrintable = async (branchId, date) => {
  await api.get(`${BASE}/sessions/z-report/print-check`, {
    params: { branchId, date: date || new Date().toISOString().slice(0, 10) },
  });
};

/**
 * Composed Business Date / operating-hours / open-session view for POS mount —
 * backs the blocking "previous day session still open" popup.
 */
export const getPosDayStatus = async (terminalId = "") => {
  const res = await api.get(`${BASE}/sessions/day-status`, { params: { terminalId } });
  return res.data;
};

/**
 * Date-range session history for the X-Report history picker (browse/reprint a
 * past closed session). branchId defaults to the caller's current branch if omitted.
 */
export const getPosSessionHistory = async ({ branchId, dateFrom, dateTo, terminalId, status, page = 0, size = 20 }) => {
  const res = await api.get(`${BASE}/sessions/history`, {
    params: { branchId, dateFrom, dateTo, terminalId, status, page, size },
  });
  return res.data;
};


// ── Unified search / scan resolver ─────────────────────────────────────────

/**
 * Resolve one scanned/typed value to a single best-match action.
 * Returns { type: 'PRODUCT'|'CUSTOMER'|'NONE', product, pinnedBatchNumber, customer }.
 */
export const resolvePosEntry = async (q) => {
  const res = await api.get(`${BASE}/resolve`, { params: { q } });
  return res.data;
};

// ── POS Checkout ───────────────────────────────────────────────────────────

/**
 * Create a POS_SALE invoice + record payment in one call.
 * Returns the saved SalesInvoice (with real invoiceNumber, id, etc.)
 */
export const posCheckout = async (payload) => {
  const res = await api.post(`${BASE}/checkout`, payload);
  return res.data;
};

/**
 * What the server's checkout endpoint accepts. Used to confirm it understands progressive
 * `paymentAllocations` before a sale is settled — a server predating them would ignore the
 * field and post the invoice with no payment recorded, so the terminal must not guess.
 *
 * A 404/405 means the endpoint itself predates this contract, which is itself the answer:
 * that server does not support allocations. Any other failure is reported as unknown so the
 * caller can distinguish "old server" from "server unreachable".
 */
export const getPosCheckoutCapabilities = async () => {
  try {
    const res = await api.get(`${BASE}/checkout/capabilities`);
    return { ok: true, capabilities: res.data };
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404 || status === 405) {
      return { ok: true, capabilities: { paymentAllocations: false, checkoutApiVersion: 1 } };
    }
    return { ok: false, error: err };
  }
};

// ── Layaways ────────────────────────────────────────────────────────────────

/** Create a layaway (reserved sale) from the current cart. Returns the saved PosLayaway. */
export const createLayaway = async (payload) => {
  const res = await api.post(`${BASE}/layaways`, payload);
  return res.data;
};

/** List/filter layaways. params: { branchId, status, customer, number } (all optional). */
export const getLayaways = async (params = {}) => {
  const res = await api.get(`${BASE}/layaways`, { params });
  return res.data;
};

export const getLayaway = async (id) => {
  const res = await api.get(`${BASE}/layaways/${id}`);
  return res.data;
};

/** Cancel a layaway (releases reserved stock). Requires supervisor/delete rights — 403 otherwise. */
export const cancelLayaway = async (id) => {
  const res = await api.post(`${BASE}/layaways/${id}/cancel`);
  return res.data;
};

/** Stamp a layaway as converted after its conversion POS sale has posted. */
export const convertLayaway = async (id, { invoiceId, invoiceNumber }) => {
  const res = await api.post(`${BASE}/layaways/${id}/convert`, { invoiceId, invoiceNumber });
  return res.data;
};

// ── Hold (parked carts, session-scoped) ─────────────────────────────────────

export const holdSale = async (payload) => {
  const res = await api.post(`${BASE}/held-sales`, payload);
  return res.data;
};

export const getHeldSales = async (sessionId) => {
  const res = await api.get(`${BASE}/held-sales`, { params: { sessionId } });
  return res.data;
};

/** Recall a held cart: returns it and removes it from the held list. */
export const recallHeldSale = async (id) => {
  const res = await api.post(`${BASE}/held-sales/${id}/recall`);
  return res.data;
};

// ── Credit Balance Check ───────────────────────────────────────────────────

/**
 * Look up a customer's outstanding AR, credit limit, and advance balance.
 * q: customer code / mobile / phone / email / name fragment.
 * Returns { found, customer, outstanding, creditLimit, advanceBalance }.
 */
export const posCreditBalance = async (q) => {
  const res = await api.get(`${BASE}/credit-balance`, { params: { q } });
  return res.data;
};

// ── Batch / Sold-Item Check ────────────────────────────────────────────────

/**
 * Search sold invoice items by batch number or invoice number.
 * Serial number concept not yet implemented — batch-only.
 * Returns { results: [...], total }.
 */
export const posBatchCheck = async ({ batchNumber = '', invoiceNumber = '', itemCode = '', customerMobile = '' } = {}) => {
  const res = await api.get(`${BASE}/batch-check`, {
    params: { batchNumber, invoiceNumber, itemCode, customerMobile },
  });
  return res.data;
};

// ── Customer purchase history (POS History tab) ───────────────────────────
export const getPosCustomerHistory = async (customerCode) => {
  const res = await api.get(`${BASE}/customer-history`, { params: { customerCode } });
  return res.data;
};

// ── Delivery orders ────────────────────────────────────────────────────────

/** List pending delivery orders (CONFIRMED / PARTIALLY_PAID) for the given branch. */
export const getDeliveryOrders = async (branchId) => {
  const res = await api.get(`${BASE}/checkout/deliveries`, { params: { branchId } });
  return res.data;
};

/** Record payment for a delivery order and mark it PAID. */
export const settleDeliveryOrder = async (invoiceId, payload) => {
  const res = await api.post(`${BASE}/checkout/deliveries/${invoiceId}/settle`, payload);
  return res.data;
};


export const verifySessionClosurePermission = async (sessionId, usernameOrEmail, password) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/authorize-closure`, { usernameOrEmail, password });
  return res.data;
};
