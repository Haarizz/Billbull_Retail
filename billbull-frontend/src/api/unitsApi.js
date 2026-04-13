import api from "./axiosConfig";

// GET all units
export const getUnits = async () => {
  const res = await api.get("/api/units");
  return res.data;
};

// CREATE unit
export const createUnit = async (payload) => {
  const res = await api.post("/api/units", payload);
  return res.data;
};

// UPDATE unit
export const updateUnit = async (id, payload) => {
  const res = await api.put(`/api/units/${id}`, payload);
  return res.data;
};

// DELETE unit (soft delete)
export const deleteUnit = async (id) => {
  await api.delete(`/api/units/${id}`);
};

// EXPORT units
export const exportUnits = async () => {
  const res = await api.get("/api/units/export/excel", {
    responseType: "blob",
  });
  return res.data;
};
