import api from "./axiosConfig";

// Product category master (backend inventory.category). Products store the category NAME, so
// pick-lists use `name` as the option value.

export const getProductCategories = async () => {
  const res = await api.get("/api/product-categories");
  return res.data;
};

export const createProductCategory = async (payload) => {
  const res = await api.post("/api/product-categories", payload);
  return res.data;
};

export const updateProductCategory = async (id, payload) => {
  const res = await api.put(`/api/product-categories/${id}`, payload);
  return res.data;
};

export const deleteProductCategory = async (id) => {
  await api.delete(`/api/product-categories/${id}`);
};
