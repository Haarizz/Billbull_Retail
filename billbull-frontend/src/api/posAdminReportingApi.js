import api from "./axiosConfig";

const BASE = "/api/pos/admin/reporting";

/**
 * Enterprise Console > POS Administration > Reporting (Phase 5). Every call here is read-only —
 * dashboard/history/analytics/audit/effective-view data only, no correction workflow actions.
 */
export const getCorrectionDashboard = async () => {
  const res = await api.get(`${BASE}/dashboard`);
  return res.data;
};

export const getCorrectionHistory = async ({
  branchId, status, targetType, correctionType, targetId, requestedBy, approvedBy,
  fromDate, toDate, search, page = 0, size = 20,
} = {}) => {
  const res = await api.get(`${BASE}/history`, {
    params: { branchId, status, targetType, correctionType, targetId, requestedBy, approvedBy, fromDate, toDate, search, page, size },
  });
  return res.data;
};

export const getCorrectionAnalytics = async () => {
  const res = await api.get(`${BASE}/analytics`);
  return res.data;
};

export const getEffectiveCorrectionView = async (targetType, targetId) => {
  const res = await api.get(`${BASE}/effective`, { params: { targetType, targetId } });
  return res.data;
};

export const getRecentCorrectionAudit = async (limit = 100) => {
  const res = await api.get(`${BASE}/audit/recent`, { params: { limit } });
  return res.data;
};

export const getAuditForCorrectionRequest = async (requestNumber, correctionRequestId) => {
  const res = await api.get(`${BASE}/audit/request/${encodeURIComponent(requestNumber)}`, {
    params: { correctionRequestId },
  });
  return res.data;
};

export const getCategoryAuditTrail = async (code) => {
  const res = await api.get(`${BASE}/audit/category/${encodeURIComponent(code)}`);
  return res.data;
};
