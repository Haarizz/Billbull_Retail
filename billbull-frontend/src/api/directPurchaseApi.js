import api from "./axiosConfig";

// ================= DIRECT PURCHASE =================

export const getDirectPurchases = async () => {
  const res = await api.get("/api/direct-purchases");
  return res.data;
};

export const getDirectPurchaseById = async (id) => {
  const res = await api.get(`/api/direct-purchases/${id}`);
  return res.data;
};

export const createDirectPurchase = async (payload) => {
  const res = await api.post("/api/direct-purchases", payload);
  return res.data;
};

export const updateDirectPurchase = async (id, payload) => {
  const res = await api.put(`/api/direct-purchases/${id}`, payload);
  return res.data;
};

export const deleteDirectPurchase = async (id) => {
  await api.delete(`/api/direct-purchases/${id}`);
};

// ================= STOCK POST =================

export const postDirectPurchaseStock = async (id) => {
  return api.post(`/api/direct-purchases/${id}/post-stock`);
};
