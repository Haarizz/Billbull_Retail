import api from "./axiosConfig";

// ================= GRN =================

export const getGrns = async () => {
  const res = await api.get("/api/grns");
  return res.data;
};

export const getGrnById = async (id) => {
  const res = await api.get(`/api/grns/${id}`);
  return res.data;
};

export const createGrn = async (payload) => {
  const res = await api.post("/api/grns", payload);
  return res.data;
};

export const updateGrn = async (id, payload) => {
  const res = await api.put(`/api/grns/${id}`, payload);
  return res.data;
};

export const deleteGrn = async (id) => {
  return api.delete(`/api/grns/${id}`);
};

export const submitGrnForQc = async (id) => {
  return api.post(`/api/grns/${id}/submit-qc`);
};

export const approveGrnQc = async (id) => {
  return api.post(`/api/grns/${id}/approve-qc`);
};

export const postGrn = async (id, binMappings = null) => {
  // Always send a JSON body (even empty {}) to avoid axios defaulting to
  // application/x-www-form-urlencoded which Spring rejects on @RequestBody endpoints
  const payload = binMappings ? { binMappings } : {};
  return api.post(`/api/grns/${id}/post`, payload);
};
