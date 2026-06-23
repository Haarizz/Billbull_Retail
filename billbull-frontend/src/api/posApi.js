import api from "./axiosConfig";

const BASE = "/api/pos";

// ── Terminal registration ──────────────────────────────────────────────────

export const registerPosTerminal = async ({ deviceFingerprint, deviceInfo, terminalName, counterName }) => {
  const res = await api.post(`${BASE}/terminals/register`, {
    deviceFingerprint, deviceInfo, terminalName, counterName,
  });
  return res.data; // { terminal, isNew }
};

// ── POS Settings ───────────────────────────────────────────────────────────

export const getPosSettings = async () => {
  const res = await api.get(`${BASE}/settings`);
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

// ── Session management ─────────────────────────────────────────────────────

export const openPosSession = async ({ terminalId, counterName, openingCash = 0 }) => {
  const res = await api.post(`${BASE}/sessions/open`, { terminalId, counterName, openingCash });
  return res.data;
};

export const getActivePosSession = async (terminalId = "") => {
  const res = await api.get(`${BASE}/sessions/active`, { params: { terminalId } });
  return res.data; // null / undefined if 204
};

export const closePosSession = async (sessionId, { closingCash, notes } = {}) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/close`, { closingCash, notes });
  return res.data;
};

export const addPosCashMovement = async (sessionId, { movementType, amount, description }) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/cash-movement`, {
    movementType, amount, description,
  });
  return res.data;
};

// ── POS Invoice list (for Reprint screen) ─────────────────────────────────

export const getPosInvoices = async ({ dateFrom, dateTo, branchId } = {}) => {
  const res = await api.get(`${BASE}/checkout/invoices`, {
    params: { dateFrom, dateTo, branchId },
  });
  return res.data;
};

// ── X-Report / Z-Report ────────────────────────────────────────────────────

export const getPosXReport = async (sessionId) => {
  const res = await api.get(`${BASE}/sessions/${sessionId}/x-report`);
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

export const getPosZReport = async (branchId, date) => {
  const res = await api.get(`${BASE}/sessions/z-report`, {
    params: { branchId, date: date || new Date().toISOString().slice(0, 10) },
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
