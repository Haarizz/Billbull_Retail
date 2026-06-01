import api from "./axiosConfig";

// --------------------
// CREATE
// --------------------
export const createProduct = async (formData) => {
  // We send formData (which contains "data": JSON string, "file": Binary)
  // The header is required for the backend to interpret the file upload
  const res = await api.post("/api/products", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

// --------------------
// UPDATE
// --------------------
export const updateProduct = async (id, formData) => {
  const res = await api.put(`/api/products/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

// --------------------
// GET ALL (full response — used by edit/detail)
// --------------------
export const getProducts = async () => {
  const res = await api.get("/api/products");
  return res.data;
};

// --------------------
// GET LIST (optimised — 4 queries, paginated, server-side search)
// --------------------
// signal (optional) — pass AbortController.signal to cancel stale requests
export const getProductsList = async (page = 0, size = 50, search = "", signal = undefined, warehouseId = null, departmentId = null, brandId = null) => {
  const params = new URLSearchParams({ page, size });
  if (search && search.trim()) params.append("search", search.trim());
  if (warehouseId) params.append("warehouseId", warehouseId);
  if (departmentId) params.append("departmentId", departmentId);
  if (brandId) params.append("brandId", brandId);
  const res = await api.get(`/api/products/list?${params.toString()}`, { signal });
  return res.data;
};

// --------------------
// SEARCH EXACT (full product models for Barcode Printer)
// --------------------
export const searchExactProducts = async (search = "", signal = undefined) => {
  const params = new URLSearchParams();
  if (search && search.trim()) params.append("q", search.trim());
  const res = await api.get(`/api/products/search?${params.toString()}`, { signal });
  return res.data;
};

// --------------------
// LOOKUP BY BARCODE (exact match against product_barcodes table)
// --------------------
export const searchProductByBarcode = async (barcode) => {
  const res = await api.get(`/api/products/by-barcode?barcode=${encodeURIComponent(barcode)}`);
  return res.data;
};

// --------------------
// GET BY ID
// --------------------
export const getProductById = async (id) => {
  const res = await api.get(`/api/products/${id}`);
  return res.data;
};

// --------------------
// DELETE
// --------------------
export const deleteProduct = async (id) => {
  await api.delete(`/api/products/${id}`);
};

// --------------------
// EXPORT TO EXCEL
// --------------------
export const exportProducts = async () => {
  const res = await api.get("/api/products/export/excel", {
    responseType: "blob",
  });
  return res.data;
};

// --------------------
// IMPORT FROM EXCEL
// --------------------
export const importProducts = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/api/products/import/excel", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const startProductImport = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/api/products/import/excel/start", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const getProductImportProgress = async (jobId) => {
  const res = await api.get(`/api/products/import/excel/progress/${encodeURIComponent(jobId)}`);
  return res.data;
};
