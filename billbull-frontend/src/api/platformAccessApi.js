import api from "@billbull/shared/api/axiosConfig";

// The tenant's own view of the BillBull control plane (admin.billbull.app):
// plan, modules, status, and every BillBull support sign-in on this account.
export const getPlatformStatus = () => api.get("/api/platform-access/status").then((r) => r.data);

export const listSupportSessions = () =>
  api.get("/api/platform-access/support-sessions").then((r) => r.data);

export const revokeSupportSession = (id) =>
  api.post(`/api/platform-access/support-sessions/${id}/revoke`).then((r) => r.data);
