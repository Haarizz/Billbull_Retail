import api from "@billbull/shared/api/axiosConfig";

// Vendor Price Shares (RFQ) — backend: purchase/rfq/RfqController

const BASE = "/api/purchase-rfqs";

export const listRfqs = async () => (await api.get(BASE)).data;

export const getRfq = async (id) => (await api.get(`${BASE}/${id}`)).data;

export const listRfqResponses = async (rfqId) =>
  (await api.get(`${BASE}/responses`, { params: rfqId ? { rfqId } : {} })).data;

export const createRfq = async (payload) => (await api.post(BASE, payload)).data;

export const updateRfq = async (id, payload) => (await api.put(`${BASE}/${id}`, payload)).data;

export const deleteRfq = async (id) => api.delete(`${BASE}/${id}`);

/**
 * Marks the RFQ sent. With emailVendors, the backend emails every vendor its personal portal
 * link (portalBaseUrl = this app's origin). Returns { rfq, emails: [{ vendorName, sent, error }] }.
 */
export const sendRfq = async (id, { channel, emailVendors = false, portalBaseUrl } = {}) =>
  (await api.post(`${BASE}/${id}/send`, { channel, emailVendors, portalBaseUrl })).data;

/** Wizard defaults: { nextRfqNumber, suggestedReference, baseCurrency, currencies: [{code,name,symbol}], paymentTerms: [name] }. */
export const getRfqFormOptions = async () => (await api.get(`${BASE}/form-options`)).data;

/**
 * Vendors that supplied (LPOs) or quoted (earlier RFQs) these products, best match first — for
 * Auto-Allocate. Each has a 0-100 score and a per-product breakdown with a rank.
 */
export const getVendorSuggestions = async (productIds) =>
  (await api.get(`${BASE}/vendor-suggestions`, { params: { productIds: productIds.join(",") } })).data;

/** The vendor-facing link for one invited vendor. */
export const vendorPortalLink = (portalToken) =>
  portalToken ? `${window.location.origin}/vendor-portal/${portalToken}` : null;

export const changeRfqStatus = async (id, status, reason) =>
  (await api.post(`${BASE}/${id}/status`, { status, reason })).data;

/** action: SAVE | SUBMIT | DECLINE */
export const saveVendorQuote = async (id, rfqVendorId, payload) =>
  (await api.put(`${BASE}/${id}/vendors/${rfqVendorId}/quote`, payload)).data;

export const requestBetterPrice = async (id, payload) =>
  (await api.post(`${BASE}/${id}/negotiations`, payload)).data;

/** outcome: ACCEPTED | REVISED | DECLINED */
export const recordNegotiationReply = async (id, negotiationId, payload) =>
  (await api.post(`${BASE}/${id}/negotiations/${negotiationId}/reply`, payload)).data;

/** offerId null (or the already-awarded offer) clears the award. */
export const awardRfqItem = async (id, itemId, offerId) =>
  (await api.post(`${BASE}/${id}/award`, { itemId, offerId })).data;

export const createLposFromRfq = async (id, payload) =>
  (await api.post(`${BASE}/${id}/lpos`, payload)).data;
