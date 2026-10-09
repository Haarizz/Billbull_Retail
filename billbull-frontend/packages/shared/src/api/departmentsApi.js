// src/api/departmentsApi.js
import api from "./axiosConfig";

// ================= DEPARTMENTS =================

export const getDepartments = async () => {
  const res = await api.get("/api/departments");
  return res.data;
};

export const createDepartment = async (payload) => {
  const res = await api.post("/api/departments", payload);
  return res.data;
};

export const updateDepartment = async (id, payload) => {
  const res = await api.put(`/api/departments/${id}`, payload);
  return res.data;
};

export const deleteDepartment = async (id) => {
  await api.delete(`/api/departments/${id}`);
};

export const bulkDeleteDepartments = async (ids) => {
  await api.post("/api/departments/bulk-delete", ids);
};

export const exportDepartments = async () => {
  const res = await api.get("/api/departments/export/excel", {
    responseType: "blob",
  });
  return res.data;
};

export const getSubDepartmentsByDepartment = async (departmentId) => {
  const res = await api.get(`/api/sub-departments?departmentId=${departmentId}`);
  return res.data;
};