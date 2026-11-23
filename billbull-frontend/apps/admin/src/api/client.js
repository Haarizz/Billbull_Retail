import axios from 'axios';

// Platform session token. sessionStorage: closing the tab signs out, and it never reaches the
// tenant apps (a different origin) or their storage.
export const TOKEN_KEY = 'billbull.platform.token';

export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: the session lasts until reload
  }
};

export const SIGNED_OUT_EVENT = 'billbull-platform:signed-out';

export const api = axios.create({
  baseURL: import.meta.env.VITE_PLATFORM_API_BASE_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.startsWith('/api/auth/login') && !url.startsWith('/api/auth/mfa')) {
      setToken(null);
      window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT));
    }
    return Promise.reject(error);
  },
);

/** The message to show for a failed call: the platform's own text when it sent one. */
export const errorMessage = (error) =>
  error?.response?.data?.message || (error?.response ? `Request failed (${error.response.status})` : error?.message) || 'Request failed';

const data = (p) => p.then((r) => r.data);

export const platformApi = {
  login: (email, password) => data(api.post('/api/auth/login', { email, password })),
  verifyMfa: (challenge, code) => data(api.post('/api/auth/mfa/verify', { challenge, code })),
  enrollMfa: (challenge, code) => data(api.post('/api/auth/mfa/enroll', { challenge, code })),
  me: () => data(api.get('/api/auth/me')),
  changePassword: (currentPassword, newPassword) => data(api.post('/api/auth/change-password', { currentPassword, newPassword })),
  signOutEverywhere: () => data(api.post('/api/auth/sign-out-everywhere')),

  dashboard: () => data(api.get('/api/dashboard')),

  modules: () => data(api.get('/api/tenants/modules')),
  tenants: (includeArchived = false) => data(api.get('/api/tenants', { params: { includeArchived } })),
  tenant: (id) => data(api.get(`/api/tenants/${id}`)),
  createTenant: (body) => data(api.post('/api/tenants', body)),
  updateTenant: (id, body) => data(api.put(`/api/tenants/${id}`, body)),
  changeStatus: (id, body) => data(api.post(`/api/tenants/${id}/status`, body)),
  changeEntitlements: (id, body) => data(api.put(`/api/tenants/${id}/entitlements`, body)),
  syncTenant: (id) => data(api.post(`/api/tenants/${id}/sync`)),
  checkHealth: (id) => data(api.post(`/api/tenants/${id}/health-check`)),
  healthHistory: (id, limit = 50) => data(api.get(`/api/tenants/${id}/health`, { params: { limit } })),
  agentState: (id) => data(api.get(`/api/tenants/${id}/agent-state`)),
  rotateSecret: (id) => data(api.post(`/api/tenants/${id}/rotate-secret`)),
  provisioningKit: (id) => data(api.get(`/api/tenants/${id}/provisioning-kit`)),

  supportSessions: (tenantId) => data(api.get(`/api/tenants/${tenantId}/support-sessions`)),
  allSupportSessions: () => data(api.get('/api/support-sessions')),
  openSupport: (tenantId, body) => data(api.post(`/api/tenants/${tenantId}/support-sessions`, body)),
  revokeSupport: (sessionId) => data(api.post(`/api/support-sessions/${sessionId}/revoke`)),

  plans: () => data(api.get('/api/plans')),
  createPlan: (body) => data(api.post('/api/plans', body)),
  updatePlan: (id, body) => data(api.put(`/api/plans/${id}`, body)),

  users: () => data(api.get('/api/platform-users')),
  createUser: (body) => data(api.post('/api/platform-users', body)),
  updateUser: (id, body) => data(api.put(`/api/platform-users/${id}`, body)),
  resetPassword: (id) => data(api.post(`/api/platform-users/${id}/reset-password`)),
  resetMfa: (id) => data(api.post(`/api/platform-users/${id}/reset-mfa`)),

  audit: (params) => data(api.get('/api/audit', { params })),
  verifyAudit: () => data(api.get('/api/audit/verify')),

  backups: () => data(api.get('/api/backups')),
  tenantBackups: (tenantId) => data(api.get(`/api/backups/tenant/${tenantId}`)),
};
