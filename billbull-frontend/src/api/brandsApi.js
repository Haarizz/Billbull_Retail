import api from "./axiosConfig";

/**
 * GET all active brands
 */
export const getBrands = async () => {
  const res = await api.get("/api/brands");
  return res.data;
};

/**
 * CREATE brand (multipart)
 */
export const createBrand = async (data, logoFile) => {
  const formData = new FormData();
  formData.append(
    "data",
    new Blob([JSON.stringify(data)], { type: "application/json" })
  );

  if (logoFile) {
    formData.append("logo", logoFile);
  }

  const res = await api.post("/api/brands", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return res.data;
};

/**
 * UPDATE brand (multipart)
 */
export const updateBrand = async (id, data, logoFile) => {
  const formData = new FormData();
  formData.append(
    "data",
    new Blob([JSON.stringify(data)], { type: "application/json" })
  );

  if (logoFile) {
    formData.append("logo", logoFile);
  }

  const res = await api.put(`/api/brands/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return res.data;
};

/**
 * DELETE brand (soft delete)
 */
export const deleteBrand = async (id) => {
  await api.delete(`/api/brands/${id}`);
};

/**
 * EXPORT brands to Excel
 */
export const exportBrands = async () => {
  const res = await api.get("/api/brands/export/excel", {
    responseType: "blob",
  });
  return res.data;
};
