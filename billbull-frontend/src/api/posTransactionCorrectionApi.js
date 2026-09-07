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

/**
 * Invoice-number typeahead for the correction form. `q` may be just the trailing sequence the
 * operator typed ("0211") — the backend matches it as a fragment and resolves each hit to the
 * receipt voucher behind the invoice, which is the record a correction actually targets.
 */
export const searchCorrectableInvoices = async (q) => {
  const res = await api.get(`${BASE}/invoice-search`, { params: { q } });
  return res.data;
};

/** Current invoice-numbering prefix (e.g. "INV-2026-") pinned in front of the search box. */
export const getInvoiceNumberPrefix = async () => {
  const res = await api.get(`${BASE}/invoice-prefix`);
  return res.data?.prefix || "";
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
