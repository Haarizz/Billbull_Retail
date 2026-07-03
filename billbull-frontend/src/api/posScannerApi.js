import api from "./axiosConfig";

const BASE = "/api/pos/scanners";

// Matches PosScannerService.UpsertRequest — connectionType ∈ USB | BLUETOOTH,
// status ∈ ACTIVE | INACTIVE | DECOMMISSIONED. inputMode is always
// KEYBOARD_WEDGE server-side, so it isn't sent from here.
export const getPosScanners = async ({ branchId } = {}) => {
  const res = await api.get(BASE, { params: { branchId } });
  return res.data;
};

export const getPosScanner = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

export const createPosScanner = async (payload) => {
  const res = await api.post(BASE, payload);
  return res.data;
};

export const updatePosScanner = async (id, payload) => {
  const res = await api.put(`${BASE}/${id}`, payload);
  return res.data;
};

export const decommissionPosScanner = async (id) => {
  await api.delete(`${BASE}/${id}`);
};
