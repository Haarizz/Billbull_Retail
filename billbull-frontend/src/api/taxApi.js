import api from "./axiosConfig";
import { getBranchTaxConfiguration, getBranchTaxConfigurationForBranch } from "./branchTaxApi";

// ================= CONFIGURATIONS =================

export const getTaxConfigs = async () => {
    const res = await api.get("/api/financials/tax/configs");
    return res.data;
};

export const createTaxConfig = async (payload) => {
    const res = await api.post("/api/financials/tax/configs", payload);
    return res.data;
};

export const updateTaxConfig = async (id, payload) => {
    const res = await api.put(`/api/financials/tax/configs/${id}`, payload);
    return res.data;
};

export const deleteTaxConfig = async (id) => {
    await api.delete(`/api/financials/tax/configs/${id}`);
};

/**
 * Returns a branch's Tax Configuration — Tax Enabled, Tax Mode (taxInclusive),
 * and Branch Default VAT Rate — as configured in Branch Settings > Tax
 * Configuration (owned by BranchTaxConfiguration, NOT POS Settings; see
 * api/branchTaxApi.js). This is the single shared source used by every
 * sales/pricing flow (POS, Sales Invoice, Quotation, Sales Order, Price
 * Check, Layaway, Proforma, Delivery Note). Returns null only if the setting
 * cannot be fetched at all (e.g. network error).
 *
 * Pass the currently active/selected branch id explicitly whenever the
 * caller has one (e.g. useBranch()'s activeBranch.id) — omitting it falls
 * back to the backend's "current branch" resolution, which is now
 * BranchContextHolder-aware (see BranchAccessService.getActiveBranchId) but
 * an explicit branchId is the more direct, unambiguous path.
 */
export const getBranchTaxSummary = async (branchId) => {
    try {
        return branchId != null
            ? await getBranchTaxConfigurationForBranch(branchId)
            : await getBranchTaxConfiguration();
    } catch (err) {
        console.warn("Failed to fetch branch tax configuration", err);
        return null;
    }
};

// ================= FILINGS =================

export const getTaxFilings = async () => {
    const res = await api.get("/api/financials/tax/filings");
    return res.data;
};

export const updateTaxFiling = async (id, payload) => {
    const res = await api.put(`/api/financials/tax/filings/${id}`, payload);
    return res.data;
};

export const uploadTaxDocument = async (filingId, file) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await api.post(`/api/financials/tax/filings/${filingId}/upload`, formData);
    return res.data;
};

export const deleteTaxDocument = async (filingId) => {
    const res = await api.delete(`/api/financials/tax/filings/${filingId}/document`);
    return res.data;
};

export const downloadTaxDocument = async (filingId) => {
    const res = await api.get(`/api/financials/tax/filings/${filingId}/document`, {
        responseType: 'blob',
    });
    return res.data;
};
