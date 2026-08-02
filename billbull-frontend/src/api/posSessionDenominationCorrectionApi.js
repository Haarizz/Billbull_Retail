import api from "./axiosConfig";

const BASE = "/api/pos/admin/session-denomination-corrections";

/**
 * Enterprise Console > POS Administration > Session Denomination Corrections (Phase 3).
 * Mirrors posAdminApi.js's shape. Never touches PosSession/X-Report/Z-Report/Day Close data —
 * these calls only read/write the dedicated correction overlay.
 */
export const getDenominationCorrections = async ({
  branchId, sessionId, status, page = 0, size = 20,
} = {}) => {
  const res = await api.get(BASE, { params: { branchId, sessionId, status, page, size } });
  return res.data;
};

export const getDenominationCorrectionById = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

/** Original / corrected (if applied) / effective denomination breakdown for a session. */
export const getEffectiveDenomination = async (sessionId) => {
  const res = await api.get(`${BASE}/session/${sessionId}/effective`);
  return res.data;
};

export const createDenominationCorrection = async ({ sessionId, correctedDenominations, reason }) => {
  const res = await api.post(BASE, { sessionId, correctedDenominations, reason });
  return res.data;
};

export const submitDenominationCorrection = async (id) => {
  const res = await api.post(`${BASE}/${id}/submit`);
  return res.data;
};

export const approveDenominationCorrection = async (id, notes) => {
  const res = await api.post(`${BASE}/${id}/approve`, { notes });
  return res.data;
};

export const rejectDenominationCorrection = async (id, reason) => {
  const res = await api.post(`${BASE}/${id}/reject`, { reason });
  return res.data;
};

export const applyDenominationCorrection = async (id) => {
  const res = await api.post(`${BASE}/${id}/apply`);
  return res.data;
};

export const cancelDenominationCorrection = async (id) => {
  const res = await api.post(`${BASE}/${id}/cancel`);
  return res.data;
};
