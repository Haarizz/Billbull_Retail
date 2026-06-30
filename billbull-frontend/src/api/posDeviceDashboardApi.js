import api from "./axiosConfig";

const BASE = "/api/pos/devices";

export const getDashboardOverview = async (branchId) => {
  const res = await api.get(`${BASE}/dashboard/overview`, { params: { branchId } });
  return res.data;
};

export const getDashboardRefreshToken = async () => {
  const res = await api.get(`${BASE}/dashboard/refresh-token`);
  return res.data;
};

export const getDeviceEvents = async (deviceId) => {
  const res = await api.get(`${BASE}/${deviceId}/events`);
  return res.data;
};

export const ignoreDiscoveredDevice = async (id) => {
  const res = await api.put(`${BASE}/discovery/${id}/ignore`);
  return res.data;
};
