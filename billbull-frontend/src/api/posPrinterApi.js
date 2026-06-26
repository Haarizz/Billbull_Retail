import api from "./axiosConfig";

const BASE = "/api/pos/printers";

export const getPosPrinters = async ({ branchId, terminalId, deviceType } = {}) => {
  const res = await api.get(BASE, { params: { branchId, terminalId, deviceType } });
  return res.data;
};

export const getPosPrinter = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

export const createPosPrinter = async (payload) => {
  const res = await api.post(BASE, payload);
  return res.data;
};

export const updatePosPrinter = async (id, payload) => {
  const res = await api.put(`${BASE}/${id}`, payload);
  return res.data;
};

export const updatePosPrinterRuntime = async (id, payload) => {
  const res = await api.put(`${BASE}/${id}/runtime`, payload);
  return res.data;
};

export const decommissionPosPrinter = async (id) => {
  await api.delete(`${BASE}/${id}`);
};
