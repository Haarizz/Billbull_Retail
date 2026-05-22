import api from "./axiosConfig";

// ================= LPO =================

export const getLpos = async (status) => {
  const res = await api.get("/api/lpos", {
    params: status ? { status } : {},
  });
  return res.data;
};

export const getLpoSuggestions = async () => {
  const res = await api.get("/api/lpos/suggestions");
  return res.data;
};

export const getLpoByNumber = async (lpoNumber) => {
  const res = await api.get(`/api/lpos/${lpoNumber}`);
  return res.data;
};

export const createLpo = async (payload) => {
  const res = await api.post("/api/lpos", payload);
  return res.data;
};

export const updateLpo = async (lpoNumber, payload) => {
  const res = await api.put(`/api/lpos/${lpoNumber}`, payload);
  return res.data;
};

export const submitLpoForApproval = async (id) => {
  return api.post(`/api/lpos/${id}/submit`);
};

export const approveLpo = async (id) => {
  return api.post(`/api/lpos/${id}/approve`, null, {
    params: { approvedBy: "SYSTEM" }
  });
};

export const rejectLpo = async (id) => {
  return api.post(`/api/lpos/${id}/reject`);
};

export const deleteLpo = async (lpoNumber) => {
  await api.delete(`/api/lpos/${lpoNumber}`);
};
// ================= STOCK POST =================

export const postLpoStock = async (id) => {
  return api.post(`/api/lpos/${id}/post-stock`);
};

// ================= ADVANCE PAYMENT =================

export const createLpoAdvancePayment = async (id, payload) => {
  const res = await api.post(`/api/lpos/${id}/advance-payment`, payload);
  return res.data;
};

export const getLpoPaymentVouchers = async (id) => {
  const res = await api.get(`/api/lpos/${id}/payment-vouchers`);
  return res.data;
};
