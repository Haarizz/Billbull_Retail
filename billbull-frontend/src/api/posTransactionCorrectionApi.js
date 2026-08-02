import api from "./axiosConfig";

const BASE = "/api/pos/admin/transaction-corrections";

/**
 * Enterprise Console > POS Administration > Transaction Corrections (Phase 4). Mirrors
 * posSessionDenominationCorrectionApi.js's shape. Never touches ReceiptVoucher/
 * AdvanceApplication/PosCashMovement rows or existing journals — only reads/writes the
 * dedicated correction overlay.
 */
export const getTransactionCorrections = async ({
  branchId, targetType, correctionType, targetId, status, page = 0, size = 20,
} = {}) => {
  const res = await api.get(BASE, { params: { branchId, targetType, correctionType, targetId, status, page, size } });
  return res.data;
};

export const getTransactionCorrectionById = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

/** Original / corrected (if applied) / effective snapshot for a transaction. */
export const getEffectiveTransaction = async (targetType, targetId) => {
  const res = await api.get(`${BASE}/effective`, { params: { targetType, targetId } });
  return res.data;
};

export const createTransactionCorrection = async ({
  targetType, targetId, correctionType, reason,
  correctedCustomerCode, correctedPaymentMode, correctedAmount, correctedInvoiceNumber, correctedCategoryId,
}) => {
  const res = await api.post(BASE, {
    targetType, targetId, correctionType, reason,
    correctedCustomerCode, correctedPaymentMode, correctedAmount, correctedInvoiceNumber, correctedCategoryId,
  });
  return res.data;
};

export const submitTransactionCorrection = async (id) => {
  const res = await api.post(`${BASE}/${id}/submit`);
  return res.data;
};

export const approveTransactionCorrection = async (id, notes) => {
  const res = await api.post(`${BASE}/${id}/approve`, { notes });
  return res.data;
};

export const rejectTransactionCorrection = async (id, reason) => {
  const res = await api.post(`${BASE}/${id}/reject`, { reason });
  return res.data;
};

export const applyTransactionCorrection = async (id) => {
  const res = await api.post(`${BASE}/${id}/apply`);
  return res.data;
};

export const cancelTransactionCorrection = async (id) => {
  const res = await api.post(`${BASE}/${id}/cancel`);
  return res.data;
};
