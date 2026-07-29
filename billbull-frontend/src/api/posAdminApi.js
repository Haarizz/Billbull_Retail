import api from "./axiosConfig";

const BASE = "/api/pos/admin/corrections";

/**
 * Enterprise Console > POS Administration — Phase 1 generic correction-request lifecycle.
 * No domain-specific (denomination/transaction/category) correction forms exist yet
 * (Phase 2/3/4) — this file only covers the generic request/approve/reject/cancel surface,
 * mirroring posCashMovementApi.js's shape.
 */
export const getCorrectionRequests = async ({
  branchId, status, targetType, correctionType, page = 0, size = 20,
} = {}) => {
  const res = await api.get(BASE, {
    params: { branchId, status, targetType, correctionType, page, size },
  });
  return res.data;
};

export const getCorrectionRequestById = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

/** Not wired to any UI form yet in Phase 1 — reserved for later phases' domain-specific
 *  correction request screens (denomination, transaction, cash movement category). */
export const createCorrectionRequest = async (payload) => {
  const res = await api.post(BASE, payload);
  return res.data;
};

export const submitCorrectionRequest = async (id) => {
  const res = await api.post(`${BASE}/${id}/submit`);
  return res.data;
};

export const approveCorrectionRequest = async (id, notes) => {
  const res = await api.post(`${BASE}/${id}/approve`, { notes });
  return res.data;
};

export const rejectCorrectionRequest = async (id, reason) => {
  const res = await api.post(`${BASE}/${id}/reject`, { reason });
  return res.data;
};

export const cancelCorrectionRequest = async (id) => {
  const res = await api.post(`${BASE}/${id}/cancel`);
  return res.data;
};
