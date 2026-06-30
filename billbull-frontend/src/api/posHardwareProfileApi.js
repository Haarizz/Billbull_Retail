import api from "./axiosConfig";

const BASE = "/api/pos/hardware-profiles";

export const getHardwareProfiles = async (branchId) => {
  const res = await api.get(BASE, { params: { branchId } });
  return res.data;
};

export const getHardwareProfile = async (id) => {
  const res = await api.get(`${BASE}/${id}`);
  return res.data;
};

export const getProfileSyncStatus = async (terminalId) => {
  const res = await api.get(`${BASE}/sync-status/${terminalId}`);
  return res.data;
};

export const assignProfileToTerminal = async (profileId, terminalId) => {
  const res = await api.post(`${BASE}/${profileId}/assign/${terminalId}`);
  return res.data;
};
