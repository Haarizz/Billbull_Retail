import api from "@billbull/shared/api/axiosConfig";

// ── Cheque books (bank accounts the company writes cheques on) ─────────────

export const getChequeBooks = async () => {
  const res = await api.get("/api/pay-cheques/books");
  return res.data;
};

export const saveChequeBook = async (id, payload) => {
  const res = id
    ? await api.put(`/api/pay-cheques/books/${id}`, payload)
    : await api.post("/api/pay-cheques/books", payload);
  return res.data;
};

export const deleteChequeBook = async (id) => {
  await api.delete(`/api/pay-cheques/books/${id}`);
};

// ── Cheque due: payments booked as cheque, not yet on a cheque ─────────────

/** type = "VENDOR" (Pay Invoices cheque payments) or "EXPENSE" (Cheque-mode expenses). */
export const getPendingChequePayments = async (type = "VENDOR") => {
  const res = await api.get("/api/pay-cheques/pending", { params: { type } });
  return res.data;
};

// ── Cheques ────────────────────────────────────────────────────────────────

export const getPayCheques = async () => {
  const res = await api.get("/api/pay-cheques");
  return res.data;
};

export const getPayCheque = async (id) => {
  const res = await api.get(`/api/pay-cheques/${id}`);
  return res.data;
};

export const createPayCheque = async (payload) => {
  const res = await api.post("/api/pay-cheques", payload);
  return res.data;
};

export const updatePayCheque = async (id, payload) => {
  const res = await api.put(`/api/pay-cheques/${id}`, payload);
  return res.data;
};

/**
 * Status actions: "approve" | "print" | "issue" | "paid" | "reconcile" | "cancel".
 * body: { date?: "yyyy-MM-dd", note?: string }
 */
export const payChequeAction = async (id, action, body = {}) => {
  const res = await api.post(`/api/pay-cheques/${id}/${action}`, body);
  return res.data;
};
