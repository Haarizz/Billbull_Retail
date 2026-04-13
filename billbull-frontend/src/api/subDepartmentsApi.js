import api from "./axiosConfig";

// ---------------------------
// GET all sub-departments
// ---------------------------
export const getSubDepartments = async () => {
  const res = await api.get("/api/sub-departments");
  return res.data;
};

// ---------------------------
// CREATE sub-department
// ---------------------------
export const createSubDepartment = async (payload) => {
  const res = await api.post("/api/sub-departments", payload);
  return res.data;
};

// ---------------------------
// UPDATE sub-department
// ---------------------------
export const updateSubDepartment = async (id, payload) => {
  const res = await api.put(`/api/sub-departments/${id}`, payload);
  return res.data;
};

// ---------------------------
// DELETE sub-department (soft)
// ---------------------------
export const deleteSubDepartment = async (id) => {
  await api.delete(`/api/sub-departments/${id}`);
};

export const exportSubDepartments = async () => {
  const res = await api.get("/api/sub-departments/export/excel", {
    responseType: "blob",
  });
  return res.data;
};

export const getDepartments = async () => {
  const res = await api.get("/api/departments");
  return res.data;
};