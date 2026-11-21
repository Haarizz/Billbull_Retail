import api from "./axiosConfig";

// M3 Standalone POS offline MVP (backend: com.billbull.backend.pos.offline.PosOfflineController).
// These requests are never answered from the offline cache (see offline/offlineAdapter.js).
const BASE = "/api/pos/offline";
// offlineBypass is an axios config flag read by the offline adapter; it is not sent to the server.
const LIVE = { offlineBypass: true };

export const getOfflineStatus = async (terminalId) => {
  const res = await api.get(`${BASE}/status`, { ...LIVE, params: { terminalId } });
  return res.data;
};

export const enrollOfflineKey = async ({ terminalId, publicKeySpki }) => {
  const res = await api.post(`${BASE}/keys`, { terminalId, publicKeySpki }, LIVE);
  return res.data;
};

export const getOfflineCatalog = async () => {
  const res = await api.get(`${BASE}/catalog`, LIVE);
  return res.data;
};

export const issueOfflineLease = async ({ terminalId, sessionId, catalogVersion }) => {
  const res = await api.post(`${BASE}/leases`, { terminalId, sessionId, catalogVersion }, LIVE);
  return res.data;
};

export const closeOfflineLease = async (leaseId, { summary, sig }) => {
  const res = await api.post(`${BASE}/leases/${leaseId}/close`, { summary, sig }, LIVE);
  return res.data;
};

export const syncOfflineSales = async (records, { branchId } = {}) => {
  const headers = {};
  if (branchId != null) headers["X-Branch-Id"] = String(branchId);
  const res = await api.post(`${BASE}/sales`, { records }, { ...LIVE, headers, timeout: 60000 });
  return res.data;
};
