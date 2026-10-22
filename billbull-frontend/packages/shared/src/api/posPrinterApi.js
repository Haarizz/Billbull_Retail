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
//
// The backend picks the command policy from the printer's own device type (label
// printer → ZPL, anything else → ESC/POS). `format` ('ESCPOS' | 'ZPL') only lets
// it say "this label went to a receipt printer" instead of a generic refusal.
export const printPosPrinterEscPos = async (id, dataBase64, { format } = {}) => {
  try {
    const res = await api.post(`${BASE}/${id}/print/escpos`, format ? { dataBase64, format } : { dataBase64 });
    return res.data;
  } catch (err) {
    // Normalize to a plain Error with a readable .message, same shape the local
    // print agent's fetch-based calls already throw — callers alert on err.message
    // without needing to know whether this went through the agent or the backend.
    const data = err?.response?.data;
    const serverMessage = data?.message || (typeof data === 'string' ? data : null);
    const error = new Error(serverMessage || err?.message || 'Print agent error.');
    // A refused command (422 PRINT_COMMAND_REJECTED) carries what was refused.
    if (data?.code) error.code = data.code;
    if (data?.category) error.category = data.category;
    if (err?.response?.status) error.status = err.response.status;
    throw error;
  }
};
