import api from "./axiosConfig";

const BASE = "/api/pos/print-jobs";

export const createPrintJob = async (payload) => {
  const res = await api.post(BASE, payload);
  return res.data;
};

export const getPrintJob = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

export const dispatchPrintJob = async (id) => {
  const res = await api.put(`${BASE}/${id}/dispatch`);
  return res.data;
};

export const reportPrintJobResult = async (id, { success, errorMessage } = {}) => {
  const res = await api.put(`${BASE}/${id}/result`, { success, errorMessage });
  return res.data;
};

export const retryPrintJob = async (id) => {
  const res = await api.post(`${BASE}/${id}/retry`);
  return res.data;
};
