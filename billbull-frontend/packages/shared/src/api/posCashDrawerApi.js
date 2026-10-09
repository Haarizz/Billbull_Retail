import api from "./axiosConfig";

const BASE = "/api/pos/cash-drawers";

// Matches PosCashDrawerService.UpsertRequest — attachedPrinterId is REQUIRED
// (the kick rides the receipt printer's cable; a drawer has no standalone
// connection). status ∈ ACTIVE | INACTIVE | DECOMMISSIONED.
export const getPosCashDrawers = async ({ branchId } = {}) => {
  const res = await api.get(BASE, { params: { branchId } });
  return res.data;
};

export const getPosCashDrawer = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

export const createPosCashDrawer = async (payload) => {
  const res = await api.post(BASE, payload);
  return res.data;
};

export const updatePosCashDrawer = async (id, payload) => {
  const res = await api.put(`${BASE}/${id}`, payload);
  return res.data;
};

export const recordCashDrawerKickResult = async (id, success) => {
  const res = await api.put(`${BASE}/${id}/kick-result`, { success });
  return res.data;
};

export const decommissionPosCashDrawer = async (id) => {
  await api.delete(`${BASE}/${id}`);
};
