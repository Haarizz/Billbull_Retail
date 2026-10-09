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

// Server-relayed ESC/POS print for Network/IP printers — the backend opens the raw
// socket to the printer's own LAN IP, so this works from any device (phone, tablet,
// another PC) without a local workstation agent installed.
export const printPosPrinterEscPos = async (id, dataBase64) => {
  try {
    const res = await api.post(`${BASE}/${id}/print/escpos`, { dataBase64 });
    return res.data;
  } catch (err) {
    // Normalize to a plain Error with a readable .message, same shape the local
    // print agent's fetch-based calls already throw — callers alert on err.message
    // without needing to know whether this went through the agent or the backend.
    const serverMessage = err?.response?.data?.message || (typeof err?.response?.data === 'string' ? err.response.data : null);
    throw new Error(serverMessage || err?.message || 'Print agent error.');
  }
};
