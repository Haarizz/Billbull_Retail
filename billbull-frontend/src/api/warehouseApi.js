import api from "./axiosConfig";

// ================= WAREHOUSES =================

export const getWarehouses = async () => {
  const res = await api.get("/api/warehouses");
  return res.data;
};

export const getWarehouseById = async (id) => {
  const res = await api.get(`/api/warehouses/${id}`);
  return res.data;
};

export const createWarehouse = async (payload) => {
  const res = await api.post("/api/warehouses", payload);
  return res.data;
};

export const updateWarehouse = async (id, payload) => {
  const res = await api.put(`/api/warehouses/${id}`, payload);
  return res.data;
};

export const deleteWarehouse = async (id) => {
  await api.delete(`/api/warehouses/${id}`);
};

export const getWarehouseStock = async (id) => {
  const res = await api.get(`/api/warehouses/${id}/stock`);
  return res.data;
};

export const getWarehouseStockSummary = async (id) => {
  const res = await api.get(`/api/warehouses/${id}/stock/summary`);
  return res.data;
};

export const getWarehouseProductStock = async (id, productId, filters = {}) => {
  const { zoneId, locatorId, binId } = filters;
  let url = `/api/warehouses/${id}/stock/product/${productId}`;
  const params = new URLSearchParams();
  if (zoneId) params.append("zoneId", zoneId);
  if (locatorId) params.append("locatorId", locatorId);
  if (binId) params.append("binId", binId);

  const queryString = params.toString();
  if (queryString) url += `?${queryString}`;

  const response = await api.get(url);
  return response.data;
};

export const getWarehouseZones = async (id) => {
  const response = await api.get(`/api/warehouses/${id}/zones`);
  return response.data;
};

export const getWarehouseBins = async (id) => {
  const response = await api.get(`/api/warehouses/${id}/bins`);
  return response.data;
};

export const getZoneLocators = async (zoneId) => {
  const response = await api.get(`/api/zones/${zoneId}/locators`);
  return response.data;
};

export const getLocatorBins = async (locatorId) => {
  const response = await api.get(`/api/locators/${locatorId}/bins`);
  return response.data;
};

export const getAggregateLocationStock = async (id, filters = {}) => {
  const { zoneId, locatorId, binId } = filters;
  let url = `/api/warehouses/${id}/stock/aggregate`;
  const params = new URLSearchParams();
  if (zoneId) params.append("zoneId", zoneId);
  if (locatorId) params.append("locatorId", locatorId);
  if (binId) params.append("binId", binId);

  const queryString = params.toString();
  if (queryString) url += `?${queryString}`;

  const response = await api.get(url);
  return response.data;
};
