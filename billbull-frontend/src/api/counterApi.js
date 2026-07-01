import api from "./axiosConfig";

const BASE = "/api/pos/counters";

export const getCounters = async (branchId) => {
  const res = await api.get(BASE, { params: branchId ? { branchId } : {} });
  return res.data;
};

export const getActiveCounters = async (branchId) => {
  const res = await api.get(`${BASE}/active`, { params: branchId ? { branchId } : {} });
  return res.data;
};

export const getCounterById = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data; // { counter, totalTerminals, activeTerminals }
};

export const createCounter = async (data) => {
  const res = await api.post(BASE, data);
  return res.data;
};

export const updateCounter = async (id, data) => {
  const res = await api.put(`${BASE}/${id}`, data);
  return res.data;
};

export const setCounterStatus = async (id, status) => {
  const res = await api.patch(`${BASE}/${id}/status`, { status });
  return res.data;
};

export const deleteCounter = async (id) => {
  await api.delete(`${BASE}/${id}`);
};
