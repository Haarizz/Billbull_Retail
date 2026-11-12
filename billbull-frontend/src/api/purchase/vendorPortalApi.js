import axios from "axios";

// Public vendor portal API (backend: purchase/rfq/portal/RfqPortalController).
// Deliberately NOT the shared staff axios instance: that one attaches the staff JWT and sends
// 401s to the staff login page. Vendors authenticate with an X-Vendor-Session token instead.

const portal = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:8080" : window.location.origin),
  headers: { "Content-Type": "application/json" },
});

const SESSION_KEY = (linkToken) => `billbull.vendorPortal.${linkToken}`;

/** Session tokens live in sessionStorage (cleared when the tab closes), one per invitation link. */
export const loadPortalSession = (linkToken) => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY(linkToken));
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s?.sessionToken && new Date(s.expiresAt) > new Date() ? s : null;
  } catch {
    return null;
  }
};

export const savePortalSession = (linkToken, session) => {
  try { sessionStorage.setItem(SESSION_KEY(linkToken), JSON.stringify(session)); } catch { /* private mode */ }
};

export const clearPortalSession = (linkToken) => {
  try { sessionStorage.removeItem(SESSION_KEY(linkToken)); } catch { /* ignore */ }
};

const withSession = (session) => ({ headers: { "X-Vendor-Session": session } });

export const getInvite = async (linkToken) => (await portal.get(`/api/vendor-portal/invite/${encodeURIComponent(linkToken)}`)).data;

export const requestPortalCode = async (linkToken) =>
  (await portal.post(`/api/vendor-portal/invite/${encodeURIComponent(linkToken)}/code`)).data;

export const verifyPortalCode = async (linkToken, code) =>
  (await portal.post(`/api/vendor-portal/invite/${encodeURIComponent(linkToken)}/verify`, { code })).data;

export const getPortalRfq = async (session) => (await portal.get("/api/vendor-portal/rfq", withSession(session))).data;

/** action: SAVE | SUBMIT | DECLINE */
export const savePortalQuote = async (session, payload) =>
  (await portal.put("/api/vendor-portal/rfq/quote", payload, withSession(session))).data;

/** outcome: ACCEPTED | REVISED | DECLINED */
export const replyToPriceRequest = async (session, negotiationId, payload) =>
  (await portal.post(`/api/vendor-portal/rfq/price-requests/${negotiationId}/reply`, payload, withSession(session))).data;

export const portalLogout = async (session) => {
  try { await portal.post("/api/vendor-portal/logout", null, withSession(session)); } catch { /* best effort */ }
};
