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

// ── X-Report / Z-Report ────────────────────────────────────────────────────

export const getPosXReport = async (sessionId) => {
  const res = await api.get(`${BASE}/sessions/${sessionId}/x-report`);
  return res.data;
};

export const getPosZReport = async (branchId, date) => {
  const res = await api.get(`${BASE}/sessions/z-report`, {
    params: { branchId, date: date || new Date().toISOString().slice(0, 10) },
  });
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
