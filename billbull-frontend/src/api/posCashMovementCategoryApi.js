import api from "./axiosConfig";

const BASE = "/api/pos/admin/cash-movement-categories";

/**
 * Enterprise Console > POS Administration > Cash Movement Categories (Phase 2). Mirrors
 * posCashMovementApi.js's shape. `getSelectableCategories` is the lightweight lookup consumed
 * by the POS Cash Drop/Out dialogs — it is not gated by the admin `pos.admin.cashmovement.
 * category.view` permission, unlike every other function here.
 */
export const getCashMovementCategories = async ({
  active, movementType, search, page = 0, size = 20,
} = {}) => {
  const res = await api.get(BASE, { params: { active, movementType, search, page, size } });
  return res.data;
};

export const getCashMovementCategoryById = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

export const createCashMovementCategory = async (payload) => {
  const res = await api.post(BASE, payload);
  return res.data;
};

export const updateCashMovementCategory = async (id, payload) => {
  const res = await api.put(`${BASE}/${id}`, payload);
  return res.data;
};

export const activateCashMovementCategory = async (id) => {
  const res = await api.post(`${BASE}/${id}/activate`);
  return res.data;
};

export const deactivateCashMovementCategory = async (id) => {
  const res = await api.post(`${BASE}/${id}/deactivate`);
  return res.data;
};

/** Returns { categoryRequired, categories: [{id, name, notesRequired}] } for the given
 *  direction ("DROP_IN" | "DROP_OUT") and branch. */
export const getSelectableCategories = async (movementType, branchId) => {
  const res = await api.get(`${BASE}/selectable`, { params: { movementType, branchId } });
  return res.data;
};
