import api from "./axiosConfig";

// ---- Proforma CRUD ----
export const getAllProformas = () =>
  api.get("/api/proforma").then(res => res.data);

export const getProformaById = (id) =>
  api.get(`/api/proforma/${id}`).then(res => res.data);

export const createProforma = (payload) =>
  api.post("/api/proforma", payload).then(res => res.data);

export const updateProforma = (id, payload) =>
  api.put(`/api/proforma/${id}`, payload).then(res => res.data);

export const deleteProforma = (id) =>
  api.delete(`/api/proforma/${id}`);

export const issueProforma = (id) =>
  api.post(`/api/proforma/${id}/issue`).then(res => res.data);
