import api from "./axiosConfig";

// ================= ZONES =================

export const getZones = async (warehouseId) => {
    const res = await api.get(`/api/warehouses/${warehouseId}/zones`);
    return res.data;
};

export const getZoneById = async (warehouseId, id) => {
    const res = await api.get(`/api/warehouses/${warehouseId}/zones/${id}`);
    return res.data;
};

export const createZone = async (warehouseId, payload) => {
    const res = await api.post(`/api/warehouses/${warehouseId}/zones`, payload);
    return res.data;
};

export const updateZone = async (warehouseId, id, payload) => {
    const res = await api.put(`/api/warehouses/${warehouseId}/zones/${id}`, payload);
    return res.data;
};

export const deleteZone = async (warehouseId, id) => {
    await api.delete(`/api/warehouses/${warehouseId}/zones/${id}`);
};

// ================= LOCATORS =================

export const getLocators = async (zoneId) => {
    const res = await api.get(`/api/zones/${zoneId}/locators`);
    return res.data;
};

export const getLocatorById = async (zoneId, id) => {
    const res = await api.get(`/api/zones/${zoneId}/locators/${id}`);
    return res.data;
};

export const createLocator = async (zoneId, payload) => {
    const res = await api.post(`/api/zones/${zoneId}/locators`, payload);
    return res.data;
};

export const updateLocator = async (zoneId, id, payload) => {
    const res = await api.put(`/api/zones/${zoneId}/locators/${id}`, payload);
    return res.data;
};

export const deleteLocator = async (zoneId, id) => {
    await api.delete(`/api/zones/${zoneId}/locators/${id}`);
};

// ================= BINS =================

export const getBins = async (locatorId) => {
    const res = await api.get(`/api/locators/${locatorId}/bins`);
    return res.data;
};

export const getBinById = async (locatorId, id) => {
    const res = await api.get(`/api/locators/${locatorId}/bins/${id}`);
    return res.data;
};

export const createBin = async (locatorId, payload) => {
    const res = await api.post(`/api/locators/${locatorId}/bins`, payload);
    return res.data;
};

export const updateBin = async (locatorId, id, payload) => {
    const res = await api.put(`/api/locators/${locatorId}/bins/${id}`, payload);
    return res.data;
};

export const deleteBin = async (locatorId, id) => {
    await api.delete(`/api/locators/${locatorId}/bins/${id}`);
};

// ================= BIN STOCK =================

export const getBinStock = async (binId) => {
    const res = await api.get(`/api/warehouses/bins/${binId}/stock`);
    return res.data;
};

export const getBinStockSummary = async (binId) => {
    const res = await api.get(`/api/warehouses/bins/${binId}/stock/summary`);
    return res.data;
};

export const addBinStock = async (binId, payload) => {
    const res = await api.post(`/api/warehouses/bins/${binId}/stock`, payload);
    return res.data;
};

export const updateBinStock = async (binId, stockId, payload) => {
    const res = await api.put(`/api/warehouses/bins/${binId}/stock/${stockId}`, payload);
    return res.data;
};

export const deleteBinStock = async (binId, stockId) => {
    await api.delete(`/api/warehouses/bins/${binId}/stock/${stockId}`);
};
