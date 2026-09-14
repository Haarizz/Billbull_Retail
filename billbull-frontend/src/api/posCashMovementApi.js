import api from "./axiosConfig";

const BASE = "/api/pos/cash-movements";

/**
 * Back-office "Cash Drop / Outs" module — list/view/limited-edit/void on top of
 * PosCashMovement. Separate from `addPosCashMovement` in posApi.js (the POS terminal's
 * "Cash Drawer" quick-action create call), which is untouched and keeps working exactly
 * as before.
 */
export const getPosCashMovements = async ({
  branchId, sessionId, status, movementType, fromDate, toDate, performedBy,
  page = 0, size = 20,
} = {}) => {
  const res = await api.get(BASE, {
    params: { branchId, sessionId, status, movementType, fromDate, toDate, performedBy, page, size },
  });
  return res.data;
};

export const getPosCashMovementById = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

/**
 * Sessions a new cash movement may actually be added to (OPEN, current Business Day, not
 * mid-closure) — feeds the "Add New" session picker so a closed session can never be chosen.
 * The backend re-validates on create regardless; this list is what keeps the form honest.
 */
export const getCashMovementEligibleSessions = async (branchId) => {
  const res = await api.get(`${BASE}/eligible-sessions`, { params: { branchId } });
  return res.data;
};

export const createPosCashMovement = async ({ sessionId, movementType, amount, description, reference, categoryId }) => {
  const res = await api.post(BASE, { sessionId, movementType, amount, description, reference, categoryId });
  return res.data;
};

/** Limited edit — description/reference only; amount/type/session are never editable. */
export const editPosCashMovement = async (id, { description, reference }) => {
  const res = await api.put(`${BASE}/${id}`, { description, reference });
  return res.data;
};

export const voidPosCashMovement = async (id, voidReason) => {
  const res = await api.post(`${BASE}/${id}/void`, { voidReason });
  return res.data;
};
