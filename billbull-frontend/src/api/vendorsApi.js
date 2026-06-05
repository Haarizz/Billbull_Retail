import api from "./axiosConfig";

// ==============================
// VENDOR CRUD APIs
// ==============================

// LIST
export const getVendors = async () => {
  const res = await api.get("/api/vendors");
  return res.data;
};

// CREATE (FINAL)
export const createVendor = async (payload) => {
  const res = await api.post("/api/vendors", payload);
  return res.data;
};

// CREATE (DRAFT)
export const createVendorDraft = async (payload) => {
  const res = await api.post("/api/vendors/draft", payload);
  return res.data;
};

export const importVendors = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/api/vendors/import/excel", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

// UPDATE
export const updateVendor = async (id, payload) => {
  const res = await api.put(`/api/vendors/${id}`, payload);
  return res.data;
};

// DELETE (SOFT)
export const deleteVendor = async (id) => {
  await api.delete(`/api/vendors/${id}`);
};
